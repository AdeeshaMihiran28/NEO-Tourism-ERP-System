import { LeadStatus } from '../../../generated/prisma/enums';
import type { AuditService } from '../../audit/audit.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { LeadAttentionService } from './lead-attention.service';

describe('LeadAttentionService', () => {
  it('does not flag a Future Booking before its scheduled follow-up', async () => {
    const lead = {
      id: 'lead-1',
      status: LeadStatus.TRAVEL_IN_FUTURE,
      assignedUserId: 'agent-1',
      assignedAt: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
      lastMeaningfulActivityAt: new Date('2026-01-01'),
      isAttentionRequired: false,
      attentionReason: null,
      customer: { firstName: 'Future', lastName: 'Customer' },
    };
    const updateMany = jest.fn();
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue(lead),
        updateMany,
      },
      followUp: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      },
    } as unknown as PrismaService;
    const service = new LeadAttentionService(
      prisma,
      {} as AuditService,
      {} as NotificationsService,
    );

    await service.evaluateLeadAttention('lead-1', new Date('2026-11-18'));

    expect(updateMany).not.toHaveBeenCalled();
  });
});
