import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounts payments and reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let financeToken: string;
  let approverToken: string;
  let salesToken: string;
  let bookingId: string;
  let passengerPaymentId: string;
  let supplierPaymentId: string;
  let discrepancyId: string;
  let customerInvoiceId: string;
  let supplierInvoiceId: string;
  const suffix = Date.now();
  const password = 'AccountsTestPassword123!';
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const financeCodes = [
      'booking.view',
      'booking.view_all',
      'finance.view',
      'finance.edit',
      'finance.payment.create',
      'finance.payment.verify',
      'finance.adjustment.create',
      'finance.adjustment.approve',
      'finance.reconcile',
      'finance.discrepancy.manage',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: financeCodes } },
    });
    const [financeRole, salesRole] = await Promise.all([
      prisma.role.create({
        data: {
          name: `FINANCE_TEST_${suffix}`,
          permissions: {
            create: permissions.map((p) => ({ permissionId: p.id })),
          },
        },
      }),
      prisma.role.create({
        data: {
          name: `SALES_TEST_${suffix}`,
          permissions: {
            create: permissions
              .filter((p) => p.code === 'booking.view')
              .map((p) => ({ permissionId: p.id })),
          },
        },
      }),
    ]);
    ids.financeRole = financeRole.id;
    ids.salesRole = salesRole.id;
    const [accountsDepartment, salesDepartment] = await Promise.all([
      prisma.department.findUniqueOrThrow({ where: { name: 'Accounts' } }),
      prisma.department.findUniqueOrThrow({ where: { name: 'Sales' } }),
    ]);
    const hash = await bcrypt.hash(password, 4);
    const [financeUser, approverUser, salesUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `finance-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Finance',
          lastName: 'Tester',
          departmentId: accountsDepartment.id,
          roles: { create: { roleId: financeRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `finance-approver-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Finance',
          lastName: 'Approver',
          departmentId: accountsDepartment.id,
          roles: { create: { roleId: financeRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `sales-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Sales',
          lastName: 'Tester',
          departmentId: salesDepartment.id,
          roles: { create: { roleId: salesRole.id } },
        },
      }),
    ]);
    ids.financeUser = financeUser.id;
    ids.approverUser = approverUser.id;
    ids.salesUser = salesUser.id;
    const exchangeRate = await prisma.exchangeRate.create({
      data: {
        fromCurrency: 'GBP',
        toCurrency: 'LKR',
        rate: '400',
        effectiveDate: new Date('2026-01-02'),
        source: 'E2E fixture',
        createdById: financeUser.id,
        updatedById: financeUser.id,
      },
    });
    ids.exchangeRate = exchangeRate.id;
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Accounts',
        lastName: 'Customer',
        createdById: salesUser.id,
        updatedById: salesUser.id,
      },
    });
    ids.customer = customer.id;
    const lead = await prisma.lead.create({
      data: {
        customerId: customer.id,
        assignedUserId: salesUser.id,
        status: 'SALE_MADE',
        destination: 'London',
        createdById: salesUser.id,
      },
    });
    ids.lead = lead.id;
    const sale = await prisma.saleSubmission.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        submittedByUserId: salesUser.id,
        destination: 'London',
        travelStartDate: new Date('2026-10-10'),
        sellingPrice: '2300.10',
        currency: 'GBP',
        status: 'ADMIN_ACCEPTED',
      },
    });
    ids.sale = sale.id;
    const booking = await prisma.booking.create({
      data: {
        folderNumber: `NT-2099-${String(suffix).slice(-6)}`,
        customerId: customer.id,
        leadId: lead.id,
        saleSubmissionId: sale.id,
        salesAdvisorId: salesUser.id,
        destination: 'London',
        travelStartDate: new Date('2026-10-10'),
        sellingPrice: '2300.10',
        supplierCost: '1800.05',
        currency: 'GBP',
        createdById: financeUser.id,
      },
    });
    bookingId = booking.id;
    const supplier = await prisma.supplier.create({
      data: { name: `Finance Supplier ${suffix}`, supplierType: 'AIRLINE' },
    });
    ids.supplier = supplier.id;
    const bs = await prisma.bookingSupplier.create({
      data: {
        bookingId,
        supplierId: supplier.id,
        serviceType: 'Flights',
        supplierCost: '1800.05',
        currency: 'GBP',
        status: 'CONFIRMED',
      },
    });
    ids.bookingSupplier = bs.id;
    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return (response.body as { accessToken: string }).accessToken;
    };
    [financeToken, approverToken, salesToken] = await Promise.all([
      login(financeUser.email),
      login(approverUser.email),
      login(salesUser.email),
    ]);
  });

  afterAll(async () => {
    await prisma.journalLine.deleteMany({
      where: { journalEntry: { createdById: ids.financeUser } },
    });
    await prisma.journalEntry.deleteMany({
      where: { createdById: ids.financeUser },
    });
    await prisma.notification.deleteMany({
      where: {
        userId: { in: [ids.financeUser, ids.approverUser, ids.salesUser] },
      },
    });
    await prisma.auditLog.deleteMany({
      where: {
        actorId: { in: [ids.financeUser, ids.approverUser, ids.salesUser] },
      },
    });
    await prisma.reconciliationDiscrepancy.deleteMany({ where: { bookingId } });
    await prisma.reconciliation.deleteMany({ where: { bookingId } });
    await prisma.customerAdvanceAllocation.deleteMany({
      where: { invoice: { bookingId } },
    });
    await prisma.supplierAdvanceAllocation.deleteMany({
      where: { invoice: { bookingId } },
    });
    await prisma.passengerPayment.deleteMany({ where: { bookingId } });
    await prisma.supplierPayment.deleteMany({ where: { bookingId } });
    await prisma.customerAdvance.deleteMany({ where: { bookingId } });
    await prisma.supplierAdvance.deleteMany({ where: { bookingId } });
    await prisma.customerInvoice.deleteMany({ where: { bookingId } });
    await prisma.supplierInvoice.deleteMany({ where: { bookingId } });
    await prisma.bookingAdjustment.deleteMany({ where: { bookingId } });
    await prisma.bookingFinance.deleteMany({ where: { bookingId } });
    await prisma.bookingSupplier.deleteMany({ where: { bookingId } });
    await prisma.booking.delete({ where: { id: bookingId } });
    await prisma.supplier.delete({ where: { id: ids.supplier } });
    await prisma.saleSubmission.delete({ where: { id: ids.sale } });
    await prisma.lead.delete({ where: { id: ids.lead } });
    await prisma.customer.delete({ where: { id: ids.customer } });
    await prisma.exchangeRate.delete({ where: { id: ids.exchangeRate } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [ids.financeUser, ids.approverUser, ids.salesUser] },
      },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [ids.financeRole, ids.salesRole] } },
    });
    await app.close();
  });

  it('allows Accounts queue access and blocks Sales finance access', async () => {
    await request(app.getHttpServer())
      .get('/accounts/reconciliation-queue')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/bookings/${bookingId}/financial-summary`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/passenger-payments/00000000-0000-4000-8000-000000000000/verify')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
  });

  it('creates booking-linked invoices and safely allocates advances', async () => {
    const customerInvoice = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/customer-invoices`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        invoiceNumber: `CUS-${suffix}`,
        invoiceDate: '2026-08-20',
        dueDate: '2026-09-20',
        currency: 'GBP',
        totalAmount: '2300.10',
      })
      .expect(201);
    customerInvoiceId = (customerInvoice.body as { id: string }).id;
    expect(
      customerInvoice.body as { customerId: string; bookingId: string },
    ).toMatchObject({ customerId: ids.customer, bookingId });

    const supplierInvoice = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/supplier-invoices`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        bookingSupplierId: ids.bookingSupplier,
        invoiceNumber: `SUP-${suffix}`,
        invoiceDate: '2026-08-20',
        dueDate: '2026-09-20',
        currency: 'GBP',
        totalAmount: '1800.05',
      })
      .expect(201);
    supplierInvoiceId = (supplierInvoice.body as { id: string }).id;
    expect(
      supplierInvoice.body as { supplierId: string; bookingId: string },
    ).toMatchObject({ supplierId: ids.supplier, bookingId });

    const customerAdvance = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/customer-advances`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        amount: '100.00',
        currency: 'GBP',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'CA-1',
        paymentDate: '2026-08-21',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/customer-advances/${(customerAdvance.body as { id: string }).id}/allocations`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ invoiceId: customerInvoiceId, amount: '100.00' })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/customer-advances/${(customerAdvance.body as { id: string }).id}/allocations`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ invoiceId: customerInvoiceId, amount: '0.01' })
      .expect(409);

    const supplierAdvance = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/supplier-advances`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        bookingSupplierId: ids.bookingSupplier,
        amount: '50.00',
        currency: 'GBP',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'SA-1',
        paymentDate: '2026-08-21',
      })
      .expect(201);
    const supplierAllocation = await request(app.getHttpServer())
      .post(
        `/supplier-advances/${(supplierAdvance.body as { id: string }).id}/allocations`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ invoiceId: supplierInvoiceId, amount: '50.00' })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/supplier-advances/${(supplierAdvance.body as { id: string }).id}/allocations`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ invoiceId: supplierInvoiceId, amount: '0.01' })
      .expect(409);
    await request(app.getHttpServer())
      .post(
        `/supplier-advance-allocations/${(supplierAllocation.body as { id: string }).id}/reverse`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Correct allocation test' })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/supplier-advance-allocations/${(supplierAllocation.body as { id: string }).id}/reverse`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Duplicate reversal' })
      .expect(409);
    await request(app.getHttpServer())
      .post(
        `/supplier-advances/${(supplierAdvance.body as { id: string }).id}/allocations`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ invoiceId: supplierInvoiceId, amount: '50.00' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/customer-invoices`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        invoiceNumber: `BLOCKED-${suffix}`,
        invoiceDate: '2026-08-20',
        currency: 'GBP',
        totalAmount: '1.00',
      })
      .expect(403);
    const cancelled = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/customer-invoices`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        invoiceNumber: `VOID-${suffix}`,
        invoiceDate: '2026-08-20',
        currency: 'GBP',
        totalAmount: '999.00',
        status: 'DRAFT',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/customer-invoices/${(cancelled.body as { id: string }).id}/cancel`,
      )
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(201);
  }, 15_000);

  it('creates multiple partial customer and supplier payments', async () => {
    const passengerResponse = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/passenger-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        customerInvoiceId,
        amount: '2000.00',
        currency: 'GBP',
        paymentMethod: 'CARD',
        paymentReference: 'PAX-1',
        paymentDate: '2026-08-22',
      })
      .expect(201);
    passengerPaymentId = (passengerResponse.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/passenger-payments/${passengerPaymentId}/verify`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(201)
      .expect((r) =>
        expect((r.body as { status: string }).status).toBe('VERIFIED'),
      );
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/passenger-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        customerInvoiceId,
        amount: '200.10',
        currency: 'GBP',
        paymentMethod: 'CARD',
        paymentReference: 'PAX-2',
        paymentDate: '2026-08-22',
      })
      .expect(201);
    const supplierResponse = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/supplier-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        bookingSupplierId: ids.bookingSupplier,
        supplierInvoiceId,
        amount: '800.00',
        currency: 'GBP',
        paymentReference: 'SUP-1',
        paymentDate: '2026-08-22',
      })
      .expect(201);
    supplierPaymentId = (supplierResponse.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/supplier-payments/${supplierPaymentId}/verify`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(201)
      .expect((r) =>
        expect((r.body as { status: string }).status).toBe('VERIFIED'),
      );
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/supplier-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        bookingSupplierId: ids.bookingSupplier,
        supplierInvoiceId,
        amount: '950.05',
        currency: 'GBP',
        paymentReference: 'SUP-2',
        paymentDate: '2026-08-22',
      })
      .expect(201);

    const [receivable, payable] = await Promise.all([
      request(app.getHttpServer())
        .get(`/bookings/${bookingId}/customer-invoices`)
        .set('Authorization', `Bearer ${financeToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get(`/bookings/${bookingId}/supplier-invoices`)
        .set('Authorization', `Bearer ${financeToken}`)
        .expect(200),
    ]);
    expect(
      (receivable.body as { id: string }[]).find(
        (invoice) => invoice.id === customerInvoiceId,
      ),
    ).toMatchObject({
      status: 'PAID',
      amountPaid: '2300.1',
      outstanding: '0',
    });
    expect(
      (payable.body as { id: string }[]).find(
        (invoice) => invoice.id === supplierInvoiceId,
      ),
    ).toMatchObject({
      status: 'PAID',
      amountPaid: '1800.05',
      outstanding: '0',
    });
  });

  it('creates and approves an adjustment and calculates decimal-safe totals', async () => {
    const adjustmentResponse = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/adjustments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        type: 'FEE',
        amount: '0.20',
        currency: 'GBP',
        reason: 'Traceable fee',
      })
      .expect(201);
    const adjustmentId = (adjustmentResponse.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/booking-adjustments/${adjustmentId}/approve`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/booking-adjustments/${adjustmentId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .expect(201);
    const refund = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/adjustments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        type: 'REFUND',
        amount: '0.10',
        currency: 'GBP',
        reason: 'Traceable refund',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/booking-adjustments/${(refund.body as { id: string }).id}/approve`,
      )
      .set('Authorization', `Bearer ${approverToken}`)
      .expect(201);
    const result = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}/financial-summary`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(result.body as Record<string, string>).toMatchObject({
      sellingPrice: '2300.1',
      supplierCost: '1800.05',
      fees: '0.2',
      refunds: '0.1',
      adjustments: '0',
      expectedProfit: '500.15',
      grossProfit: '500.15',
      grossMargin: '21.74',
      invoicedAmount: '2300.1',
      customerAdvances: '100',
      allocatedCustomerAdvances: '100',
      customerOutstanding: '0',
      supplierInvoiceAmount: '1800.05',
      supplierAdvances: '50',
      allocatedSupplierAdvances: '50',
      supplierOutstanding: '0',
      passengerBalance: '0.1',
      supplierBalance: '0',
    });
  });

  it('starts reconciliation, creates discrepancy, and rejects completion', async () => {
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/reconciliation/start`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(201);
    const discrepancyResponse = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/reconciliation/discrepancies`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        type: 'PASSENGER_PAYMENT_MISMATCH',
        description: 'Passenger payment mismatch',
        amountDifference: '0.20',
        currency: 'GBP',
      })
      .expect(201);
    discrepancyId = (discrepancyResponse.body as { id: string }).id;
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/reconciliation`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        passengerPaymentsVerified: true,
        supplierCostsVerified: true,
        supplierPaymentsVerified: true,
        sellingPriceVerified: true,
        feesVerified: true,
        adjustmentsVerified: true,
        profitVerified: true,
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/reconciliation/complete`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(409);
    await expect(
      prisma.booking
        .findUniqueOrThrow({ where: { id: bookingId } })
        .then((b) => b.accountsStatus),
    ).resolves.toBe('DISCREPANCY');
  });

  it('resolves discrepancy but requires explicit reconciliation completion', async () => {
    await request(app.getHttpServer())
      .post(`/reconciliation-discrepancies/${discrepancyId}/resolve`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        resolutionNotes: 'Payment difference explained by approved fee.',
      })
      .expect(201);
    await expect(
      prisma.booking
        .findUniqueOrThrow({ where: { id: bookingId } })
        .then((b) => b.accountsStatus),
    ).resolves.toBe('RECONCILIATION_PENDING');
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/reconciliation/complete`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(201);
    await expect(
      prisma.booking
        .findUniqueOrThrow({ where: { id: bookingId } })
        .then((b) => b.accountsStatus),
    ).resolves.toBe('RECONCILED');
  });

  it('records required finance audit events and completion notification', async () => {
    const actions = (
      await prisma.auditLog.findMany({
        where: { actorId: { in: [ids.financeUser, ids.approverUser] } },
        select: { action: true },
      })
    ).map((x) => x.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'PASSENGER_PAYMENT_CREATED',
        'PASSENGER_PAYMENT_VERIFIED',
        'SUPPLIER_PAYMENT_CREATED',
        'SUPPLIER_PAYMENT_VERIFIED',
        'CUSTOMER_INVOICE_CREATED',
        'CUSTOMER_INVOICE_CANCELLED',
        'SUPPLIER_INVOICE_CREATED',
        'CUSTOMER_ADVANCE_RECORDED',
        'CUSTOMER_ADVANCE_ALLOCATED',
        'SUPPLIER_ADVANCE_RECORDED',
        'SUPPLIER_ADVANCE_ALLOCATED',
        'SUPPLIER_ADVANCE_ALLOCATION_REVERSED',
        'FINANCIAL_ADJUSTMENT_CREATED',
        'FINANCIAL_ADJUSTMENT_APPROVED',
        'RECONCILIATION_STARTED',
        'RECONCILIATION_UPDATED',
        'RECONCILIATION_COMPLETED',
        'RECONCILIATION_DISCREPANCY_CREATED',
        'RECONCILIATION_DISCREPANCY_RESOLVED',
      ]),
    );
    await expect(
      prisma.notification.count({
        where: {
          userId: ids.salesUser,
          type: 'RECONCILIATION_COMPLETED',
          entityId: bookingId,
        },
      }),
    ).resolves.toBe(1);
  });
});
