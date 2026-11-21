import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  SaleProductCategory,
  SaleProductReferenceType,
  BookingPaymentType,
  SalePaymentEntryStatus,
  SalePaymentMethod,
  SaleSubmissionStatus,
} from '../../generated/prisma/enums';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SalesService } from './sales.service';

const owner: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.test',
  firstName: 'Sales',
  lastName: 'Owner',
  isActive: true,
  department: 'Sales',
  roles: ['Sales Agent'],
  permissions: ['sale.view_own', 'sale.edit_own'],
};

describe('SalesService Payment Card products', () => {
  function setup(submittedByUserId = owner.id) {
    const createdProducts: unknown[] = [];
    const transaction = {
      saleSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          leadId: 'lead-1',
          submittedByUserId,
          status: SaleSubmissionStatus.DRAFT,
        }),
      },
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }),
      },
      saleSubmissionProduct: {
        create: jest.fn((input: { data: Record<string, unknown> }) => {
          createdProducts.push(input.data);
          return Promise.resolve({
            id: `product-${createdProducts.length}`,
            ...input.data,
            estimatedSupplierCost: new Prisma.Decimal('125.50'),
            pnrText: input.data.pnrText ?? null,
            notes: input.data.notes ?? null,
            supplier: {
              id: 'supplier-1',
              name: 'Test Air',
              supplierType: 'AIRLINE',
            },
            references: [],
            attachments: [],
          });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const audit = { log: jest.fn() } as unknown as AuditService;
    const notifications = {} as NotificationsService;
    return {
      sales: new SalesService(prisma, audit, notifications),
      transaction,
      createdProducts,
    };
  }

  it('allows multiple products in one category and preserves multiline PNR text', async () => {
    const { sales, createdProducts } = setup();
    const input = {
      category: SaleProductCategory.INTERNATIONAL_FLIGHT,
      description: 'Colombo to London',
      supplierId: 'supplier-1',
      estimatedSupplierCost: '125.50',
      pnrText: 'RP/CMBTEST\n  1. TEST/JOHN\n  QR 665',
      references: [
        { type: SaleProductReferenceType.PNR, value: 'ABC123' },
        {
          type: SaleProductReferenceType.AMADEUS_REFERENCE,
          value: 'AMA-456',
        },
      ],
    };

    await sales.createProduct('submission-1', input, owner);
    await sales.createProduct('submission-1', input, owner);

    expect(createdProducts).toHaveLength(2);
    expect(createdProducts[0]).toMatchObject({
      category: SaleProductCategory.INTERNATIONAL_FLIGHT,
      supplierId: 'supplier-1',
      estimatedSupplierCost: '125.50',
      pnrText: input.pnrText,
      references: {
        create: [
          { type: SaleProductReferenceType.PNR, value: 'ABC123' },
          {
            type: SaleProductReferenceType.AMADEUS_REFERENCE,
            value: 'AMA-456',
          },
        ],
      },
    });
  });

  it('rejects product changes by a user who does not own the draft', async () => {
    const { sales, transaction } = setup('different-owner');

    await expect(
      sales.createProduct(
        'submission-1',
        {
          category: SaleProductCategory.HOTEL,
          description: 'Two nights',
        },
        owner,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.saleSubmissionProduct.create.mock.calls).toHaveLength(0);
  });
});

describe('SalesService attachment access', () => {
  it('rejects spoofed screenshot content before writing to the database', async () => {
    const transaction = jest.fn();
    const sales = new SalesService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as AuditService,
      {} as NotificationsService,
    );

    await expect(
      sales.addProductAttachment(
        'submission-1',
        'product-1',
        {
          originalname: 'fake.png',
          mimetype: 'image/png',
          size: 4,
          buffer: Buffer.from('fake'),
        },
        owner,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.mock.calls).toHaveLength(0);
  });

  it('rejects attachment reads for unauthorized users before loading bytes', async () => {
    const attachmentFind = jest.fn();
    const prisma = {
      saleSubmission: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ submittedByUserId: 'owner-1' }),
      },
      saleProductAttachment: { findFirst: attachmentFind },
    } as unknown as PrismaService;
    const sales = new SalesService(
      prisma,
      {} as AuditService,
      {} as NotificationsService,
    );
    const outsider = {
      ...owner,
      id: 'outsider-1',
      permissions: ['sale.view_own'],
    };

    await expect(
      sales.getProductAttachment(
        'submission-1',
        'product-1',
        'attachment-1',
        outsider,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(attachmentFind.mock.calls).toHaveLength(0);
  });
});

