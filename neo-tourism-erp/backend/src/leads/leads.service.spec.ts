import { ConflictException, ForbiddenException } from '@nestjs/common';
import { LeadStatus } from '../../generated/prisma/enums';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';
import type { LeadAttentionService } from './services/lead-attention.service';

describe('LeadsService creation', () => {
  function service() {
    let createdInput: unknown;
    const lead = {
      id: 'lead-1',
      customerId: 'customer-1',
      assignedUserId: null,
      assignedAt: null,
      status: LeadStatus.NEW,
      source: 'Website',
      destination: 'Tokyo',
      receivedAt: new Date('2026-11-18T04:30:00.000Z'),
      travelDate: new Date('2027-01-10T00:00:00.000Z'),
      travelEndDate: new Date('2027-01-20T00:00:00.000Z'),
      summary: 'Family holiday',
      salesNotes: null,
      nextActionAt: null,
      lastMeaningfulActivityAt: null,
      isAttentionRequired: false,
      attentionReason: null,
      attentionSince: null,
      customer: { id: 'customer-1', firstName: 'Test', lastName: 'Customer' },
      assignedUser: null,
    };
    const transaction = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
      lead: {
        create: jest.fn((input: unknown) => {
          createdInput = input;
          return Promise.resolve(lead);
        }),
      },
      leadActivity: {
        create: jest.fn().mockResolvedValue({ id: 'activity-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const audit = { log: jest.fn() } as unknown as AuditService;
    const notifications = {} as NotificationsService;
    const attention = {} as LeadAttentionService;
    return {
      leads: new LeadsService(prisma, audit, notifications, attention),
      transaction,
      getCreatedInput: () => createdInput,
    };
  }

  it('persists received time, Marketing Medium and both travel dates', async () => {
    const { leads, getCreatedInput } = service();

    await leads.create(
      {
        customerId: 'customer-1',
        receivedAt: '2026-11-18T10:00:00+05:30',
        source: 'Website',
        destination: 'Tokyo',
        travelDate: '2027-01-10',
        travelEndDate: '2027-01-20',
        summary: 'Family holiday',
      },
      'user-1',
    );

    const createInput = getCreatedInput() as {
      data: {
        source: string;
        receivedAt: Date;
        travelDate: Date;
        travelEndDate: Date;
      };
    };
    expect(createInput.data).toEqual(
      expect.objectContaining({
        source: 'Website',
        receivedAt: new Date('2026-11-18T04:30:00.000Z'),
        travelDate: new Date('2027-01-10T00:00:00.000Z'),
        travelEndDate: new Date('2027-01-20T00:00:00.000Z'),
      }),
    );
  });

  it('rejects a travel end date before the start date', async () => {
    const { leads, transaction } = service();

    await expect(
      leads.create(
        {
          customerId: 'customer-1',
          travelDate: '2027-01-20',
          travelEndDate: '2027-01-10',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.lead.create).not.toHaveBeenCalled();
  });
});

describe('LeadsService claiming', () => {
  function service(claimedCount: number) {
    let updateInput: unknown;
    const lead = {
      id: 'lead-1',
      assignedUserId: 'agent-1',
      status: LeadStatus.FOLLOW_UP,
      customer: { firstName: 'Test', lastName: 'Customer' },
      assignedUser: null,
    };
    const transaction = {
      lead: {
        updateMany: jest.fn((input: unknown) => {
          updateInput = input;
          return Promise.resolve({ count: claimedCount });
        }),
        findUnique: jest.fn().mockResolvedValue({ id: 'lead-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(lead),
      },
      leadActivity: {
        create: jest.fn().mockResolvedValue({ id: 'activity-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const audit = { log: jest.fn() } as unknown as AuditService;
    const notifications = {
      create: jest.fn(),
    } as unknown as NotificationsService;
    const attention = {
      evaluateLeadAttention: jest.fn(),
    } as unknown as LeadAttentionService;
    return {
      leads: new LeadsService(prisma, audit, notifications, attention),
      transaction,
      getUpdateInput: () => updateInput,
    };
  }

  it('claims only an unassigned NEW lead for the authenticated agent', async () => {
    const { leads, getUpdateInput } = service(1);

    await leads.claim('lead-1', 'agent-1');

    const update = getUpdateInput() as {
      where: { id: string; status: LeadStatus; assignedUserId: null };
      data: { assignedUserId: string; status: LeadStatus };
    };
    expect(update.where).toEqual({
      id: 'lead-1',
      status: LeadStatus.NEW,
      assignedUserId: null,
    });
    expect(update.data).toMatchObject({
      assignedUserId: 'agent-1',
      status: LeadStatus.FOLLOW_UP,
    });
  });

  it('returns a conflict when the atomic conditional update loses the claim', async () => {
    const { leads, transaction } = service(0);

    await expect(leads.claim('lead-1', 'agent-2')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.lead.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(transaction.leadActivity.create).not.toHaveBeenCalled();
  });
});

describe('LeadsService reassignment', () => {
  it('preserves status and restricts the new owner to an eligible Sales user', async () => {
    let ownerQuery: unknown;
    let updateInput: unknown;
    const existing = {
      id: 'lead-1',
      assignedUserId: 'agent-1',
      status: LeadStatus.QUOTING,
      isAttentionRequired: false,
      customer: { firstName: 'Test', lastName: 'Customer' },
    };
    const transaction = {
      lead: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn((input: unknown) => {
          updateInput = input;
          return Promise.resolve({ ...existing, assignedUserId: 'agent-2' });
        }),
      },
      user: {
        findFirst: jest.fn((input: unknown) => {
          ownerQuery = input;
          return Promise.resolve({
            id: 'agent-2',
            firstName: 'New',
            lastName: 'Advisor',
            email: 'advisor@example.com',
          });
        }),
      },
      followUp: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      leadActivity: {
        create: jest.fn().mockResolvedValue({ id: 'activity-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const audit = { log: jest.fn() } as unknown as AuditService;
    const notifications = {
      create: jest.fn(),
    } as unknown as NotificationsService;
    const attention = {} as LeadAttentionService;
    const leads = new LeadsService(prisma, audit, notifications, attention);
    const manager: AuthenticatedUser = {
      id: 'manager-1',
      email: 'manager@example.com',
      firstName: 'Sales',
      lastName: 'Manager',
      isActive: true,
      department: 'Sales',
      roles: ['MANAGER'],
      permissions: ['lead.reassign'],
    };

    await leads.reassign(
      'lead-1',
      { newAssignedUserId: 'agent-2', reason: 'Workload balance' },
      manager,
    );

    const query = ownerQuery as {
      where: { id: string; isActive: boolean; department: { name: string } };
    };
    expect(query.where).toMatchObject({
      id: 'agent-2',
      isActive: true,
      department: { name: 'Sales' },
    });
    const update = updateInput as {
      data: { assignedUserId: string; assignedAt: Date; status?: LeadStatus };
    };
    expect(update.data.assignedUserId).toBe('agent-2');
    expect(update.data.assignedAt).toBeInstanceOf(Date);
    expect(update.data.status).toBeUndefined();
    expect(existing.status).toBe(LeadStatus.QUOTING);
  });
});

describe('LeadsService status history', () => {
  const user: AuthenticatedUser = {
    id: 'agent-1',
    email: 'agent@example.com',
    firstName: 'Agent',
    lastName: 'One',
    isActive: true,
    department: 'Sales',
    roles: ['SALES'],
    permissions: ['lead.view', 'lead.change_status'],
  };

  function service(existingStatus: LeadStatus) {
    let activityInput: unknown;
    let auditInput: unknown;
    const transaction = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lead-1',
          assignedUserId: user.id,
          status: existingStatus,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'lead-1',
          assignedUserId: user.id,
          status: LeadStatus.GOING_TO_BOOK,
        }),
      },
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
    const audit = {
      log: jest.fn((input: unknown) => {
        auditInput = input;
        return Promise.resolve();
      }),
    } as unknown as AuditService;
    const notifications = {} as NotificationsService;
    const attention = {
      clearAttentionWhenResolved: jest.fn(),
    } as unknown as LeadAttentionService;
    return {
      leads: new LeadsService(prisma, audit, notifications, attention),
      transaction,
      getActivityInput: () => activityInput,
      getAuditInput: () => auditInput,
    };
  }

  it('records old and new values for a confirmed status change', async () => {
    const { leads, getActivityInput, getAuditInput } = service(
      LeadStatus.FOLLOW_UP,
    );

    await leads.updateStatus(
      'lead-1',
      { status: LeadStatus.GOING_TO_BOOK },
      user,
    );

    const activity = getActivityInput() as {
      data: { metadata: { oldStatus: LeadStatus; newStatus: LeadStatus } };
    };
    expect(activity.data.metadata).toEqual({
      oldStatus: LeadStatus.FOLLOW_UP,
      newStatus: LeadStatus.GOING_TO_BOOK,
    });
    const audit = getAuditInput() as {
      oldValues: { status: LeadStatus };
      newValues: { status: LeadStatus };
    };
    expect(audit.oldValues).toEqual({ status: LeadStatus.FOLLOW_UP });
    expect(audit.newValues).toEqual({ status: LeadStatus.GOING_TO_BOOK });
  });

  it('prevents direct changes away from Sale Done', async () => {
    const { leads, transaction } = service(LeadStatus.SALE_MADE);

    await expect(
      leads.updateStatus('lead-1', { status: LeadStatus.NOT_INTERESTED }, user),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.lead.update).not.toHaveBeenCalled();
    expect(transaction.leadActivity.create).not.toHaveBeenCalled();
  });
});

describe('LeadsService quotations', () => {
  it('records each quotation as an owned lead activity without changing status', async () => {
    let activityInput: unknown;
    let leadUpdateInput: unknown;
    const user: AuthenticatedUser = {
      id: 'agent-1',
      email: 'agent@example.com',
      firstName: 'Agent',
      lastName: 'One',
      isActive: true,
      department: 'Sales',
      roles: ['SALES'],
      permissions: ['lead.edit'],
    };
    const transaction = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lead-1',
          assignedUserId: user.id,
          status: LeadStatus.FOLLOW_UP,
        }),
        update: jest.fn((input: unknown) => {
          leadUpdateInput = input;
          return Promise.resolve({ id: 'lead-1' });
        }),
      },
      leadActivity: {
        create: jest.fn((input: unknown) => {
          activityInput = input;
          return Promise.resolve({ id: 'quote-1' });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const attention = {
      clearAttentionWhenResolved: jest.fn(),
    } as unknown as LeadAttentionService;
    const service = new LeadsService(
      prisma,
      { log: jest.fn() } as unknown as AuditService,
      {} as NotificationsService,
      attention,
    );

    await service.createQuotation(
      'lead-1',
      {
        itinerary: 'CMB – DXB – LHR',
        netFare: '125000.00',
        quotedSellingFare: '145000.00',
        notes: 'Baggage included',
      },
      user,
    );

    expect(activityInput).toMatchObject({
      data: {
        leadId: 'lead-1',
        metadata: {
          kind: 'QUOTATION',
          itinerary: 'CMB – DXB – LHR',
          netFare: '125000.00',
          quotedSellingFare: '145000.00',
        },
      },
    });
    const leadUpdate = leadUpdateInput as {
      where: { id: string };
      data: { lastMeaningfulActivityAt: Date; status?: LeadStatus };
    };
    expect(leadUpdate.where.id).toBe('lead-1');
    expect(leadUpdate.data.lastMeaningfulActivityAt).toBeInstanceOf(Date);
    expect(leadUpdate.data.status).toBeUndefined();
  });

  it('rejects quotations from a user who does not own the lead', async () => {
    const transaction = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lead-1',
          assignedUserId: 'agent-1',
          status: LeadStatus.FOLLOW_UP,
        }),
      },
      leadActivity: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const service = new LeadsService(
      prisma,
      {} as AuditService,
      {} as NotificationsService,
      {} as LeadAttentionService,
    );
    const otherUser: AuthenticatedUser = {
      id: 'agent-2',
      email: 'other@example.com',
      firstName: 'Other',
      lastName: 'Agent',
      isActive: true,
      department: 'Sales',
      roles: ['SALES'],
      permissions: ['lead.edit'],
    };

    await expect(
      service.createQuotation(
        'lead-1',
        {
          itinerary: 'Restricted itinerary',
          netFare: '100.00',
          quotedSellingFare: '120.00',
        },
        otherUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.leadActivity.create).not.toHaveBeenCalled();
  });
});
