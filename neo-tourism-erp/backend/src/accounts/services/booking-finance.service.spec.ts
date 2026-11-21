import { Prisma } from '../../../generated/prisma/client';
import type { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../auth/auth.types';
import type { BookingLifecycleService } from '../../bookings/services/booking-lifecycle.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AccountingControlsService } from './accounting-controls.service';
import type { BankingService } from './banking.service';
import { BookingFinanceService } from './booking-finance.service';
import type { GeneralLedgerService } from './general-ledger.service';

describe('BookingFinanceService Batch 07 customer payment history', () => {
  it('persists the supplied historical GBP, fee, due-date and idempotency values', async () => {
    const created: Record<string, unknown>[] = [];
    const payment = {
      id: 'payment-1',
      bookingId: 'booking-1',
      amount: new Prisma.Decimal('250'),
      currency: 'EUR',
      status: 'RECEIVED',
      paymentReference: 'BANK-123',
      paymentDate: new Date('2026-11-01'),
      dueDate: new Date('2026-11-15'),
      recordedGbpAmount: new Prisma.Decimal('215'),
      recordedGbpRate: new Prisma.Decimal('0.86'),
      transactionFee: new Prisma.Decimal('2.50'),
      feeCurrency: 'GBP',
      idempotencyKey: 'customer-payment-1',
      customerInvoiceId: null,
    };
    const tx = {
      passengerPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve(payment);
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...payment,
          booking: { customerId: 'customer-1' },
          bankTransaction: null,
        }),
      },
      booking: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          sellingPrice: new Prisma.Decimal('1000'),
          currency: 'GBP',
          passengerPayments: [],
        }),
      },
    };
    const audited: Array<{
      action?: string;
      newValues?: Record<string, unknown>;
    }> = [];
    const audit = {
      log: jest.fn(
        (event: { action?: string; newValues?: Record<string, unknown> }) => {
          audited.push(event);
          return Promise.resolve();
        },
      ),
    };
    const service = new BookingFinanceService(
      {
        booking: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'booking-1', folderStatus: 'OPEN' }),
        },
        passengerPayment: { findUnique: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as NotificationsService,
      {} as BookingLifecycleService,
      { linkCustomerReceipt: jest.fn() } as unknown as BankingService,
      { postAutomatic: jest.fn() } as unknown as GeneralLedgerService,
      {
        valuation: jest.fn().mockResolvedValue({
          exchangeRate: new Prisma.Decimal('4.25'),
          baseCurrency: 'LKR',
          baseAmount: new Prisma.Decimal('1062.50'),
        }),
      } as unknown as AccountingControlsService,
    );
    const user: AuthenticatedUser = {
      id: 'finance-user',
      email: 'finance@example.test',
      firstName: 'Finance',
      lastName: 'User',
      isActive: true,
      department: 'Accounts',
      roles: ['ACCOUNTS'],
      permissions: ['finance.payment.create'],
    };

    await service.createPassengerPayment(
      'booking-1',
      {
        amount: '250',
        currency: 'eur',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'BANK-123',
        paymentDate: '2026-11-01',
        dueDate: '2026-11-15',
        recordedGbpAmount: '215',
        recordedGbpRate: '0.86',
        transactionFee: '2.50',
        feeCurrency: 'gbp',
        idempotencyKey: 'customer-payment-1',
      },
      user,
      {},
    );

    expect(created[0]).toMatchObject({
      dueDate: new Date('2026-11-15'),
      recordedGbpAmount: new Prisma.Decimal('215'),
      recordedGbpRate: new Prisma.Decimal('0.86'),
      transactionFee: new Prisma.Decimal('2.50'),
      feeCurrency: 'GBP',
      idempotencyKey: 'customer-payment-1',
    });
    expect(audited[0]).toMatchObject({
      action: 'PASSENGER_PAYMENT_CREATED',
      newValues: {
        recordedGbpAmount: '215',
        recordedGbpRate: '0.86',
        transactionFee: '2.5',
        feeCurrency: 'GBP',
        idempotencyKey: 'customer-payment-1',
      },
    });
  });

  it('converts supplier payment edit values before sending them to Prisma', async () => {
    const updated: Record<string, unknown>[] = [];
    const old = {
      id: 'supplier-payment-1',
      bookingId: 'booking-1',
      bookingSupplierId: 'booking-supplier-1',
      supplierInvoiceId: null,
      amount: new Prisma.Decimal('250'),
      currency: 'EUR',
      paymentMethod: 'OTHER',
      paymentReference: null,
      paymentDate: new Date('2026-11-01'),
      dueDate: null,
      recordedGbpAmount: null,
      recordedGbpRate: null,
      transactionFee: null,
      feeCurrency: null,
      idempotencyKey: null,
      status: 'PENDING',
    };
    const tx = {
      supplierPayment: {
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          updated.push(data);
          return Promise.resolve({ ...old, ...data });
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(() =>
          Promise.resolve({ ...old, ...updated[0] }),
        ),
      },
      bookingSupplier: {
        findFirst: jest.fn().mockResolvedValue({
          supplierCost: new Prisma.Decimal('1000'),
          currency: 'EUR',
          booking: { currency: 'EUR' },
          payments: [],
        }),
      },
    };
    const service = new BookingFinanceService(
      {
        booking: {
          findUnique: jest.fn().mockResolvedValue({ folderStatus: 'OPEN' }),
        },
        supplierPayment: { findUnique: jest.fn().mockResolvedValue(old) },
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      {} as NotificationsService,
      {} as BookingLifecycleService,
      {
        assertSourcePaymentEditable: jest.fn(),
      } as unknown as BankingService,
      {
        assertSourceEditable: jest.fn(),
      } as unknown as GeneralLedgerService,
      {
        valuation: jest.fn().mockResolvedValue({
          exchangeRate: new Prisma.Decimal('4.25'),
          baseCurrency: 'LKR',
          baseAmount: new Prisma.Decimal('1062.50'),
        }),
      } as unknown as AccountingControlsService,
    );

    await service.updateSupplierPayment(
      old.id,
      {
        dueDate: '2026-11-15',
        recordedGbpAmount: '215',
        recordedGbpRate: '0.86',
        transactionFee: '2.50',
        feeCurrency: 'gbp',
      },
      {
        id: 'finance-user',
        email: 'finance@example.test',
        firstName: 'Finance',
        lastName: 'User',
        isActive: true,
        department: 'Accounts',
        roles: ['ACCOUNTS'],
        permissions: ['finance.payment.create'],
      },
      {},
    );

    expect(updated[0]).toMatchObject({
      dueDate: new Date('2026-11-15'),
      recordedGbpAmount: new Prisma.Decimal('215'),
      recordedGbpRate: new Prisma.Decimal('0.86'),
      transactionFee: new Prisma.Decimal('2.50'),
      feeCurrency: 'GBP',
    });
  });
});
