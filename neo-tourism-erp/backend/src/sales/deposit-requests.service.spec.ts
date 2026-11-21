import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  BookingPaymentType,
  DepositRequestStatus,
  SaleSubmissionStatus,
} from '../../generated/prisma/enums';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { DepositRequestsController } from './deposit-requests.controller';
import { DepositRequestsService } from './deposit-requests.service';

const salesUser: AuthenticatedUser = {
  id: 'sales-1',
  email: 'sales@example.test',
  firstName: 'Sales',
  lastName: 'Advisor',
  isActive: true,
  department: 'Sales',
  roles: ['Sales'],
  permissions: ['deposit.request.create', 'deposit.request.view_own'],
};

const paymentCard = {
  id: 'submission-1',
  leadId: 'lead-1',
  customerId: 'customer-1',
  submittedByUserId: salesUser.id,
  destination: 'London',
  travelStartDate: new Date('2027-01-10T00:00:00.000Z'),
  travelEndDate: new Date('2027-01-20T00:00:00.000Z'),
  estimatedCostOfSale: new Prisma.Decimal('700.00'),
  sellingPrice: new Prisma.Decimal('1000.00'),
  initialPaymentAmount: new Prisma.Decimal('200.00'),
  finalBalancePaymentDate: new Date('2026-12-31T00:00:00.000Z'),
  paymentArrangementNotes: 'Card terms',
  currency: 'GBP',
  paymentType: BookingPaymentType.DEPOSIT,
  status: SaleSubmissionStatus.DRAFT,
  depositRequest: null,
  customer: { firstName: 'Test', lastName: 'Customer' },
};

describe('DepositRequestsService', () => {
  it('requires explicit management permission for approval decisions', () => {
    const target = Object.getOwnPropertyDescriptor(
      DepositRequestsController.prototype,
      'decide',
    )?.value as object;
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, target) as
      string[] | undefined;

    expect(permissions).toEqual(['deposit.approval.decide']);
  });

  it('creates one frozen approval snapshot without creating a Booking', async () => {
    const created: Array<Record<string, unknown>> = [];
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
      created.push(data);
      return Promise.resolve({
        id: 'deposit-1',
        ...data,
        cancellationCost: new Prisma.Decimal(String(data.cancellationCost)),
        netFare: paymentCard.estimatedCostOfSale,
        sellingFare: paymentCard.sellingPrice,
        initialPaymentAmount: paymentCard.initialPaymentAmount,
        status: DepositRequestStatus.PENDING_APPROVAL,
      });
    });
    const transaction = {
      saleSubmission: { findUnique: jest.fn().mockResolvedValue(paymentCard) },
      depositRequest: { create },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { create: jest.fn() },
    };
    const service = new DepositRequestsService(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      { create: jest.fn() } as unknown as NotificationsService,
    );

    await service.create(
      paymentCard.id,
      {
        passengerCount: 2,
        cancellationCost: '75.50',
        arrangementNotes: 'Manual approval requested',
      },
      salesUser,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({
      customerId: paymentCard.customerId,
      leadId: paymentCard.leadId,
      destination: paymentCard.destination,
      netFare: paymentCard.estimatedCostOfSale,
      sellingFare: paymentCard.sellingPrice,
      initialPaymentAmount: paymentCard.initialPaymentAmount,
      passengerCount: 2,
      cancellationCost: '75.50',
    });
    expect(transaction.booking.create).not.toHaveBeenCalled();
  });

  it('rejects a request for another advisor Payment Card', async () => {
    const transaction = {
      saleSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          ...paymentCard,
          submittedByUserId: 'another-advisor',
        }),
      },
    };
    const service = new DepositRequestsService(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {} as AuditService,
      {} as NotificationsService,
    );

    await expect(
      service.create(
        paymentCard.id,
        { passengerCount: 1, cancellationCost: '0' },
        salesUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records an authorized decision with an atomic pending-state update', async () => {
    const current = {
      id: 'deposit-1',
      saleSubmissionId: paymentCard.id,
      requestedByUserId: salesUser.id,
      destination: paymentCard.destination,
      status: DepositRequestStatus.PENDING_APPROVAL,
    };
    const updates: Array<{
      where: { id: string; status: DepositRequestStatus };
      data: {
        status: DepositRequestStatus;
        decidedByUserId: string;
        decidedAt: Date;
        decisionNotes: string | null;
      };
    }> = [];
    const updateMany = jest.fn((input: (typeof updates)[number]) => {
      updates.push(input);
      return Promise.resolve({ count: 1 });
    });
    const transaction = {
      depositRequest: {
        findUnique: jest.fn().mockResolvedValue(current),
        updateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...current,
          status: DepositRequestStatus.APPROVED,
        }),
      },
    };
    const manager = {
      ...salesUser,
      id: 'manager-1',
      permissions: ['deposit.approval.view', 'deposit.approval.decide'],
    };
    const service = new DepositRequestsService(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      { create: jest.fn() } as unknown as NotificationsService,
    );

    await service.decide(
      current.id,
      { decision: 'APPROVED', notes: 'Reviewed' },
      manager,
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({
      where: {
        id: current.id,
        status: DepositRequestStatus.PENDING_APPROVAL,
      },
      data: {
        status: DepositRequestStatus.APPROVED,
        decidedByUserId: manager.id,
        decisionNotes: 'Reviewed',
        decidedAt: updates[0].data.decidedAt,
      },
    });
    expect(updates[0].data.decidedAt).toBeInstanceOf(Date);
  });

  it('rejects duplicate decisions and rejection without a reason', async () => {
    const transaction = {
      depositRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'deposit-1',
          status: DepositRequestStatus.APPROVED,
        }),
      },
    };
    const service = new DepositRequestsService(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {} as AuditService,
      {} as NotificationsService,
    );

    await expect(
      service.decide('deposit-1', { decision: 'REJECTED' }, salesUser),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.decide('deposit-1', { decision: 'APPROVED' }, salesUser),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