describe('SalesService Payment Card payment intake', () => {
  function setup() {
    const createdPayments: Array<Record<string, unknown>> = [];
    const createdInstallments: Array<Record<string, unknown>> = [];
    const transaction = {
      saleSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          leadId: 'lead-1',
          submittedByUserId: owner.id,
          status: SaleSubmissionStatus.DRAFT,
        }),
      },
      salePaymentEntry: {
        create: jest.fn((input: { data: Record<string, unknown> }) => {
          createdPayments.push(input.data);
          return Promise.resolve({
            id: `payment-${createdPayments.length}`,
            ...input.data,
            amount: new Prisma.Decimal(String(input.data.amount)),
            evidence: [],
          });
        }),
      },
      saleInstallment: {
        create: jest.fn((input: { data: Record<string, unknown> }) => {
          createdInstallments.push(input.data);
          return Promise.resolve({
            id: `installment-${createdInstallments.length}`,
            ...input.data,
            amount: new Prisma.Decimal(String(input.data.amount)),
          });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const sales = new SalesService(
      prisma,
      { log: jest.fn() } as unknown as AuditService,
      {} as NotificationsService,
    );
    return { sales, transaction, createdPayments, createdInstallments };
  }

  it.each([
    SalePaymentMethod.BANK_TRANSFER,
    SalePaymentMethod.STRIPE_PAYMENT,
    SalePaymentMethod.WISE_CARD_PAYMENT,
    SalePaymentMethod.CASH,
  ])('records the confirmed payment method %s', async (method) => {
    const { sales, createdPayments } = setup();

    await sales.createPaymentEntry(
      'submission-1',
      { method, amount: '100.25', paymentDate: '2026-11-18' },
      owner,
    );

    expect(createdPayments[0]).toMatchObject({
      method,
      amount: '100.25',
      status: SalePaymentEntryStatus.RECORDED,
    });
  });

  it('keeps planned installments separate from actual payment entries', async () => {
    const { sales, transaction, createdInstallments } = setup();

    await sales.createInstallment(
      'submission-1',
      { amount: '250.00', dueDate: '2026-12-15' },
      owner,
    );

    expect(createdInstallments).toHaveLength(1);
    expect(transaction.salePaymentEntry.create.mock.calls).toHaveLength(0);
  });

  it('rejects an inconsistent installment schedule before submission', async () => {
    const submission = {
      id: 'submission-1',
      leadId: 'lead-1',
      customerId: 'customer-1',
      submittedByUserId: owner.id,
      destination: 'London',
      travelStartDate: new Date('2027-01-10T00:00:00.000Z'),
      travelEndDate: null,
      sellingPrice: new Prisma.Decimal('1000.00'),
      estimatedCostOfSale: new Prisma.Decimal('700.00'),
      depositAmount: null,
      paymentType: BookingPaymentType.DEPOSIT,
      initialPaymentAmount: new Prisma.Decimal('200.00'),
      finalBalancePaymentDate: new Date('2026-12-31T00:00:00.000Z'),
      currency: 'GBP',
      paymentMethod: null,
      paymentReference: null,
      paymentArrangementNotes: null,
      salesNotes: null,
      passengerInformation: null,
      status: SaleSubmissionStatus.DRAFT,
      submittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      products: [
        {
          supplierId: 'supplier-1',
          estimatedSupplierCost: new Prisma.Decimal('700.00'),
        },
      ],
      paymentEntries: [],
      installments: [{ amount: new Prisma.Decimal('500.00') }],
      customer: { firstName: 'Test', lastName: 'Customer' },
      submittedBy: { firstName: 'Sales', lastName: 'Owner' },
      lead: {},
      booking: null,
    };
    const transaction = {
      saleSubmission: { findUnique: jest.fn().mockResolvedValue(submission) },
    };
    const sales = new SalesService(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {} as AuditService,
      {} as NotificationsService,
    );

    await expect(sales.submit('submission-1', owner)).rejects.toThrow(
      'Payment schedule discrepancy',
    );
  });

  it('rejects repeated submission without creating another record', async () => {
    const updateMany = jest.fn();
    const transaction = {
      saleSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          submittedByUserId: owner.id,
          status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN,
        }),
        updateMany,
      },
    };
    const sales = new SalesService(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {} as AuditService,
      {} as NotificationsService,
    );

    await expect(sales.submit('submission-1', owner)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(updateMany.mock.calls).toHaveLength(0);
  });

  it('submits a complete Payment Card without recreating its child records', async () => {
    const submission = {
      id: 'submission-1',
      leadId: 'lead-1',
      customerId: 'customer-1',
      submittedByUserId: owner.id,
      destination: 'London',
      travelStartDate: new Date('2027-01-10T00:00:00.000Z'),
      travelEndDate: null,
      sellingPrice: new Prisma.Decimal('1000.00'),
      estimatedCostOfSale: new Prisma.Decimal('700.00'),
      depositAmount: null,
      paymentType: BookingPaymentType.DEPOSIT,
      initialPaymentAmount: new Prisma.Decimal('200.00'),
      finalBalancePaymentDate: new Date('2026-12-31T00:00:00.000Z'),
      currency: 'GBP',
      paymentMethod: null,
      paymentReference: null,
      paymentArrangementNotes: null,
      salesNotes: null,
      passengerInformation: null,
      status: SaleSubmissionStatus.DRAFT,
      submittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      products: [
        {
          supplierId: 'supplier-1',
          estimatedSupplierCost: new Prisma.Decimal('700.00'),
        },
      ],
      paymentEntries: [{ id: 'payment-1' }],
      installments: [{ amount: new Prisma.Decimal('800.00') }],
      customer: { firstName: 'Test', lastName: 'Customer' },
      submittedBy: { firstName: 'Sales', lastName: 'Owner' },
      lead: {},
      booking: null,
    };
    const updateMany = jest.fn(
      (input: {
        where: { id: string; status: SaleSubmissionStatus };
        data: { status: SaleSubmissionStatus; submittedAt: Date };
      }) => {
        expect(input.data.submittedAt).toBeInstanceOf(Date);
        return Promise.resolve({ count: 1 });
      },
    );
    const transaction = {
      saleSubmission: {
        findUnique: jest.fn().mockResolvedValue(submission),
        updateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...submission,
          status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN,
        }),
      },
      lead: { update: jest.fn() },
      leadActivity: { create: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      saleSubmissionProduct: { create: jest.fn() },
      salePaymentEntry: { create: jest.fn() },
      saleInstallment: { create: jest.fn() },
    };
    const sales = new SalesService(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      { create: jest.fn() } as unknown as NotificationsService,
    );

    const result = await sales.submit('submission-1', owner);

    expect(result.status).toBe(SaleSubmissionStatus.SUBMITTED_TO_ADMIN);
    expect(updateMany.mock.calls).toHaveLength(1);
    const update = updateMany.mock.calls[0][0];
    expect(update).toMatchObject({
      where: { id: 'submission-1', status: SaleSubmissionStatus.DRAFT },
      data: {
        status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN,
      },
    });
    expect(update.data.submittedAt).toBeInstanceOf(Date);
    expect(transaction.saleSubmissionProduct.create.mock.calls).toHaveLength(0);
    expect(transaction.salePaymentEntry.create.mock.calls).toHaveLength(0);
    expect(transaction.saleInstallment.create.mock.calls).toHaveLength(0);
  });
});
