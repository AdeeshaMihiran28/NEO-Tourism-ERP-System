import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounting controls and reporting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let makerToken: string;
  let approverToken: string;
  let blockedToken: string;
  const suffix = Date.now();
  const password = 'AccountingPhase4!';
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

    const codes = [
      'booking.view',
      'finance.view',
      'finance.edit',
      'gl.account.view',
      'journal.view',
      'journal.create',
      'journal.approve',
      'journal.post',
      'accounting.period.view',
      'accounting.period.manage',
      'accounting.period.close',
      'accounting.period.reopen',
      'fx.rate.view',
      'fx.rate.manage',
      'tax.code.view',
      'tax.code.manage',
      'report.pnl.view',
      'report.balance-sheet.view',
      'report.cash-flow.view',
      'report.tax.view',
      'report.audit.view',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    const [accountingRole, blockedRole] = await Promise.all([
      prisma.role.create({
        data: {
          name: `ACCOUNTING_PHASE4_${suffix}`,
          permissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
      }),
      prisma.role.create({ data: { name: `ACCOUNTING_BLOCKED_${suffix}` } }),
    ]);
    ids.accountingRole = accountingRole.id;
    ids.blockedRole = blockedRole.id;
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Accounts' },
    });
    const hash = await bcrypt.hash(password, 4);
    const users = await Promise.all(
      ['maker', 'approver', 'blocked'].map((name) =>
        prisma.user.create({
          data: {
            email: `${name}-phase4-${suffix}@test.local`,
            passwordHash: hash,
            firstName: name,
            lastName: 'Phase4',
            departmentId: department.id,
            roles: {
              create: {
                roleId: name === 'blocked' ? blockedRole.id : accountingRole.id,
              },
            },
          },
        }),
      ),
    );
    [ids.maker, ids.approver, ids.blocked] = users.map((user) => user.id);
    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return (response.body as { accessToken: string }).accessToken;
    };
    [makerToken, approverToken, blockedToken] = await Promise.all(
      users.map((user) => login(user.email)),
    );

    const customer = await prisma.customer.create({
      data: {
        firstName: 'Phase',
        lastName: 'Four',
        createdById: ids.maker,
        updatedById: ids.maker,
      },
    });
    ids.customer = customer.id;
    const lead = await prisma.lead.create({
      data: {
        customerId: customer.id,
        assignedUserId: ids.maker,
        status: 'SALE_MADE',
        destination: 'Canada',
        createdById: ids.maker,
      },
    });
    ids.lead = lead.id;
    const sale = await prisma.saleSubmission.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        submittedByUserId: ids.maker,
        destination: 'Canada',
        travelStartDate: new Date('2026-12-01'),
        sellingPrice: '110',
        currency: 'CAD',
        status: 'ADMIN_ACCEPTED',
      },
    });
    ids.sale = sale.id;
    const booking = await prisma.booking.create({
      data: {
        folderNumber: `P4-${suffix}`,
        customerId: customer.id,
        leadId: lead.id,
        saleSubmissionId: sale.id,
        salesAdvisorId: ids.maker,
        destination: 'Canada',
        travelStartDate: new Date('2026-12-01'),
        sellingPrice: '110',
        currency: 'CAD',
        createdById: ids.maker,
      },
    });
    ids.booking = booking.id;
  });

  afterAll(async () => {
    await prisma.journalLine.deleteMany({
      where: {
        journalEntry: { createdById: { in: [ids.maker, ids.approver] } },
      },
    });
    await prisma.journalEntry.deleteMany({
      where: { createdById: { in: [ids.maker, ids.approver] } },
    });
    await prisma.customerInvoice.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.bookingFinance.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.booking.deleteMany({ where: { id: ids.booking } });
    await prisma.saleSubmission.deleteMany({ where: { id: ids.sale } });
    await prisma.lead.deleteMany({ where: { id: ids.lead } });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [ids.maker, ids.approver, ids.blocked] } },
    });
    await prisma.accountingPeriod.deleteMany({
      where: { createdById: ids.maker },
    });
    await prisma.taxCode.deleteMany({ where: { createdById: ids.maker } });
    await prisma.exchangeRate.deleteMany({ where: { createdById: ids.maker } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.maker, ids.approver, ids.blocked] } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [ids.accountingRole, ids.blockedRole] } },
    });
    await app.close();
  });

  it('enforces RBAC and stores the historical FX rate on posted transactions', async () => {
    await request(app.getHttpServer())
      .get('/accounting/exchange-rates')
      .set('Authorization', `Bearer ${blockedToken}`)
      .expect(403);
    const rate = await request(app.getHttpServer())
      .post('/accounting/exchange-rates')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        fromCurrency: 'CAD',
        toCurrency: 'LKR',
        rate: '240',
        effectiveDate: '2026-01-01',
        source: 'E2E',
      })
      .expect(201);
    ids.rate = (rate.body as { id: string }).id;

    const accounts = await prisma.glAccount.findMany({
      where: { isActive: true },
    });
    const asset = accounts.find((account) => account.type === 'ASSET')!;
    const revenue = accounts.find((account) => account.type === 'REVENUE')!;
    const journal = await request(app.getHttpServer())
      .post('/accounting/journals')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        journalDate: '2026-04-01',
        description: 'Phase 4 FX journal',
        currency: 'CAD',
        lines: [
          { accountId: asset.id, debit: '100', credit: '0' },
          { accountId: revenue.id, debit: '0', credit: '100' },
        ],
      })
      .expect(201);
    const journalBody = journal.body as {
      id: string;
      exchangeRate: string;
      baseCurrency: string;
      lines: { baseDebit: string; baseCredit: string }[];
    };
    ids.journal = journalBody.id;
    expect(journalBody).toMatchObject({
      exchangeRate: '240',
      baseCurrency: 'LKR',
    });
    expect(journalBody.lines[0]).toMatchObject({
      baseDebit: '24000',
      baseCredit: '0',
    });
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.journal}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.journal}/post`)
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/accounting/exchange-rates/${ids.rate}`)
      .set('Authorization', `Bearer ${makerToken}`)
      .send({ rate: '250' })
      .expect(200);
    const stored = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: ids.journal },
      include: { lines: true },
    });
    expect(stored.exchangeRate.toString()).toBe('240');
    expect(stored.lines[0].baseDebit.toString()).toBe('24000');
  });

  it('posts configured output tax separately and reports only posted GL data', async () => {
    const taxAccount = await prisma.glAccount.findFirstOrThrow({
      where: { type: 'LIABILITY', isActive: true },
    });
    const tax = await request(app.getHttpServer())
      .post('/accounting/tax-codes')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        code: `VAT10-${suffix}`,
        name: 'Output VAT 10%',
        rate: '10',
        taxType: 'VAT',
        classification: 'OUTPUT',
        effectiveFrom: '2026-01-01',
        glAccountId: taxAccount.id,
      })
      .expect(201);
    ids.tax = (tax.body as { id: string }).id;
    const invoice = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/customer-invoices`)
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        invoiceNumber: `P4-INV-${suffix}`,
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-31',
        currency: 'CAD',
        netAmount: '100',
        totalAmount: '110',
        taxCodeId: ids.tax,
      })
      .expect(201);
    const invoiceBody = invoice.body as { id: string } & Record<string, string>;
    ids.invoice = invoiceBody.id;
    expect(invoiceBody).toMatchObject({
      netAmount: '100',
      taxAmount: '10',
      baseTotalAmount: '27500',
      exchangeRate: '250',
    });
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: {
        sourceType_sourceRecordId: {
          sourceType: 'CUSTOMER_INVOICE',
          sourceRecordId: ids.invoice,
        },
      },
      include: { lines: true },
    });
    expect(
      journal.lines.map((line) => line.baseCredit.toString()).sort(),
    ).toEqual(['0', '2500', '25000']);

    const pnl = await request(app.getHttpServer())
      .get(
        '/accounting/reports/profit-and-loss?dateFrom=2026-01-01&dateTo=2026-12-31',
      )
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(200);
    const pnlBody = pnl.body as { baseCurrency: string; revenueTotal: string };
    expect(pnlBody.baseCurrency).toBe('LKR');
    expect(Number(pnlBody.revenueTotal)).toBeGreaterThanOrEqual(49000);
    const taxReport = await request(app.getHttpServer())
      .get(
        '/accounting/reports/tax-summary?dateFrom=2026-01-01&dateTo=2026-12-31',
      )
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(200);
    expect(taxReport.body).toMatchObject({
      outputTax: '2500',
      taxableSales: '25000',
    });
    await request(app.getHttpServer())
      .get(`/accounting/reports/customer-statement?partyId=${ids.customer}`)
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/accounts/booking-profitability')
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(200);
  });

  it('rejects overlaps, blocks locked-period posting, and audits controlled reopening', async () => {
    const period = await request(app.getHttpServer())
      .post('/accounting/periods')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        name: `FY2027-${suffix}`,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        fiscalYear: 2027,
      })
      .expect(201);
    ids.period = (period.body as { id: string }).id;
    await request(app.getHttpServer())
      .post('/accounting/periods')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        name: `Overlap-${suffix}`,
        startDate: '2027-06-01',
        endDate: '2028-05-31',
        fiscalYear: 2027,
      })
      .expect(409);
    const accounts = await prisma.glAccount.findMany({
      where: { isActive: true },
    });
    const closingDraft = await request(app.getHttpServer())
      .post('/accounting/journals')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        journalDate: '2027-01-15',
        description: 'Close validation draft',
        currency: 'CAD',
        lines: [
          {
            accountId: accounts.find((account) => account.type === 'ASSET')!.id,
            debit: '1',
            credit: '0',
          },
          {
            accountId: accounts.find((account) => account.type === 'REVENUE')!
              .id,
            debit: '0',
            credit: '1',
          },
        ],
      })
      .expect(201);
    ids.closingDraft = (closingDraft.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/accounting/periods/${ids.period}/start-closing`)
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/accounting/periods/${ids.period}/close`)
      .set('Authorization', `Bearer ${makerToken}`)
      .send({ notes: 'Should fail' })
      .expect(409);
    const failedValidation = await prisma.accountingPeriod.findUniqueOrThrow({
      where: { id: ids.period },
    });
    expect(failedValidation.validationResult).toMatchObject({
      valid: false,
      unpostedJournals: 1,
    });
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.closingDraft}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ reason: 'Removed during close review' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/accounting/periods/${ids.period}/close`)
      .set('Authorization', `Bearer ${makerToken}`)
      .send({ notes: 'Validated' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/accounting/periods/${ids.period}/lock`)
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post('/accounting/journals')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        journalDate: '2027-02-01',
        description: 'Locked period draft',
        currency: 'CAD',
        lines: [
          {
            accountId: accounts.find((account) => account.type === 'ASSET')!.id,
            debit: '1',
            credit: '0',
          },
          {
            accountId: accounts.find((account) => account.type === 'REVENUE')!
              .id,
            debit: '0',
            credit: '1',
          },
        ],
      })
      .expect(201);
    ids.lockedJournal = (draft.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.lockedJournal}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.lockedJournal}/post`)
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/accounting/periods/${ids.period}/reopen`)
      .set('Authorization', `Bearer ${blockedToken}`)
      .send({ reason: 'No permission' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/accounting/periods/${ids.period}/reopen`)
      .set('Authorization', `Bearer ${makerToken}`)
      .send({ reason: 'Approved correction' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.lockedJournal}/post`)
      .set('Authorization', `Bearer ${makerToken}`)
      .expect(201);
    await expect(
      prisma.auditLog.count({
        where: {
          actorId: ids.maker,
          action: 'ACCOUNTING_PERIOD_REOPENED',
          entityId: ids.period,
        },
      }),
    ).resolves.toBe(1);
  });
});
