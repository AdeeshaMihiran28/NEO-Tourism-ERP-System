import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounting Phase 2 banking (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let financeToken: string;
  let salesToken: string;
  const suffix = Date.now();
  const password = 'BankingTestPassword123!';
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
      'finance.payment.create',
      'bank.account.view',
      'bank.account.manage',
      'bank.transaction.view',
      'bank.transaction.manage',
      'bank.reconciliation.view',
      'bank.reconciliation.perform',
      'bank.reconciliation.finalize',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: financeCodes } },
    });
    const [financeRole, salesRole] = await Promise.all([
      prisma.role.create({
        data: {
          name: `BANK_FINANCE_${suffix}`,
          permissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
      }),
      prisma.role.create({
        data: {
          name: `BANK_SALES_${suffix}`,
          permissions: {
            create: permissions
              .filter((permission) => permission.code === 'booking.view')
              .map((permission) => ({ permissionId: permission.id })),
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
          email: `bank-finance-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Bank',
          lastName: 'Finance',
          departmentId: accountsDepartment.id,
          roles: { create: { roleId: financeRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `bank-sales-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Bank',
          lastName: 'Sales',
          departmentId: salesDepartment.id,
          roles: { create: { roleId: salesRole.id } },
        },
      }),
    ]);
    ids.financeUser = financeUser.id;
    ids.salesUser = salesUser.id;
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Bank',
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
        destination: 'Colombo',
        createdById: salesUser.id,
      },
    });
    ids.lead = lead.id;
    const sale = await prisma.saleSubmission.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        submittedByUserId: salesUser.id,
        destination: 'Colombo',
        travelStartDate: new Date('2026-09-15'),
        sellingPrice: '500',
        currency: 'LKR',
        status: 'ADMIN_ACCEPTED',
      },
    });
    ids.sale = sale.id;
    const booking = await prisma.booking.create({
      data: {
        folderNumber: `NT-2098-${String(suffix).slice(-6)}`,
        customerId: customer.id,
        leadId: lead.id,
        saleSubmissionId: sale.id,
        salesAdvisorId: salesUser.id,
        destination: 'Colombo',
        travelStartDate: new Date('2026-09-15'),
        sellingPrice: '500',
        supplierCost: '200',
        currency: 'LKR',
        createdById: financeUser.id,
      },
    });
    ids.booking = booking.id;
    const supplier = await prisma.supplier.create({
      data: { name: `Bank Supplier ${suffix}`, supplierType: 'HOTEL' },
    });
    ids.supplier = supplier.id;
    const bookingSupplier = await prisma.bookingSupplier.create({
      data: {
        bookingId: booking.id,
        supplierId: supplier.id,
        serviceType: 'Hotel',
        supplierCost: '200',
        currency: 'LKR',
        status: 'CONFIRMED',
      },
    });
    ids.bookingSupplier = bookingSupplier.id;

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
    await prisma.journalLine.deleteMany({
      where: { journalEntry: { createdById: ids.financeUser } },
    });
    await prisma.journalEntry.deleteMany({
      where: { createdById: ids.financeUser },
    });
    await prisma.bankReconciliationMatch.deleteMany({
      where: { matchedById: ids.financeUser },
    });
    await prisma.bankStatementTransaction.deleteMany({
      where: { statement: { createdById: ids.financeUser } },
    });
    await prisma.bankStatement.deleteMany({
      where: { createdById: ids.financeUser },
    });
    await prisma.bankTransaction.deleteMany({
      where: { createdById: ids.financeUser },
    });
    await prisma.passengerPayment.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.supplierPayment.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.companyBankAccount.deleteMany({
      where: { createdById: ids.financeUser },
    });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [ids.financeUser, ids.salesUser] } },
    });
    await prisma.bookingSupplier.delete({ where: { id: ids.bookingSupplier } });
    await prisma.booking.delete({ where: { id: ids.booking } });
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

  it('protects and creates masked company bank accounts', async () => {
    await request(app.getHttpServer())
      .post('/banking/accounts')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        bankName: 'Blocked',
        accountName: 'Blocked',
        accountNumber: '1234',
        currency: 'LKR',
      })
      .expect(403);
    for (const [key, currency] of [
      ['bank1', 'LKR'],
      ['bank2', 'LKR'],
      ['usdBank', 'USD'],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post('/banking/accounts')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          bankName: `Test Bank ${key}`,
          accountName: key,
          accountNumber: `00123456${key}`,
          currency,
          openingBalance: key === 'bank1' ? '1000' : '0',
        })
        .expect(201);
      ids[key] = (response.body as { id: string }).id;
      expect(
        (response.body as { maskedAccountNumber: string }).maskedAccountNumber,
      ).toMatch(/^•••• /);
      expect(response.body).not.toHaveProperty('accountNumber');
    }
  });

  it('links bank receipts and supplier payments exactly once with traceability', async () => {
    const receipt = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/passenger-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        amount: '100',
        currency: 'LKR',
        paymentMethod: 'BANK_TRANSFER',
        companyBankAccountId: ids.bank1,
        paymentReference: 'CUS-BANK-1',
        paymentDate: '2026-09-01',
      })
      .expect(201);
    ids.receipt = (receipt.body as { id: string }).id;
    const supplierPayment = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/supplier-payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        bookingSupplierId: ids.bookingSupplier,
        amount: '40',
        currency: 'LKR',
        paymentMethod: 'BANK_TRANSFER',
        companyBankAccountId: ids.bank1,
        paymentReference: 'SUP-BANK-1',
        paymentDate: '2026-09-02',
      })
      .expect(201);
    ids.supplierPayment = (supplierPayment.body as { id: string }).id;

    const transactions = await request(app.getHttpServer())
      .get(`/banking/accounts/${ids.bank1}/transactions`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    const rows = transactions.body as {
      passengerPaymentId: string | null;
      supplierPaymentId: string | null;
      bookingId: string;
      customerId: string | null;
      supplierId: string | null;
    }[];
    expect(
      rows.filter((row) => row.passengerPaymentId === ids.receipt),
    ).toHaveLength(1);
    expect(
      rows.filter((row) => row.supplierPaymentId === ids.supplierPayment),
    ).toHaveLength(1);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: ids.booking,
          customerId: ids.customer,
        }),
        expect.objectContaining({
          bookingId: ids.booking,
          supplierId: ids.supplier,
        }),
      ]),
    );
    await expect(
      prisma.bankTransaction.create({
        data: {
          companyBankAccountId: ids.bank1,
          transactionDate: new Date('2026-09-01'),
          amount: '100',
          currency: 'LKR',
          direction: 'CREDIT',
          description: 'duplicate',
          sourceType: 'CUSTOMER_RECEIPT',
          passengerPaymentId: ids.receipt,
          createdById: ids.financeUser,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('creates same-currency transfers atomically and blocks cross-currency transfers', async () => {
    const transfer = await request(app.getHttpServer())
      .post('/banking/transfers')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        sourceAccountId: ids.bank1,
        destinationAccountId: ids.bank2,
        transactionDate: '2026-09-03',
        amount: '25',
        reference: 'TRANSFER-1',
      })
      .expect(201);
    expect(
      (transfer.body as { transactions: unknown[] }).transactions,
    ).toHaveLength(2);
    const before = await prisma.bankTransaction.count({
      where: { reference: 'FAILED-FX' },
    });
    await request(app.getHttpServer())
      .post('/banking/transfers')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        sourceAccountId: ids.bank1,
        destinationAccountId: ids.usdBank,
        transactionDate: '2026-09-03',
        amount: '25',
        reference: 'FAILED-FX',
      })
      .expect(400);
    await expect(
      prisma.bankTransaction.count({ where: { reference: 'FAILED-FX' } }),
    ).resolves.toBe(before);
  });

  it('imports statement rows, rejects duplicates, exact-matches, and leaves ambiguity for review', async () => {
    const charge = await request(app.getHttpServer())
      .post(`/banking/accounts/${ids.bank1}/transactions`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        transactionDate: '2026-09-04',
        amount: '5',
        direction: 'DEBIT',
        sourceType: 'BANK_CHARGE',
        reference: 'CHARGE-1',
        description: 'Monthly bank charge',
      })
      .expect(201);
    ids.charge = (charge.body as { id: string }).id;
    const statement = await request(app.getHttpServer())
      .post('/banking/statements')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        companyBankAccountId: ids.bank1,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        openingBalance: '1000',
        closingBalance: '1030',
      })
      .expect(201);
    ids.statement = (statement.body as { id: string }).id;
    const rows = [
      {
        transactionDate: '2026-09-01',
        description: 'Customer receipt',
        reference: 'CUS-BANK-1',
        amount: '100',
        direction: 'CREDIT',
      },
      {
        transactionDate: '2026-09-02',
        description: 'Supplier payment',
        reference: 'SUP-BANK-1',
        amount: '40',
        direction: 'DEBIT',
      },
      {
        transactionDate: '2026-09-03',
        description: 'Transfer',
        reference: 'TRANSFER-1',
        amount: '25',
        direction: 'DEBIT',
      },
      {
        transactionDate: '2026-09-10',
        description: 'Delayed charge',
        reference: 'DIFFERENT',
        amount: '5',
        direction: 'DEBIT',
      },
    ];
    const imported = await request(app.getHttpServer())
      .post(`/banking/statements/${ids.statement}/transactions/import`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ rows })
      .expect(201);
    ids.manualRow = (imported.body as { id: string }[])[3].id;
    await request(app.getHttpServer())
      .post(`/banking/statements/${ids.statement}/transactions/import`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ rows: [rows[0]] })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/banking/statements/${ids.statement}/auto-match`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(201)
      .expect((response) =>
        expect((response.body as { matched: number }).matched).toBe(3),
      );
    await request(app.getHttpServer())
      .post(`/banking/statements/${ids.statement}/finalize`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(409);
  });

  it('supports manual match/unmatch, prevents double matching, and finalizes only at zero difference', async () => {
    const matched = await request(app.getHttpServer())
      .post(`/banking/statement-transactions/${ids.manualRow}/match`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ erpBankTransactionId: ids.charge })
      .expect(201);
    ids.match = (matched.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/banking/statement-transactions/${ids.manualRow}/match`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ erpBankTransactionId: ids.charge })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/banking/matches/${ids.match}/unmatch`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Test authorized undo' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/banking/matches/${ids.match}/unmatch`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Duplicate undo' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/banking/statement-transactions/${ids.manualRow}/match`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ erpBankTransactionId: ids.charge })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/banking/statements/${ids.statement}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(
      (detail.body as { summary: Record<string, string> }).summary,
    ).toMatchObject({
      openingBalance: '1000',
      statementClosingBalance: '1030',
      erpCredits: '100',
      erpDebits: '70',
      calculatedClosingBalance: '1030',
      difference: '0',
    });
    await request(app.getHttpServer())
      .post(`/banking/statements/${ids.statement}/finalize`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(201)
      .expect((response) =>
        expect(
          (response.body as { status: string; finalizedById: string }).status,
        ).toBe('RECONCILED'),
      );
    await request(app.getHttpServer())
      .post(`/banking/statements/${ids.statement}/reopen`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Review requested' })
      .expect(201);
  });

  it('records banking audit history', async () => {
    const actions = (
      await prisma.auditLog.findMany({
        where: { actorId: ids.financeUser },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'BANK_ACCOUNT_CREATED',
        'CUSTOMER_RECEIPT_BANK_LINKED',
        'SUPPLIER_PAYMENT_BANK_LINKED',
        'BANK_TRANSFER_CREATED',
        'BANK_STATEMENT_IMPORTED',
        'BANK_TRANSACTION_MATCHED',
        'BANK_TRANSACTION_UNMATCHED',
        'BANK_RECONCILIATION_FINALIZED',
        'BANK_RECONCILIATION_REOPENED',
      ]),
    );
  });
});
