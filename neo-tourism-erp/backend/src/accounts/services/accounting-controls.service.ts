import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/auth.types';
import type { RequestMetadata } from '../../common/request-metadata';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateAccountingPeriodDto,
  CreateExchangeRateDto,
  CreateTaxCodeDto,
  ReportDateQueryDto,
  UpdateAccountingSettingDto,
  UpdateExchangeRateDto,
  UpdateTaxCodeDto,
} from '../dto/accounting-controls.dto';

type Client = Prisma.TransactionClient | PrismaService;
const postedStatuses = ['POSTED', 'REVERSED'] as const;

@Injectable()
export class AccountingControlsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  settings() {
    return this.prisma.accountingSetting.findUniqueOrThrow({
      where: { id: 'default' },
    });
  }

  async updateSettings(
    dto: UpdateAccountingSettingDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.accountingSetting.findUnique({
        where: { id: 'default' },
      });
      if (old && old.baseCurrency !== dto.baseCurrency.toUpperCase()) {
        const posted = await tx.journalEntry.count({
          where: { status: { in: [...postedStatuses] } },
        });
        if (posted)
          throw new ConflictException(
            'Base currency cannot change after journals have been posted.',
          );
      }
      const value = await tx.accountingSetting.upsert({
        where: { id: 'default' },
        update: {
          baseCurrency: dto.baseCurrency.toUpperCase(),
          fiscalYearStartMonth: dto.fiscalYearStartMonth,
          updatedById: user.id,
        },
        create: {
          baseCurrency: dto.baseCurrency.toUpperCase(),
          fiscalYearStartMonth: dto.fiscalYearStartMonth,
          updatedById: user.id,
        },
      });
      await this.auditChange(
        tx,
        user,
        metadata,
        'AccountingSetting',
        '00000000-0000-4000-8000-000000000004',
        'ACCOUNTING_SETTING_CHANGED',
        old,
        value,
      );
      return value;
    });
  }

  listRates() {
    return this.prisma.exchangeRate.findMany({
      orderBy: [
        { effectiveDate: 'desc' },
        { fromCurrency: 'asc' },
        { toCurrency: 'asc' },
      ],
    });
  }

  async createRate(
    dto: CreateExchangeRateDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    if (dto.fromCurrency.toUpperCase() === dto.toCurrency.toUpperCase())
      throw new BadRequestException('Exchange-rate currencies must differ.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const value = await tx.exchangeRate.create({
          data: {
            fromCurrency: dto.fromCurrency.toUpperCase(),
            toCurrency: dto.toCurrency.toUpperCase(),
            rate: new Prisma.Decimal(dto.rate),
            effectiveDate: new Date(dto.effectiveDate),
            source: dto.source ?? 'MANUAL',
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await this.auditEvent(
          tx,
          user,
          metadata,
          'ExchangeRate',
          value.id,
          'EXCHANGE_RATE_CREATED',
          value,
        );
        return value;
      });
    } catch (error) {
      this.throwDuplicate(
        error,
        'An exchange rate already exists for that date.',
      );
    }
  }

  async updateRate(
    id: string,
    dto: UpdateExchangeRateDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.exchangeRate.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Exchange rate not found.');
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.exchangeRate.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.rate && { rate: new Prisma.Decimal(dto.rate) }),
          updatedById: user.id,
        },
      });
      await this.auditChange(
        tx,
        user,
        metadata,
        'ExchangeRate',
        id,
        'EXCHANGE_RATE_CHANGED',
        old,
        value,
      );
      return value;
    });
  }

  listTaxCodes() {
    return this.prisma.taxCode.findMany({
      include: { glAccount: true },
      orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async createTaxCode(
    dto: CreateTaxCodeDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertTaxAccount(dto.glAccountId, dto.classification);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const value = await tx.taxCode.create({
          data: {
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            rate: new Prisma.Decimal(dto.rate),
            taxType: dto.taxType.trim().toUpperCase(),
            classification: dto.classification,
            effectiveFrom: new Date(dto.effectiveFrom),
            isRecoverable: dto.isRecoverable ?? false,
            glAccountId: dto.glAccountId,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await this.auditEvent(
          tx,
          user,
          metadata,
          'TaxCode',
          value.id,
          'TAX_CODE_CREATED',
          value,
        );
        return value;
      });
    } catch (error) {
      this.throwDuplicate(error, 'Tax code already exists.');
    }
  }

  async updateTaxCode(
    id: string,
    dto: UpdateTaxCodeDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.taxCode.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Tax code not found.');
    await this.assertTaxAccount(
      dto.glAccountId ?? old.glAccountId ?? undefined,
      dto.classification ?? old.classification,
    );
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.taxCode.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.rate && { rate: new Prisma.Decimal(dto.rate) }),
          ...(dto.effectiveFrom && {
            effectiveFrom: new Date(dto.effectiveFrom),
          }),
          updatedById: user.id,
        },
      });
      await this.auditChange(
        tx,
        user,
        metadata,
        'TaxCode',
        id,
        'TAX_CODE_CHANGED',
        old,
        value,
      );
      return value;
    });
  }

  listPeriods() {
    return this.prisma.accountingPeriod.findMany({
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
    });
  }

  async createPeriod(
    dto: CreateAccountingPeriodDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate > endDate)
      throw new BadRequestException('Period start must not be after its end.');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const overlap = await tx.accountingPeriod.count({
            where: { startDate: { lte: endDate }, endDate: { gte: startDate } },
          });
          if (overlap)
            throw new ConflictException('Accounting periods cannot overlap.');
          const value = await tx.accountingPeriod.create({
            data: {
              name: dto.name.trim(),
              startDate,
              endDate,
              fiscalYear: dto.fiscalYear,
              createdById: user.id,
            },
          });
          await this.auditEvent(
            tx,
            user,
            metadata,
            'AccountingPeriod',
            value.id,
            'ACCOUNTING_PERIOD_CREATED',
            value,
          );
          return value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.throwDuplicate(error, 'Accounting period name already exists.');
    }
  }

  async startClosing(
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const period = await this.lockedPeriod(tx, id);
      if (period.status !== 'OPEN')
        throw new ConflictException('Only an open period can start closing.');
      const value = await tx.accountingPeriod.update({
        where: { id },
        data: { status: 'CLOSING' },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'AccountingPeriod',
        id,
        'ACCOUNTING_PERIOD_CLOSING',
        value,
      );
      return value;
    });
  }

  async closePeriod(
    id: string,
    notes: string | undefined,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const current = await this.prisma.accountingPeriod.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Accounting period not found.');
    if (current.status !== 'CLOSING')
      throw new ConflictException('Period must be in closing status.');
    const validation = await this.validatePeriod(this.prisma, current);
    if (!validation.valid) {
      await this.prisma.accountingPeriod.update({
        where: { id },
        data: { validationResult: this.json(validation) },
      });
      throw new ConflictException({
        message: 'Period close validation failed.',
        validation,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const period = await this.lockedPeriod(tx, id);
      if (period.status !== 'CLOSING')
        throw new ConflictException('Period must be in closing status.');
      const finalValidation = await this.validatePeriod(tx, period);
      if (!finalValidation.valid)
        throw new ConflictException(
          'Period data changed during close validation.',
        );
      const value = await tx.accountingPeriod.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closeNotes: notes,
          closedById: user.id,
          closedAt: new Date(),
          validationResult: this.json(finalValidation),
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'AccountingPeriod',
        id,
        'ACCOUNTING_PERIOD_CLOSED',
        value,
      );
      return value;
    });
  }

  async lockPeriod(
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const period = await this.lockedPeriod(tx, id);
      if (period.status !== 'CLOSED')
        throw new ConflictException('Only a closed period can be locked.');
      const value = await tx.accountingPeriod.update({
        where: { id },
        data: { status: 'LOCKED' },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'AccountingPeriod',
        id,
        'ACCOUNTING_PERIOD_LOCKED',
        value,
      );
      return value;
    });
  }

  async reopenPeriod(
    id: string,
    reason: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const period = await this.lockedPeriod(tx, id);
      if (!['CLOSED', 'LOCKED'].includes(period.status))
        throw new ConflictException(
          'Only a closed or locked period can be reopened.',
        );
      const value = await tx.accountingPeriod.update({
        where: { id },
        data: {
          status: 'OPEN',
          reopenedById: user.id,
          reopenedAt: new Date(),
          reopenReason: reason,
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'AccountingPeriod',
        id,
        'ACCOUNTING_PERIOD_REOPENED',
        value,
      );
      return value;
    });
  }

  async closeValidation(id: string) {
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { id },
    });
    if (!period) throw new NotFoundException('Accounting period not found.');
    return this.validatePeriod(this.prisma, period);
  }

  async assertOpenPeriod(client: Client, date: Date) {
    const period = await client.accountingPeriod.findFirst({
      where: { startDate: { lte: date }, endDate: { gte: date } },
    });
    if (!period || period.status !== 'OPEN')
      throw new ConflictException(
        'Accounting period is not open for this date.',
      );
    return period;
  }

  async valuation(
    client: Client,
    amount: Prisma.Decimal | string,
    currency: string,
    date: Date,
  ) {
    const setting = await client.accountingSetting.findUniqueOrThrow({
      where: { id: 'default' },
    });
    const from = currency.toUpperCase();
    if (from === setting.baseCurrency)
      return {
        exchangeRate: new Prisma.Decimal(1),
        baseCurrency: setting.baseCurrency,
        baseAmount: new Prisma.Decimal(amount).toDecimalPlaces(2),
      };
    const rate = await client.exchangeRate.findFirst({
      where: {
        fromCurrency: from,
        toCurrency: setting.baseCurrency,
        isActive: true,
        effectiveDate: { lte: date },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    if (!rate)
      throw new ConflictException(
        `No active ${from}/${setting.baseCurrency} exchange rate exists for this date.`,
      );
    return {
      exchangeRate: rate.rate,
      baseCurrency: setting.baseCurrency,
      baseAmount: new Prisma.Decimal(amount).mul(rate.rate).toDecimalPlaces(2),
    };
  }

  async invoiceAmounts(
    client: Client,
    totalAmount: string,
    netAmount: string | undefined,
    taxCodeId: string | undefined,
    classification: 'OUTPUT' | 'INPUT',
    date: Date,
    currency: string,
  ) {
    const total = new Prisma.Decimal(totalAmount);
    const net = netAmount ? new Prisma.Decimal(netAmount) : total;
    let tax = new Prisma.Decimal(0);
    let taxCode: {
      id: string;
      rate: Prisma.Decimal;
      classification: 'OUTPUT' | 'INPUT' | 'NONE';
      effectiveFrom: Date;
      isRecoverable: boolean;
      isActive: boolean;
      glAccountId: string | null;
    } | null = null;
    if (taxCodeId) {
      taxCode = await client.taxCode.findUnique({ where: { id: taxCodeId } });
      if (
        !taxCode?.isActive ||
        taxCode.effectiveFrom > date ||
        taxCode.classification !== classification
      )
        throw new BadRequestException('Tax code is invalid for this invoice.');
      if (!netAmount)
        throw new BadRequestException(
          'Net amount is required when a tax code is used.',
        );
      tax = net.mul(taxCode.rate).div(100).toDecimalPlaces(2);
      if (!net.plus(tax).equals(total))
        throw new BadRequestException(
          'Invoice total must equal net amount plus tax.',
        );
    } else if (netAmount && !net.equals(total)) {
      throw new BadRequestException(
        'Without a tax code, net and total amounts must match.',
      );
    }
    const value = await this.valuation(client, total, currency, date);
    return {
      netAmount: net,
      taxAmount: tax,
      totalAmount: total,
      taxCode,
      ...value,
    };
  }

  async profitAndLoss(query: ReportDateQueryDto) {
    const lines = await this.reportLines(query, ['REVENUE', 'EXPENSE']);
    const directCostId = (
      await this.prisma.accountingMapping.findUnique({
        where: { type: 'DIRECT_BOOKING_COST' },
      })
    )?.accountId;
    const grouped = this.groupReportLines(lines);
    const revenue = grouped.filter((row) => row.type === 'REVENUE');
    const directCosts = grouped.filter((row) => row.id === directCostId);
    const operatingExpenses = grouped.filter(
      (row) => row.type === 'EXPENSE' && row.id !== directCostId,
    );
    const revenueTotal = this.sum(
      revenue.map((row) => row.credit.minus(row.debit)),
    );
    const directCostTotal = this.sum(
      directCosts.map((row) => row.debit.minus(row.credit)),
    );
    const operatingExpenseTotal = this.sum(
      operatingExpenses.map((row) => row.debit.minus(row.credit)),
    );
    return {
      baseCurrency: await this.baseCurrency(),
      revenue,
      directCosts,
      operatingExpenses,
      revenueTotal,
      directCostTotal,
      grossProfit: revenueTotal.minus(directCostTotal),
      operatingExpenseTotal,
      netProfit: revenueTotal
        .minus(directCostTotal)
        .minus(operatingExpenseTotal),
    };
  }

  async balanceSheet(query: ReportDateQueryDto) {
    const asOf = query.asOf ?? query.dateTo;
    const lines = await this.reportLines({ dateTo: asOf }, [
      'ASSET',
      'LIABILITY',
      'EQUITY',
      'REVENUE',
      'EXPENSE',
    ]);
    const grouped = this.groupReportLines(lines);
    const assets = grouped.filter((row) => row.type === 'ASSET');
    const liabilities = grouped.filter((row) => row.type === 'LIABILITY');
    const equity = grouped.filter((row) => row.type === 'EQUITY');
    const assetTotal = this.sum(
      assets.map((row) => row.debit.minus(row.credit)),
    );
    const liabilityTotal = this.sum(
      liabilities.map((row) => row.credit.minus(row.debit)),
    );
    const equityAccountsTotal = this.sum(
      equity.map((row) => row.credit.minus(row.debit)),
    );
    const currentEarnings = this.sum(
      grouped
        .filter((row) => row.type === 'REVENUE')
        .map((row) => row.credit.minus(row.debit)),
    ).minus(
      this.sum(
        grouped
          .filter((row) => row.type === 'EXPENSE')
          .map((row) => row.debit.minus(row.credit)),
      ),
    );
    const equityTotal = equityAccountsTotal.plus(currentEarnings);
    return {
      baseCurrency: await this.baseCurrency(),
      asOf,
      assets,
      liabilities,
      equity,
      currentEarnings,
      assetTotal,
      liabilityTotal,
      equityTotal,
      difference: assetTotal.minus(liabilityTotal).minus(equityTotal),
    };
  }

  async cashFlow(query: ReportDateQueryDto) {
    const date = this.dateWhere(query);
    const [period, prior] = await Promise.all([
      this.prisma.journalLine.findMany({
        where: {
          companyBankAccountId: { not: null },
          journalEntry: {
            status: { in: [...postedStatuses] },
            ...(date && { journalDate: date }),
          },
        },
        include: { journalEntry: true, companyBankAccount: true },
      }),
      query.dateFrom
        ? this.prisma.journalLine.findMany({
            where: {
              companyBankAccountId: { not: null },
              journalEntry: {
                status: { in: [...postedStatuses] },
                journalDate: { lt: new Date(query.dateFrom) },
              },
            },
          })
        : Promise.resolve([]),
    ]);
    const openingCash = this.sum(
      prior.map((row) => row.baseDebit.minus(row.baseCredit)),
    );
    const inflows = this.sum(period.map((row) => row.baseDebit));
    const outflows = this.sum(period.map((row) => row.baseCredit));
    return {
      baseCurrency: await this.baseCurrency(),
      openingCash,
      inflows,
      outflows,
      closingCash: openingCash.plus(inflows).minus(outflows),
      transactions: period.map((row) => ({
        journalId: row.journalEntryId,
        journalNumber: row.journalEntry.journalNumber,
        date: row.journalEntry.journalDate,
        description: row.journalEntry.description,
        inflow: row.baseDebit,
        outflow: row.baseCredit,
        companyBankAccount: row.companyBankAccount,
      })),
      forecast: await this.cashForecast(query.asOf ?? query.dateTo),
    };
  }

  async taxSummary(query: ReportDateQueryDto) {
    const invoiceDate = this.dateWhere(query);
    const [sales, purchases] = await Promise.all([
      this.prisma.customerInvoice.findMany({
        where: {
          taxAmount: { gt: 0 },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          ...(invoiceDate && { invoiceDate }),
        },
        include: { taxCode: true, booking: true, customer: true },
      }),
      this.prisma.supplierInvoice.findMany({
        where: {
          taxAmount: { gt: 0 },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          ...(invoiceDate && { invoiceDate }),
        },
        include: { taxCode: true, booking: true, supplier: true },
      }),
    ]);
    const posted = await this.prisma.journalEntry.findMany({
      where: {
        status: { in: [...postedStatuses] },
        OR: [
          {
            sourceType: 'CUSTOMER_INVOICE',
            sourceRecordId: { in: sales.map((row) => row.id) },
          },
          {
            sourceType: 'SUPPLIER_INVOICE',
            sourceRecordId: { in: purchases.map((row) => row.id) },
          },
        ],
      },
      select: { id: true, sourceRecordId: true, journalNumber: true },
    });
    const bySource = new Map(
      posted.map((journal) => [journal.sourceRecordId, journal]),
    );
    const taxableSales = sales.filter((row) => bySource.has(row.id));
    const taxablePurchases = purchases.filter((row) => bySource.has(row.id));
    const outputTax = this.sum(
      taxableSales.map((row) => row.taxAmount.mul(row.exchangeRate)),
    );
    const inputTax = this.sum(
      taxablePurchases
        .filter((row) => row.taxCode?.isRecoverable)
        .map((row) => row.taxAmount.mul(row.exchangeRate)),
    );
    return {
      baseCurrency: await this.baseCurrency(),
      taxableSales: this.sum(
        taxableSales.map((row) => row.netAmount.mul(row.exchangeRate)),
      ),
      outputTax,
      taxablePurchases: this.sum(
        taxablePurchases.map((row) => row.netAmount.mul(row.exchangeRate)),
      ),
      inputTax,
      netTaxPosition: outputTax.minus(inputTax),
      sales: taxableSales.map((row) => ({
        ...row,
        journal: bySource.get(row.id),
      })),
      purchases: taxablePurchases.map((row) => ({
        ...row,
        journal: bySource.get(row.id),
      })),
    };
  }

  arAgeing(query: ReportDateQueryDto) {
    return this.ageing('customer', query.asOf);
  }

  apAgeing(query: ReportDateQueryDto) {
    return this.ageing('supplier', query.asOf);
  }

  async customerStatement(customerId: string, query: ReportDateQueryDto) {
    const date = this.dateWhere(query);
    const [invoices, payments, advances] = await Promise.all([
      this.prisma.customerInvoice.findMany({
        where: {
          customerId,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          ...(date && { invoiceDate: date }),
        },
        include: {
          booking: { select: { id: true, folderNumber: true } },
          advanceAllocations: true,
        },
        orderBy: { invoiceDate: 'asc' },
      }),
      this.prisma.passengerPayment.findMany({
        where: {
          booking: { customerId },
          status: { in: ['RECEIVED', 'VERIFIED'] },
          ...(date && { paymentDate: date }),
        },
        include: { booking: { select: { id: true, folderNumber: true } } },
        orderBy: { paymentDate: 'asc' },
      }),
      this.prisma.customerAdvance.findMany({
        where: {
          customerId,
          cancelledAt: null,
          ...(date && { paymentDate: date }),
        },
        include: {
          booking: { select: { id: true, folderNumber: true } },
          allocations: true,
        },
        orderBy: { paymentDate: 'asc' },
      }),
    ]);
    const invoiceTotal = this.sum(invoices.map((row) => row.totalAmount));
    const receiptTotal = this.sum(payments.map((row) => row.amount));
    const allocated = this.sum(
      advances.flatMap((advance) =>
        advance.allocations
          .filter((row) => !row.reversedAt)
          .map((row) => row.amount),
      ),
    );
    const advanceTotal = this.sum(advances.map((row) => row.amount));
    const baseInvoiceTotal = this.sum(
      invoices.map((row) => row.baseTotalAmount),
    );
    const baseReceiptTotal = this.sum(payments.map((row) => row.baseAmount));
    const baseAllocated = this.sum(
      advances.flatMap((advance) =>
        advance.allocations
          .filter((row) => !row.reversedAt)
          .map((row) => row.amount.mul(advance.exchangeRate)),
      ),
    );
    return {
      baseCurrency: await this.baseCurrency(),
      customerId,
      invoices,
      receipts: payments,
      advances,
      invoiceTotal,
      receiptTotal,
      allocatedAdvanceTotal: allocated,
      unallocatedAdvanceTotal: advanceTotal.minus(allocated),
      outstanding: invoiceTotal.minus(receiptTotal).minus(allocated),
      baseInvoiceTotal,
      baseReceiptTotal,
      baseAllocatedAdvanceTotal: baseAllocated,
      baseOutstanding: baseInvoiceTotal
        .minus(baseReceiptTotal)
        .minus(baseAllocated),
    };
  }

  async supplierStatement(supplierId: string, query: ReportDateQueryDto) {
    const date = this.dateWhere(query);
    const [invoices, payments, advances] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where: {
          supplierId,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          ...(date && { invoiceDate: date }),
        },
        include: {
          booking: { select: { id: true, folderNumber: true } },
          advanceAllocations: true,
        },
        orderBy: { invoiceDate: 'asc' },
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          bookingSupplier: { supplierId },
          status: { in: ['PAID', 'VERIFIED'] },
          ...(date && { paymentDate: date }),
        },
        include: { booking: { select: { id: true, folderNumber: true } } },
        orderBy: { paymentDate: 'asc' },
      }),
      this.prisma.supplierAdvance.findMany({
        where: {
          supplierId,
          cancelledAt: null,
          ...(date && { paymentDate: date }),
        },
        include: {
          booking: { select: { id: true, folderNumber: true } },
          allocations: true,
        },
        orderBy: { paymentDate: 'asc' },
      }),
    ]);
    const invoiceTotal = this.sum(invoices.map((row) => row.totalAmount));
    const paymentTotal = this.sum(payments.map((row) => row.amount));
    const allocated = this.sum(
      advances.flatMap((advance) =>
        advance.allocations
          .filter((row) => !row.reversedAt)
          .map((row) => row.amount),
      ),
    );
    const advanceTotal = this.sum(advances.map((row) => row.amount));
    const baseInvoiceTotal = this.sum(
      invoices.map((row) => row.baseTotalAmount),
    );
    const basePaymentTotal = this.sum(payments.map((row) => row.baseAmount));
    const baseAllocated = this.sum(
      advances.flatMap((advance) =>
        advance.allocations
          .filter((row) => !row.reversedAt)
          .map((row) => row.amount.mul(advance.exchangeRate)),
      ),
    );
    return {
      baseCurrency: await this.baseCurrency(),
      supplierId,
      invoices,
      payments,
      advances,
      invoiceTotal,
      paymentTotal,
      allocatedAdvanceTotal: allocated,
      unallocatedAdvanceTotal: advanceTotal.minus(allocated),
      outstanding: invoiceTotal.minus(paymentTotal).minus(allocated),
      baseInvoiceTotal,
      basePaymentTotal,
      baseAllocatedAdvanceTotal: baseAllocated,
      baseOutstanding: baseInvoiceTotal
        .minus(basePaymentTotal)
        .minus(baseAllocated),
    };
  }

  private async ageing(kind: 'customer' | 'supplier', asOf?: string) {
    const date = asOf ? new Date(asOf) : new Date();
    if (kind === 'customer') {
      const rows = await this.prisma.customerInvoice.findMany({
        where: { status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] } },
        include: {
          customer: true,
          booking: { select: { id: true, folderNumber: true } },
          payments: { where: { status: { in: ['RECEIVED', 'VERIFIED'] } } },
          advanceAllocations: { where: { reversedAt: null } },
        },
        orderBy: { dueDate: 'asc' },
      });
      return rows
        .map((row) => {
          const outstanding = Prisma.Decimal.max(
            row.totalAmount
              .minus(this.sum(row.payments.map((payment) => payment.amount)))
              .minus(
                this.sum(row.advanceAllocations.map((item) => item.amount)),
              ),
            0,
          );
          return {
            ...row,
            outstanding,
            baseOutstanding: outstanding
              .mul(row.exchangeRate)
              .toDecimalPlaces(2),
            ageingBucket: this.ageingBucket(row.dueDate, date),
          };
        })
        .filter((row) => row.outstanding.greaterThan(0));
    }
    const rows = await this.prisma.supplierInvoice.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] } },
      include: {
        supplier: true,
        booking: { select: { id: true, folderNumber: true } },
        payments: { where: { status: { in: ['PAID', 'VERIFIED'] } } },
        advanceAllocations: { where: { reversedAt: null } },
      },
      orderBy: { dueDate: 'asc' },
    });
    return rows
      .map((row) => {
        const outstanding = Prisma.Decimal.max(
          row.totalAmount
            .minus(this.sum(row.payments.map((payment) => payment.amount)))
            .minus(this.sum(row.advanceAllocations.map((item) => item.amount))),
          0,
        );
        return {
          ...row,
          outstanding,
          baseOutstanding: outstanding.mul(row.exchangeRate).toDecimalPlaces(2),
          ageingBucket: this.ageingBucket(row.dueDate, date),
        };
      })
      .filter((row) => row.outstanding.greaterThan(0));
  }

  private async cashForecast(asOf?: string) {
    const date = asOf ? new Date(asOf) : new Date();
    const [receivables, payables] = await Promise.all([
      this.ageing('customer', date.toISOString().slice(0, 10)),
      this.ageing('supplier', date.toISOString().slice(0, 10)),
    ]);
    return {
      asOf: date,
      expectedInflows: this.sum(receivables.map((row) => row.baseOutstanding)),
      expectedOutflows: this.sum(payables.map((row) => row.baseOutstanding)),
      receivables,
      payables,
    };
  }

  private async reportLines(query: ReportDateQueryDto, types: string[]) {
    const date = this.dateWhere(query);
    return this.prisma.journalLine.findMany({
      where: {
        account: { type: { in: types as never[] } },
        journalEntry: {
          status: { in: [...postedStatuses] },
          ...(date && { journalDate: date }),
        },
      },
      include: { account: true, journalEntry: true },
    });
  }

  private groupReportLines<
    T extends {
      account: { id: string; code: string; name: string; type: string };
      baseDebit: Prisma.Decimal;
      baseCredit: Prisma.Decimal;
    },
  >(lines: T[]) {
    const grouped = new Map<
      string,
      T['account'] & { debit: Prisma.Decimal; credit: Prisma.Decimal }
    >();
    for (const line of lines) {
      const current = grouped.get(line.account.id) ?? {
        ...line.account,
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      current.debit = current.debit.plus(line.baseDebit);
      current.credit = current.credit.plus(line.baseCredit);
      grouped.set(line.account.id, current);
    }
    return [...grouped.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  private dateWhere(query: ReportDateQueryDto) {
    return query.dateFrom || query.dateTo
      ? {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        }
      : undefined;
  }

  private ageingBucket(dueDate: Date | null, asOf: Date) {
    if (!dueDate || dueDate >= asOf) return 'CURRENT';
    const days = Math.ceil((asOf.getTime() - dueDate.getTime()) / 86_400_000);
    if (days <= 30) return '1_30';
    if (days <= 60) return '31_60';
    if (days <= 90) return '61_90';
    return '90_PLUS';
  }

  private async validatePeriod(
    client: Client,
    period: { startDate: Date; endDate: Date },
  ) {
    const [
      totals,
      unreconciledStatements,
      unresolvedDiscrepancies,
      unpostedJournals,
      unreconciledBookings,
    ] = await Promise.all([
      client.journalLine.aggregate({
        where: {
          journalEntry: {
            status: { in: [...postedStatuses] },
            journalDate: { gte: period.startDate, lte: period.endDate },
          },
        },
        _sum: { baseDebit: true, baseCredit: true },
      }),
      client.bankStatement.count({
        where: {
          periodStart: { lte: period.endDate },
          periodEnd: { gte: period.startDate },
          status: { not: 'RECONCILED' },
        },
      }),
      client.reconciliationDiscrepancy.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          booking: {
            travelStartDate: { gte: period.startDate, lte: period.endDate },
          },
        },
      }),
      client.journalEntry.count({
        where: {
          journalDate: { gte: period.startDate, lte: period.endDate },
          status: { in: ['DRAFT', 'APPROVED'] },
        },
      }),
      client.booking.count({
        where: {
          finalServiceDate: { gte: period.startDate, lte: period.endDate },
          OR: [
            { reconciliation: { is: null } },
            { reconciliation: { is: { status: { not: 'RECONCILED' } } } },
          ],
        },
      }),
    ]);
    const debit = totals._sum.baseDebit ?? new Prisma.Decimal(0);
    const credit = totals._sum.baseCredit ?? new Prisma.Decimal(0);
    const validation = {
      trialBalanceDifference: debit.minus(credit),
      unreconciledStatements,
      unresolvedDiscrepancies,
      unpostedJournals,
      unreconciledBookings,
      arApValid: true,
    };
    return {
      ...validation,
      valid:
        validation.trialBalanceDifference.isZero() &&
        !unreconciledStatements &&
        !unresolvedDiscrepancies &&
        !unpostedJournals &&
        !unreconciledBookings,
    };
  }

  private async lockedPeriod(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "AccountingPeriod" WHERE "id" = ${id}::uuid FOR UPDATE
    `;
    if (!rows.length)
      throw new NotFoundException('Accounting period not found.');
    return tx.accountingPeriod.findUniqueOrThrow({ where: { id } });
  }

  private async assertTaxAccount(
    id: string | undefined,
    classification: 'OUTPUT' | 'INPUT' | 'NONE',
  ) {
    if (classification === 'NONE') return;
    if (!id) throw new BadRequestException('A tax GL account is required.');
    const account = await this.prisma.glAccount.findUnique({ where: { id } });
    const expected = classification === 'OUTPUT' ? 'LIABILITY' : 'ASSET';
    if (!account?.isActive || account.type !== expected)
      throw new BadRequestException(
        `Tax GL account must be an active ${expected.toLowerCase()}.`,
      );
  }

  private async baseCurrency() {
    return (await this.settings()).baseCurrency;
  }

  private sum(values: Prisma.Decimal[]) {
    return values.reduce(
      (sum, value) => sum.plus(value),
      new Prisma.Decimal(0),
    );
  }

  private throwDuplicate(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private auditEvent(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    entityType: string,
    entityId: string,
    action: string,
    value: unknown,
  ) {
    return this.audit.log(
      {
        actorUserId: user.id,
        entityType,
        entityId,
        action,
        newValues: this.json(value),
        requestMetadata: metadata,
      },
      tx,
    );
  }

  private auditChange(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    entityType: string,
    entityId: string,
    action: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    return this.audit.log(
      {
        actorUserId: user.id,
        entityType,
        entityId,
        action,
        oldValues: this.json(oldValue),
        newValues: this.json(newValue),
        requestMetadata: metadata,
      },
      tx,
    );
  }
}
