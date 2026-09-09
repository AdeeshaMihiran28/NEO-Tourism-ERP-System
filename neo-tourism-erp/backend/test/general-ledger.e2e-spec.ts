import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { Prisma } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounting Phase 3 general ledger (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creatorToken: string;
  let approverToken: string;
  let blockedToken: string;
  const suffix = Date.now();
  const password = 'GeneralLedgerTest123!';
  const ids: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    const creatorCodes = [
      'booking.view',
      'booking.view_all',
      'finance.view',
      'finance.edit',
      'finance.payment.create',
      'bank.account.view',
      'bank.account.manage',
      'bank.transaction.manage',
      'gl.account.view',
      'gl.account.manage',
      'journal.view',
      'journal.create',
      'journal.approve',
      'general-ledger.view',
      'trial-balance.view',
    ];
    const approverCodes = [
      'gl.account.view',
      'journal.view',
      'journal.approve',
      'journal.post',
      'journal.reverse',
      'general-ledger.view',
      'trial-balance.view',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...creatorCodes, ...approverCodes] } },
    });
    const makeRole = (name: string, codes: string[]) =>
      prisma.role.create({
        data: {
          name: `${name}_${suffix}`,
          permissions: {
            create: permissions
              .filter((permission) => codes.includes(permission.code))
              .map((permission) => ({ permissionId: permission.id })),
          },
        },
      });
    const [creatorRole, approverRole, blockedRole] = await Promise.all([
      makeRole('GL_CREATOR', creatorCodes),
      makeRole('GL_APPROVER', approverCodes),
      prisma.role.create({ data: { name: `GL_BLOCKED_${suffix}` } }),
    ]);
    ids.creatorRole = creatorRole.id;
    ids.approverRole = approverRole.id;
    ids.blockedRole = blockedRole.id;
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Accounts' },
    });
    const hash = await bcrypt.hash(password, 4);
    const makeUser = (name: string, roleId: string) =>
      prisma.user.create({
        data: {
          email: `${name}-${suffix}@test.local`,
          passwordHash: hash,
          firstName: name,
          lastName: 'Ledger',
          departmentId: department.id,
          roles: { create: { roleId } },
        },
      });
    const [creator, approver, blocked] = await Promise.all([
      makeUser('creator', creatorRole.id),
      makeUser('approver', approverRole.id),
      makeUser('blocked', blockedRole.id),
    ]);
    ids.creator = creator.id;
    ids.approver = approver.id;
    ids.blocked = blocked.id;
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Ledger',
        lastName: 'Customer',
        createdById: creator.id,
        updatedById: creator.id,
      },
    });
    ids.customer = customer.id;
    const lead = await prisma.lead.create({
      data: {
        customerId: customer.id,
        assignedUserId: creator.id,
        status: 'SALE_MADE',
        destination: 'Colombo',
        createdById: creator.id,
      },
    });
    ids.lead = lead.id;
    const sale = await prisma.saleSubmission.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        submittedByUserId: creator.id,
        destination: 'Colombo',
        travelStartDate: new Date('2026-11-01'),
        sellingPrice: '1000',
        currency: 'LKR',
        status: 'ADMIN_ACCEPTED',
      },
    });
    ids.sale = sale.id;
    const booking = await prisma.booking.create({
      data: {
        folderNumber: `NT-GL-${String(suffix).slice(-7)}`,
        customerId: customer.id,
        leadId: lead.id,
        saleSubmissionId: sale.id,
        salesAdvisorId: creator.id,
        destination: 'Colombo',
        travelStartDate: new Date('2026-11-01'),
        sellingPrice: '1000',
        supplierCost: '300',
        currency: 'LKR',
        createdById: creator.id,
      },
    });
    ids.booking = booking.id;
    const supplier = await prisma.supplier.create({
      data: { name: `Ledger Supplier ${suffix}`, supplierType: 'HOTEL' },
    });
    ids.supplier = supplier.id;
    const bookingSupplier = await prisma.bookingSupplier.create({
      data: {
        bookingId: booking.id,
        supplierId: supplier.id,
        serviceType: 'Hotel',
        supplierCost: '300',
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
    [creatorToken, approverToken, blockedToken] = await Promise.all([
      login(creator.email),
      login(approver.email),
      login(blocked.email),
    ]);
  });

  afterAll(async () => {
    await prisma.journalLine.deleteMany({
      where: {
        journalEntry: { createdById: { in: [ids.creator, ids.approver] } },
      },
    });
    await prisma.journalEntry.deleteMany({
      where: { createdById: { in: [ids.creator, ids.approver] } },
    });
    await prisma.bankTransaction.deleteMany({
      where: { createdById: ids.creator },
    });
    await prisma.passengerPayment.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.supplierPayment.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.customerAdvanceAllocation.deleteMany({
      where: { invoice: { bookingId: ids.booking } },
    });
    await prisma.supplierAdvanceAllocation.deleteMany({
      where: { invoice: { bookingId: ids.booking } },
    });
    await prisma.customerAdvance.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.supplierAdvance.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.customerInvoice.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.supplierInvoice.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.companyBankAccount.deleteMany({
      where: { createdById: ids.creator },
    });
    await prisma.glAccount.deleteMany({ where: { createdById: ids.creator } });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [ids.creator, ids.approver, ids.blocked] } },
    });
    await prisma.bookingSupplier.deleteMany({
      where: { bookingId: ids.booking },
    });
    await prisma.booking.delete({ where: { id: ids.booking } });
    await prisma.supplier.delete({ where: { id: ids.supplier } });
    await prisma.saleSubmission.delete({ where: { id: ids.sale } });
    await prisma.lead.delete({ where: { id: ids.lead } });
    await prisma.customer.delete({ where: { id: ids.customer } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.creator, ids.approver, ids.blocked] } },
    });
    await prisma.role.deleteMany({
      where: {
        id: { in: [ids.creatorRole, ids.approverRole, ids.blockedRole] },
      },
    });
    await app.close();
  });

  it('protects the chart, enforces unique codes, and rejects inactive accounts', async () => {
    await request(app.getHttpServer())
      .get('/accounting/chart-of-accounts')
      .set(auth(blockedToken))
      .expect(403);
    const account = await request(app.getHttpServer())
      .post('/accounting/chart-of-accounts')
      .set(auth(creatorToken))
      .send({
        code: `99${String(suffix).slice(-4)}`,
        name: 'Test Expense',
        type: 'EXPENSE',
      })
      .expect(201);
    ids.testAccount = (account.body as { id: string }).id;
    await request(app.getHttpServer())
      .post('/accounting/chart-of-accounts')
      .set(auth(creatorToken))
      .send({
        code: `99${String(suffix).slice(-4)}`,
        name: 'Duplicate',
        type: 'EXPENSE',
      })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/accounting/chart-of-accounts/${ids.testAccount}`)
      .set(auth(creatorToken))
      .send({ isActive: false })
      .expect(200);
    const cash = await prisma.glAccount.findUniqueOrThrow({
      where: { code: '1100' },
    });
    await request(app.getHttpServer())
      .post('/accounting/journals')
      .set(auth(creatorToken))
      .send({
        journalDate: '2026-09-06',
        description: 'Inactive account check',
        currency: 'LKR',
        lines: [
          { accountId: ids.testAccount, debit: '10', credit: '0' },
          { accountId: cash.id, debit: '0', credit: '10' },
        ],
      })
      .expect(400);
  });

  it('enforces balanced manual workflow, permissions, immutability, ledger and trial balance', async () => {
    const [cash, adjustment] = await Promise.all([
      prisma.glAccount.findUniqueOrThrow({ where: { code: '1100' } }),
      prisma.glAccount.findUniqueOrThrow({ where: { code: '5200' } }),
    ]);
    await request(app.getHttpServer())
      .post('/accounting/journals')
      .set(auth(creatorToken))
      .send({
        journalDate: '2026-09-06',
        description: 'Unbalanced',
        currency: 'LKR',
        lines: [
          { accountId: adjustment.id, debit: '10', credit: '0' },
          { accountId: cash.id, debit: '0', credit: '9' },
        ],
      })
      .expect(400);
    const created = await request(app.getHttpServer())
      .post('/accounting/journals')
      .set(auth(creatorToken))
      .send({
        journalDate: '2026-09-06',
        description: 'Manual correction',
        currency: 'LKR',
        bookingId: ids.booking,
        lines: [
          {
            accountId: adjustment.id,
            debit: '10',
            credit: '0',
            bookingId: ids.booking,
          },
          {
            accountId: cash.id,
            debit: '0',
            credit: '10',
            bookingId: ids.booking,
          },
        ],
      })
      .expect(201);
    ids.manualJournal = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.manualJournal}/approve`)
      .set(auth(creatorToken))
      .expect(409);
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.manualJournal}/approve`)
      .set(auth(blockedToken))
      .expect(403);
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.manualJournal}/approve`)
      .set(auth(approverToken))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.manualJournal}/post`)
      .set(auth(approverToken))
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/accounting/journals/${ids.manualJournal}`)
      .set(auth(creatorToken))
      .send({
        journalDate: '2026-09-06',
        description: 'Changed',
        currency: 'LKR',
        lines: [
          { accountId: adjustment.id, debit: '10', credit: '0' },
          { accountId: cash.id, debit: '0', credit: '10' },
        ],
      })
      .expect(409);
    const ledger = await request(app.getHttpServer())
      .get(`/accounting/general-ledger?journalId=${ids.manualJournal}`)
      .set(auth(creatorToken))
      .expect(200);
    expect(ledger.body).toHaveLength(2);
    const trial = await request(app.getHttpServer())
      .get('/accounting/trial-balance')
      .set(auth(creatorToken))
      .expect(200);
    expect((trial.body as { difference: string }).difference).toBe('0');
  });

  it('reverses with opposite lines and prevents a second reversal', async () => {
    const reversal = await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.manualJournal}/reverse`)
      .set(auth(approverToken))
      .send({ reason: 'Correction required' })
      .expect(201);
    const body = reversal.body as {
      sourceType: string;
      reversalOfId: string;
      lines: { debit: string; credit: string }[];
    };
    expect(body).toMatchObject({
      sourceType: 'REVERSAL',
      reversalOfId: ids.manualJournal,
    });
    expect(body.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ debit: '0', credit: '10' }),
        expect.objectContaining({ debit: '10', credit: '0' }),
      ]),
    );
    await request(app.getHttpServer())
      .post(`/accounting/journals/${ids.manualJournal}/reverse`)
      .set(auth(approverToken))
      .send({ reason: 'Again' })
      .expect(409);
  });

  it('posts invoices, receipts, advances, allocations, supplier payments and bank charges once', async () => {
    const bank = await request(app.getHttpServer())
      .post('/banking/accounts')
      .set(auth(creatorToken))
      .send({
        bankName: 'GL Bank',
        accountName: 'Operating',
        accountNumber: '1234567890',
        currency: 'LKR',
        openingBalance: '0',
      })
      .expect(201);
    ids.bank = (bank.body as { id: string }).id;
    const customerInvoice = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/customer-invoices`)
      .set(auth(creatorToken))
      .send({
        invoiceNumber: `GL-C-${suffix}`,
        invoiceDate: '2026-09-01',
        currency: 'LKR',
        totalAmount: '500',
        status: 'ISSUED',
      })
      .expect(201);
    ids.customerInvoice = (customerInvoice.body as { id: string }).id;
    const supplierInvoice = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/supplier-invoices`)
      .set(auth(creatorToken))
      .send({
        bookingSupplierId: ids.bookingSupplier,
        invoiceNumber: `GL-S-${suffix}`,
        invoiceDate: '2026-09-01',
        currency: 'LKR',
        totalAmount: '300',
        status: 'APPROVED',
      })
      .expect(201);
    ids.supplierInvoice = (supplierInvoice.body as { id: string }).id;
    const receipt = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/passenger-payments`)
      .set(auth(creatorToken))
      .send({
        customerInvoiceId: ids.customerInvoice,
        companyBankAccountId: ids.bank,
        amount: '200',
        currency: 'LKR',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'GL-RECEIPT',
        paymentDate: '2026-09-02',
      })
      .expect(201);
    ids.receipt = (receipt.body as { id: string }).id;
    const supplierPayment = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/supplier-payments`)
      .set(auth(creatorToken))
      .send({
        bookingSupplierId: ids.bookingSupplier,
        supplierInvoiceId: ids.supplierInvoice,
        companyBankAccountId: ids.bank,
        amount: '100',
        currency: 'LKR',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'GL-SP',
        paymentDate: '2026-09-02',
      })
      .expect(201);
    ids.supplierPayment = (supplierPayment.body as { id: string }).id;
    const customerAdvance = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/customer-advances`)
      .set(auth(creatorToken))
      .send({
        companyBankAccountId: ids.bank,
        amount: '100',
        currency: 'LKR',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'GL-CA',
        paymentDate: '2026-09-02',
      })
      .expect(201);
    ids.customerAdvance = (customerAdvance.body as { id: string }).id;
    const customerAllocation = await request(app.getHttpServer())
      .post(`/customer-advances/${ids.customerAdvance}/allocations`)
      .set(auth(creatorToken))
      .send({ invoiceId: ids.customerInvoice, amount: '100' })
      .expect(201);
    ids.customerAllocation = (customerAllocation.body as { id: string }).id;
    const supplierAdvance = await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/supplier-advances`)
      .set(auth(creatorToken))
      .send({
        bookingSupplierId: ids.bookingSupplier,
        companyBankAccountId: ids.bank,
        amount: '50',
        currency: 'LKR',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'GL-SA',
        paymentDate: '2026-09-02',
      })
      .expect(201);
    ids.supplierAdvance = (supplierAdvance.body as { id: string }).id;
    const supplierAllocation = await request(app.getHttpServer())
      .post(`/supplier-advances/${ids.supplierAdvance}/allocations`)
      .set(auth(creatorToken))
      .send({ invoiceId: ids.supplierInvoice, amount: '50' })
      .expect(201);
    ids.supplierAllocation = (supplierAllocation.body as { id: string }).id;
    const charge = await request(app.getHttpServer())
      .post(`/banking/accounts/${ids.bank}/transactions`)
      .set(auth(creatorToken))
      .send({
        transactionDate: '2026-09-03',
        amount: '5',
        direction: 'DEBIT',
        sourceType: 'BANK_CHARGE',
        reference: 'GL-CHARGE',
        description: 'Bank charge',
      })
      .expect(201);
    ids.charge = (charge.body as { id: string }).id;

    const expected = [
      ['CUSTOMER_INVOICE', ids.customerInvoice, ['1200', '4000']],
      ['SUPPLIER_INVOICE', ids.supplierInvoice, ['5000', '2100']],
      ['CUSTOMER_RECEIPT', ids.receipt, ['1100', '1200']],
      ['SUPPLIER_PAYMENT', ids.supplierPayment, ['2100', '1100']],
      ['CUSTOMER_ADVANCE', ids.customerAdvance, ['1100', '2200']],
      ['CUSTOMER_ADVANCE_ALLOCATION', ids.customerAllocation, ['2200', '1200']],
      ['SUPPLIER_ADVANCE', ids.supplierAdvance, ['1300', '1100']],
      ['SUPPLIER_ADVANCE_ALLOCATION', ids.supplierAllocation, ['2100', '1300']],
      ['BANK_CHARGE', ids.charge, ['5100', '1100']],
    ] as const;
    for (const [sourceType, sourceRecordId, codes] of expected) {
      const journals = await prisma.journalEntry.findMany({
        where: { sourceType, sourceRecordId },
        include: { lines: { include: { account: true } } },
      });
      expect(journals).toHaveLength(1);
      expect(journals[0]).toMatchObject({
        status: 'POSTED',
        bookingId: sourceType === 'BANK_CHARGE' ? null : ids.booking,
      });
      expect(journals[0].lines.map((line) => line.account.code)).toEqual(
        expect.arrayContaining([...codes]),
      );
      expect(
        journals[0].lines
          .reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0))
          .equals(
            journals[0].lines.reduce(
              (sum, line) => sum.plus(line.credit),
              new Prisma.Decimal(0),
            ),
          ),
      ).toBe(true);
    }
    await expect(
      prisma.journalEntry.create({
        data: {
          journalNumber: `DUP-${suffix}`,
          journalDate: new Date(),
          description: 'Duplicate',
          sourceType: 'CUSTOMER_INVOICE',
          sourceRecordId: ids.customerInvoice,
          currency: 'LKR',
          createdById: ids.creator,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rolls back a source transaction when automatic posting cannot use its mapping', async () => {
    const ar = await prisma.glAccount.findUniqueOrThrow({
      where: { code: '1200' },
    });
    await prisma.glAccount.update({
      where: { id: ar.id },
      data: { isActive: false },
    });
    const invoiceNumber = `ROLLBACK-${suffix}`;
    await request(app.getHttpServer())
      .post(`/bookings/${ids.booking}/customer-invoices`)
      .set(auth(creatorToken))
      .send({
        invoiceNumber,
        invoiceDate: '2026-09-04',
        currency: 'LKR',
        totalAmount: '10',
      })
      .expect(409);
    expect(
      await prisma.customerInvoice.count({ where: { invoiceNumber } }),
    ).toBe(0);
    await prisma.glAccount.update({
      where: { id: ar.id },
      data: { isActive: true },
    });
  });

  it('records the required accounting audit history', async () => {
    const actions = await prisma.auditLog.findMany({
      where: { actorId: { in: [ids.creator, ids.approver] } },
      select: { action: true },
    });
    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'GL_ACCOUNT_CREATED',
        'GL_ACCOUNT_DEACTIVATED',
        'MANUAL_JOURNAL_CREATED',
        'JOURNAL_APPROVED',
        'JOURNAL_POSTED',
        'JOURNAL_REVERSED',
        'AUTOMATIC_JOURNAL_GENERATED',
      ]),
    );
  });
});
