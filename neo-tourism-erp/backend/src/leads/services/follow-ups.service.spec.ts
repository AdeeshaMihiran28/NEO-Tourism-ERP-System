import {
  FollowUpStatus,
  FollowUpType,
  LeadStatus,
} from '../../../generated/prisma/enums';
import type { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../auth/auth.types';
import type { PrismaService } from '../../prisma/prisma.service';
import { FollowUpsService } from './follow-ups.service';
import type { LeadAttentionService } from './lead-attention.service';

describe('FollowUpsService rescheduling', () => {
  it('keeps the follow-up and records its old and new schedule', async () => {
    let activityInput: unknown;
    const user: AuthenticatedUser = {
      id: 'agent-1',
      email: 'agent@example.com',
      firstName: 'Agent',
      lastName: 'One',
      isActive: true,
      department: 'Sales',
      roles: ['SALES'],
      permissions: ['followup.edit'],
    };
    const existing = {
      id: 'follow-1',
      leadId: 'lead-1',
      assignedUserId: user.id,
      type: FollowUpType.CALLBACK,
      scheduledAt: new Date('2099-01-01T10:00:00.000Z'),
      note: 'Call customer',
      status: FollowUpStatus.SCHEDULED,
      completedAt: null,
      completedById: null,
      lead: { assignedUserId: user.id, status: LeadStatus.FOLLOW_UP },
    };
    const transaction = {
      followUp: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({
          ...existing,
          scheduledAt: new Date('2099-01-02T10:00:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue({
          scheduledAt: new Date('2099-01-02T10:00:00.000Z'),
        }),
      },
      lead: { update: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
      leadActivity: {
        create: jest.fn((input: unknown) => {
          activityInput = input;
          return Promise.resolve({ id: 'activity-1' });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const service = new FollowUpsService(
      prisma,
      { log: jest.fn() } as unknown as AuditService,
      { evaluateLeadAttention: jest.fn() } as unknown as LeadAttentionService,
    );

    await service.update(
      'follow-1',
      { scheduledAt: '2099-01-02T10:00:00.000Z' },
      user,
    );

    expect(activityInput).toMatchObject({
      data: {
        description: 'Follow-up rescheduled.',
        metadata: {
          oldScheduledAt: '2099-01-01T10:00:00.000Z',
          newScheduledAt: '2099-01-02T10:00:00.000Z',
        },
      },
    });
  });
});
