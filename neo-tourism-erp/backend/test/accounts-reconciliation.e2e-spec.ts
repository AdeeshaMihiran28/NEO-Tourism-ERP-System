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
  let salesToken: string;
  let bookingId: string;
  let passengerPaymentId: string;
  let supplierPaymentId: string;
  let discrepancyId: string;
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
    const [financeUser, salesUser] = await Promise.all([
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
    ids.salesUser = salesUser.id;
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
    [financeToken, salesToken] = await Promise.all([
      login(financeUser.email),
      login(salesUser.email),
    ]);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [ids.financeUser, ids.salesUser] } },
    });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [ids.financeUser, ids.salesUser] } },
    });
    await prisma.reconciliationDiscrepancy.deleteMany({ where: { bookingId } });
    await prisma.reconciliation.deleteMany({ where: { bookingId } });
    await prisma.passengerPayment.deleteMany({ where: { bookingId } });
    await prisma.supplierPayment.deleteMany({ where: { bookingId } });
    await prisma.bookingAdjustment.deleteMany({ where: { bookingId } });
    await prisma.bookingFinance.deleteMany({ where: { bookingId } });
    await prisma.bookingSupplier.deleteMany({ where: { bookingId } });
    await prisma.booking.delete({ where: { id: bookingId } });
    await prisma.supplier.delete({ where: { id: ids.supplier } });
    await prisma.saleSubmission.delete({ where: { id: ids.sale } });
    await prisma.lead.delete({ where: { id: ids.lead } });
    await prisma.customer.delete({ where: { id: ids.customer } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.financeUser, ids.salesUser] } },
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

  it('creates and verifies passenger and supplier payments', async () => {
    const passengerResponse = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/passenger-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        amount: '2300.10',
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
    const supplierResponse = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/supplier-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        bookingSupplierId: ids.bookingSupplier,
        amount: '1800.05',
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
      .expect(201);
    const result = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}/financial-summary`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(result.body as Record<string, string>).toMatchObject({
      sellingPrice: '2300.1',
      supplierCost: '1800.05',
      fees: '0.2',
      expectedProfit: '500.25',
      passengerBalance: '0.2',
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
        where: { actorId: ids.financeUser },
        select: { action: true },
      })
    ).map((x) => x.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'PASSENGER_PAYMENT_CREATED',
        'PASSENGER_PAYMENT_VERIFIED',
        'SUPPLIER_PAYMENT_CREATED',
        'SUPPLIER_PAYMENT_VERIFIED',
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
