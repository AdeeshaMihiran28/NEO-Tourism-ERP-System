import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsStatus,
  BookingAdjustmentType,
  DiscrepancyStatus,
  NotificationType,
  PassengerPaymentStatus,
  Prisma,
  ReconciliationStatus,
  SupplierPaymentStatus,
} from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingLifecycleService } from '../../bookings/services/booking-lifecycle.service';
import type {
  AccountsQueueQueryDto,
  AllocateAdvanceDto,
  CreateAdvanceDto,
  CreateAdjustmentDto,
  CreateCustomerInvoiceDto,
  CreateDiscrepancyDto,
  CreatePassengerPaymentDto,
  CreateSupplierPaymentDto,
  CreateSupplierAdvanceDto,
  CreateSupplierInvoiceDto,
  DiscrepancyQueryDto,
  InvoiceListQueryDto,
  ResolveDiscrepancyDto,
  ReverseAllocationDto,
  UpdatePassengerPaymentDto,
  UpdateCustomerInvoiceDto,
  UpdateReconciliationDto,
  UpdateSupplierPaymentDto,
  UpdateSupplierInvoiceDto,
} from '../dto/accounts.dto';
import { BankingService } from './banking.service';
import { GeneralLedgerService } from './general-ledger.service';
import { AccountingControlsService } from './accounting-controls.service';

const moneySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

@Injectable()
export class BookingFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly lifecycle: BookingLifecycleService,
    private readonly banking: BankingService,
    private readonly ledger: GeneralLedgerService,
    private readonly controls: AccountingControlsService,
  ) {}

  async queue(query: AccountsQueueQueryDto) {
    const where: Prisma.BookingWhereInput = {
      accountsStatus: query.status
        ? query.status
        : { in: ['NOT_STARTED', 'RECONCILIATION_PENDING', 'DISCREPANCY'] },
      ...(query.folderNumber && {
        folderNumber: { contains: query.folderNumber, mode: 'insensitive' },
      }),
      ...(query.customer && {
        customer: {
          OR: [
            { firstName: { contains: query.customer, mode: 'insensitive' } },
            { lastName: { contains: query.customer, mode: 'insensitive' } },
            { email: { contains: query.customer, mode: 'insensitive' } },
          ],
        },
      }),
      ...(query.salesAdvisorId && { salesAdvisorId: query.salesAdvisorId }),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom && {
                gte: new Date(`${query.dateFrom}T00:00:00.000Z`),
              }),
              ...(query.dateTo && {
                lte: new Date(`${query.dateTo}T23:59:59.999Z`),
              }),
            },
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [total, data] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        select: {
          id: true,
          folderNumber: true,
          travelStartDate: true,
          travelEndDate: true,
          sellingPrice: true,
          currency: true,
          accountsStatus: true,
          createdAt: true,
          customer: { select: { id: true, firstName: true, lastName: true } },
          salesAdvisor: { select: moneySelect },
          reconciliation: {
            select: { id: true, status: true, updatedAt: true },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
    ]);
    return this.page(data, query, total);
  }

  async dashboard() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [pending, inReview, discrepancies, reconciledToday] =
      await Promise.all([
        this.prisma.booking.count({ where: { accountsStatus: 'NOT_STARTED' } }),
        this.prisma.booking.count({
          where: { accountsStatus: 'RECONCILIATION_PENDING' },
        }),
        this.prisma.booking.count({ where: { accountsStatus: 'DISCREPANCY' } }),
        this.prisma.reconciliation.count({
          where: { status: 'RECONCILED', reconciledAt: { gte: start } },
        }),
      ]);
    return {
      reconciliationPending: pending,
      inReview,
      discrepancies,
      reconciledToday,
    };
  }

  async reconciled(query: AccountsQueueQueryDto) {
    query.status = AccountsStatus.RECONCILED;
    const result = await this.queue(query);
    const ids = result.data.map((item) => item.id);
    const details = await this.prisma.booking.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        finance: { select: { expectedProfit: true } },
        reconciliation: {
          select: { reconciledAt: true, reconciledBy: { select: moneySelect } },
        },
      },
    });
    const byId = new Map(details.map((item) => [item.id, item]));
    return {
      ...result,
      data: result.data.map((item) => ({ ...item, ...byId.get(item.id) })),
    };
  }

  async financialSummary(bookingId: string, persist = true) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        suppliers: { select: { supplierCost: true } },
        passengerPayments: { select: { amount: true, status: true } },
        supplierPayments: { select: { amount: true, status: true } },
        adjustments: { select: { amount: true, type: true, approvedAt: true } },
        customerInvoices: {
          where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
          select: {
            totalAmount: true,
            payments: {
              where: { status: { in: ['RECEIVED', 'VERIFIED'] } },
              select: { amount: true },
            },
            advanceAllocations: {
              where: { reversedAt: null },
              select: { amount: true },
            },
          },
        },
        supplierInvoices: {
          where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
          select: {
            totalAmount: true,
            payments: {
              where: { status: { in: ['PAID', 'VERIFIED'] } },
              select: { amount: true },
            },
            advanceAllocations: {
              where: { reversedAt: null },
              select: { amount: true },
            },
          },
        },
        customerAdvances: {
          where: { cancelledAt: null },
          select: {
            amount: true,
            allocations: {
              where: { reversedAt: null },
              select: { amount: true },
            },
          },
        },
        supplierAdvances: {
          where: { cancelledAt: null },
          select: {
            amount: true,
            allocations: {
              where: { reversedAt: null },
              select: { amount: true },
            },
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');

    const zero = new Prisma.Decimal(0);
    const supplierItems = booking.suppliers
      .map(({ supplierCost }) => supplierCost)
      .filter((value): value is Prisma.Decimal => value !== null);
    const supplierCost = supplierItems.length
      ? supplierItems.reduce((sum, value) => sum.plus(value), zero)
      : (booking.supplierCost ?? zero);
    const approved = booking.adjustments.filter(
      ({ approvedAt }) => approvedAt !== null,
    );
    const fees = this.total(
      approved.filter((a) => a.type === BookingAdjustmentType.FEE),
    );
    const discounts = this.total(
      approved.filter((a) => a.type === BookingAdjustmentType.DISCOUNT),
    );
    const refunds = this.total(
      approved.filter((a) => a.type === BookingAdjustmentType.REFUND),
    );
    const adjustments = approved.reduce((sum, item) => {
      if (
        item.type === BookingAdjustmentType.FEE ||
        item.type === BookingAdjustmentType.DISCOUNT ||
        item.type === BookingAdjustmentType.REFUND
      )
        return sum;
      return sum.plus(item.amount);
    }, zero);
    const passengerPaymentsReceived = this.total(
      booking.passengerPayments.filter(
        (p) =>
          p.status === PassengerPaymentStatus.RECEIVED ||
          p.status === PassengerPaymentStatus.VERIFIED,
      ),
    );
    const supplierPaymentsMade = this.total(
      booking.supplierPayments.filter(
        (p) =>
          p.status === SupplierPaymentStatus.PAID ||
          p.status === SupplierPaymentStatus.VERIFIED,
      ),
    );
    const expectedRevenue = booking.sellingPrice
      .plus(fees)
      .minus(discounts)
      .minus(refunds)
      .plus(adjustments);
    const expectedProfit = expectedRevenue.minus(supplierCost);
    const grossMargin = expectedRevenue.isZero()
      ? zero
      : expectedProfit.div(expectedRevenue).mul(100).toDecimalPlaces(2);
    const invoicedAmount = booking.customerInvoices.reduce(
      (sum, invoice) => sum.plus(invoice.totalAmount),
      zero,
    );
    const invoiceReceipts = booking.customerInvoices.flatMap(
      (invoice) => invoice.payments,
    );
    const allocatedCustomerAdvances = this.total(
      booking.customerInvoices.flatMap((invoice) => invoice.advanceAllocations),
    );
    const customerInvoicePaid = this.total(invoiceReceipts).plus(
      allocatedCustomerAdvances,
    );
    const customerAdvances = this.total(booking.customerAdvances);
    const supplierInvoiceAmount = booking.supplierInvoices.reduce(
      (sum, invoice) => sum.plus(invoice.totalAmount),
      zero,
    );
    const supplierInvoicePayments = booking.supplierInvoices.flatMap(
      (invoice) => invoice.payments,
    );
    const allocatedSupplierAdvances = this.total(
      booking.supplierInvoices.flatMap((invoice) => invoice.advanceAllocations),
    );
    const supplierInvoicePaid = this.total(supplierInvoicePayments).plus(
      allocatedSupplierAdvances,
    );
    const supplierAdvances = this.total(booking.supplierAdvances);
    if (persist)
      await this.prisma.bookingFinance.upsert({
        where: { bookingId },
        update: {
          sellingPrice: booking.sellingPrice,
          supplierCost,
          fees,
          discounts,
          adjustments: adjustments.minus(refunds),
          expectedRevenue,
          expectedProfit,
          currency: booking.currency.toUpperCase(),
        },
        create: {
          bookingId,
          sellingPrice: booking.sellingPrice,
          supplierCost,
          fees,
          discounts,
          adjustments: adjustments.minus(refunds),
          expectedRevenue,
          expectedProfit,
          currency: booking.currency.toUpperCase(),
        },
      });
    return {
      sellingPrice: booking.sellingPrice,
      supplierCost,
      fees,
      discounts,
      refunds,
      adjustments,
      passengerPaymentsReceived,
      supplierPaymentsMade,
      expectedRevenue,
      expectedProfit,
      grossProfit: expectedProfit,
      grossMargin,
      invoicedAmount,
      customerAdvances,
      allocatedCustomerAdvances,
      customerOutstanding: Prisma.Decimal.max(
        invoicedAmount.minus(customerInvoicePaid),
        zero,
      ),
      supplierInvoiceAmount,
      supplierAdvances,
      allocatedSupplierAdvances,
      supplierOutstanding: Prisma.Decimal.max(
        supplierInvoiceAmount.minus(supplierInvoicePaid),
        zero,
      ),
      passengerBalance: expectedRevenue
        .minus(passengerPaymentsReceived)
        .minus(allocatedCustomerAdvances),
      supplierBalance: supplierCost
        .minus(supplierPaymentsMade)
        .minus(allocatedSupplierAdvances),
      currency: booking.currency.toUpperCase(),
    };
  }

  async bookingProfitabilityReport() {
    const bookings = await this.prisma.booking.findMany({
      select: {
        id: true,
        folderNumber: true,
        currency: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
        reconciliation: { select: { status: true, reconciledAt: true } },
      },
      orderBy: { folderNumber: 'asc' },
      take: 1000,
    });
    // ponytail: reuse the trusted booking calculation until report volume warrants batching.
    return Promise.all(
      bookings.map(async (booking) => ({
        ...booking,
        financials: await this.financialSummary(booking.id, false),
      })),
    );
  }

  async listCustomerInvoices(bookingId: string) {
    await this.assertBooking(bookingId);
    const rows = await this.prisma.customerInvoice.findMany({
      where: { bookingId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        booking: { select: { id: true, folderNumber: true } },
        payments: { select: { amount: true, status: true } },
        advanceAllocations: { select: { amount: true, reversedAt: true } },
        document: { select: { id: true, fileName: true, category: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.customerInvoiceView(row));
  }

  async receivables(query: InvoiceListQueryDto) {
    const where: Prisma.CustomerInvoiceWhereInput = {
      status: { not: 'CANCELLED' },
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          {
            booking: {
              folderNumber: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            customer: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
        ],
      }),
      ...(query.dateFrom || query.dateTo
        ? {
            dueDate: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.customerInvoice.count({ where }),
      this.prisma.customerInvoice.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          booking: { select: { id: true, folderNumber: true } },
          payments: { select: { amount: true, status: true } },
          advanceAllocations: { select: { amount: true, reversedAt: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(
      rows.map((row) => this.customerInvoiceView(row)),
      query,
      total,
    );
  }

  async createCustomerInvoice(
    bookingId: string,
    dto: CreateCustomerInvoiceDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true, currency: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    this.assertInvoiceCurrency(booking.currency, dto.currency);
    if (dto.status && !['DRAFT', 'ISSUED'].includes(dto.status))
      throw new BadRequestException(
        'A new customer invoice must be DRAFT or ISSUED.',
      );
    await this.assertDocument(bookingId, dto.documentId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const amounts = await this.controls.invoiceAmounts(
          tx,
          dto.totalAmount,
          dto.netAmount,
          dto.taxCodeId,
          'OUTPUT',
          new Date(dto.invoiceDate),
          dto.currency,
        );
        const value = await tx.customerInvoice.create({
          data: {
            bookingId,
            customerId: booking.customerId,
            invoiceNumber: dto.invoiceNumber.trim(),
            invoiceDate: new Date(dto.invoiceDate),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            currency: dto.currency.toUpperCase(),
            netAmount: amounts.netAmount,
            taxAmount: amounts.taxAmount,
            totalAmount: amounts.totalAmount,
            exchangeRate: amounts.exchangeRate,
            baseCurrency: amounts.baseCurrency,
            baseTotalAmount: amounts.baseAmount,
            taxCodeId: amounts.taxCode?.id,
            status: dto.status ?? 'ISSUED',
            documentId: dto.documentId,
            createdById: user.id,
          },
        });
        if (value.status === 'ISSUED')
          await this.ledger.postAutomatic(
            tx,
            {
              sourceType: 'CUSTOMER_INVOICE',
              sourceRecordId: value.id,
              date: value.invoiceDate,
              description: `Customer invoice ${value.invoiceNumber}`,
              currency: value.currency,
              bookingId: value.bookingId,
              lines: [
                {
                  mapping: 'ACCOUNTS_RECEIVABLE',
                  debit: value.totalAmount,
                  bookingId: value.bookingId,
                  customerId: value.customerId,
                },
                {
                  mapping: 'SALES_REVENUE',
                  credit: value.netAmount,
                  bookingId: value.bookingId,
                  customerId: value.customerId,
                },
                ...(amounts.taxCode && value.taxAmount.greaterThan(0)
                  ? [
                      {
                        accountId: amounts.taxCode.glAccountId!,
                        credit: value.taxAmount,
                        bookingId: value.bookingId,
                        customerId: value.customerId,
                      },
                    ]
                  : []),
              ],
            },
            user,
            metadata,
          );
        await this.auditFinance(
          tx,
          user,
          metadata,
          'CustomerInvoice',
          value.id,
          'CUSTOMER_INVOICE_CREATED',
          value,
        );
        return value;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Customer invoice number already exists.');
      throw error;
    }
  }

  async updateCustomerInvoice(
    id: string,
    dto: UpdateCustomerInvoiceDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.customerInvoice.findUnique({
      where: { id },
      include: {
        payments: true,
        advanceAllocations: { where: { reversedAt: null } },
      },
    });
    if (!old) throw new NotFoundException('Customer invoice not found.');
    await this.ledger.assertSourceEditable(this.prisma, 'CUSTOMER_INVOICE', id);
    await this.assertFinanceWritable(old.bookingId, user);
    if (old.status === 'CANCELLED')
      throw new ConflictException('Cancelled invoices cannot be edited.');
    if (dto.status && !['DRAFT', 'ISSUED'].includes(dto.status))
      throw new BadRequestException(
        'Payment status is calculated from valid allocations.',
      );
    if (dto.currency) this.assertInvoiceCurrency(old.currency, dto.currency);
    await this.assertDocument(old.bookingId, dto.documentId);
    const applied = this.total(
      old.payments.filter((payment) =>
        ['RECEIVED', 'VERIFIED'].includes(payment.status),
      ),
    ).plus(this.total(old.advanceAllocations));
    if (dto.status === 'DRAFT' && !applied.isZero())
      throw new ConflictException(
        'An invoice with applied payments cannot return to draft.',
      );
    if (
      dto.totalAmount &&
      new Prisma.Decimal(dto.totalAmount).lessThan(applied)
    )
      throw new ConflictException(
        'Invoice total cannot be less than its applied payments.',
      );
    return this.prisma.$transaction(async (tx) => {
      const invoiceDate = dto.invoiceDate
        ? new Date(dto.invoiceDate)
        : old.invoiceDate;
      const currency = dto.currency ?? old.currency;
      const amounts = await this.controls.invoiceAmounts(
        tx,
        dto.totalAmount ?? old.totalAmount.toString(),
        dto.netAmount ?? old.netAmount.toString(),
        dto.taxCodeId ?? old.taxCodeId ?? undefined,
        'OUTPUT',
        invoiceDate,
        currency,
      );
      const value = await tx.customerInvoice.update({
        where: { id },
        data: {
          status: dto.status,
          documentId: dto.documentId,
          ...(dto.invoiceNumber && { invoiceNumber: dto.invoiceNumber.trim() }),
          ...(dto.invoiceDate && { invoiceDate: new Date(dto.invoiceDate) }),
          ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          netAmount: amounts.netAmount,
          taxAmount: amounts.taxAmount,
          totalAmount: amounts.totalAmount,
          exchangeRate: amounts.exchangeRate,
          baseCurrency: amounts.baseCurrency,
          baseTotalAmount: amounts.baseAmount,
          taxCodeId: amounts.taxCode?.id,
        },
      });
      if (value.status === 'ISSUED')
        await this.ledger.postAutomatic(
          tx,
          {
            sourceType: 'CUSTOMER_INVOICE',
            sourceRecordId: value.id,
            date: value.invoiceDate,
            description: `Customer invoice ${value.invoiceNumber}`,
            currency: value.currency,
            bookingId: value.bookingId,
            lines: [
              {
                mapping: 'ACCOUNTS_RECEIVABLE',
                debit: value.totalAmount,
                bookingId: value.bookingId,
                customerId: value.customerId,
              },
              {
                mapping: 'SALES_REVENUE',
                credit: value.netAmount,
                bookingId: value.bookingId,
                customerId: value.customerId,
              },
              ...(amounts.taxCode && value.taxAmount.greaterThan(0)
                ? [
                    {
                      accountId: amounts.taxCode.glAccountId!,
                      credit: value.taxAmount,
                      bookingId: value.bookingId,
                      customerId: value.customerId,
                    },
                  ]
                : []),
            ],
          },
          user,
          metadata,
        );
      await this.syncCustomerInvoiceStatus(tx, id);
      await this.auditFinance(
        tx,
        user,
        metadata,
        'CustomerInvoice',
        id,
        'CUSTOMER_INVOICE_UPDATED',
        value,
      );
      return value;
    });
  }

  async listSupplierInvoices(bookingId: string) {
    await this.assertBooking(bookingId);
    const rows = await this.prisma.supplierInvoice.findMany({
      where: { bookingId },
      include: {
        supplier: { select: { id: true, name: true } },
        booking: { select: { id: true, folderNumber: true } },
        payments: { select: { amount: true, status: true } },
        advanceAllocations: { select: { amount: true, reversedAt: true } },
        document: { select: { id: true, fileName: true, category: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.supplierInvoiceView(row));
  }

  async payables(query: InvoiceListQueryDto) {
    const where: Prisma.SupplierInvoiceWhereInput = {
      status: { not: 'CANCELLED' },
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          {
            booking: {
              folderNumber: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            supplier: { name: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
      ...(query.dateFrom || query.dateTo
        ? {
            dueDate: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.supplierInvoice.count({ where }),
      this.prisma.supplierInvoice.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          booking: { select: { id: true, folderNumber: true } },
          payments: { select: { amount: true, status: true } },
          advanceAllocations: { select: { amount: true, reversedAt: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(
      rows.map((row) => this.supplierInvoiceView(row)),
      query,
      total,
    );
  }

  async createSupplierInvoice(
    bookingId: string,
    dto: CreateSupplierInvoiceDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    const bookingSupplier = await this.prisma.bookingSupplier.findFirst({
      where: { id: dto.bookingSupplierId, bookingId },
      select: {
        supplierId: true,
        currency: true,
        booking: { select: { currency: true } },
      },
    });
    if (!bookingSupplier)
      throw new BadRequestException(
        'Supplier does not belong to this booking.',
      );
    this.assertInvoiceCurrency(
      bookingSupplier.currency ?? bookingSupplier.booking.currency,
      dto.currency,
    );
    if (dto.status && !['DRAFT', 'APPROVED'].includes(dto.status))
      throw new BadRequestException(
        'A new supplier invoice must be DRAFT or APPROVED.',
      );
    await this.assertDocument(bookingId, dto.documentId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const amounts = await this.controls.invoiceAmounts(
          tx,
          dto.totalAmount,
          dto.netAmount,
          dto.taxCodeId,
          'INPUT',
          new Date(dto.invoiceDate),
          dto.currency,
        );
        const value = await tx.supplierInvoice.create({
          data: {
            bookingId,
            bookingSupplierId: dto.bookingSupplierId,
            supplierId: bookingSupplier.supplierId,
            invoiceNumber: dto.invoiceNumber.trim(),
            invoiceDate: new Date(dto.invoiceDate),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            currency: dto.currency.toUpperCase(),
            netAmount: amounts.netAmount,
            taxAmount: amounts.taxAmount,
            totalAmount: amounts.totalAmount,
            exchangeRate: amounts.exchangeRate,
            baseCurrency: amounts.baseCurrency,
            baseTotalAmount: amounts.baseAmount,
            taxCodeId: amounts.taxCode?.id,
            status: dto.status ?? 'APPROVED',
            documentId: dto.documentId,
            createdById: user.id,
          },
        });
        if (value.status === 'APPROVED')
          await this.ledger.postAutomatic(
            tx,
            {
              sourceType: 'SUPPLIER_INVOICE',
              sourceRecordId: value.id,
              date: value.invoiceDate,
              description: `Supplier invoice ${value.invoiceNumber}`,
              currency: value.currency,
              bookingId: value.bookingId,
              lines: [
                {
                  mapping: 'DIRECT_BOOKING_COST',
                  debit: amounts.taxCode?.isRecoverable
                    ? value.netAmount
                    : value.totalAmount,
                  bookingId: value.bookingId,
                  supplierId: value.supplierId,
                },
                ...(amounts.taxCode?.isRecoverable &&
                value.taxAmount.greaterThan(0)
                  ? [
                      {
                        accountId: amounts.taxCode.glAccountId!,
                        debit: value.taxAmount,
                        bookingId: value.bookingId,
                        supplierId: value.supplierId,
                      },
                    ]
                  : []),
                {
                  mapping: 'ACCOUNTS_PAYABLE',
                  credit: value.totalAmount,
                  bookingId: value.bookingId,
                  supplierId: value.supplierId,
                },
              ],
            },
            user,
            metadata,
          );
        await this.auditFinance(
          tx,
          user,
          metadata,
          'SupplierInvoice',
          value.id,
          'SUPPLIER_INVOICE_CREATED',
          value,
        );
        return value;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'This supplier invoice number already exists.',
        );
      throw error;
    }
  }

  async updateSupplierInvoice(
    id: string,
    dto: UpdateSupplierInvoiceDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.supplierInvoice.findUnique({
      where: { id },
      include: {
        payments: true,
        advanceAllocations: { where: { reversedAt: null } },
      },
    });
    if (!old) throw new NotFoundException('Supplier invoice not found.');
    await this.ledger.assertSourceEditable(this.prisma, 'SUPPLIER_INVOICE', id);
    await this.assertFinanceWritable(old.bookingId, user);
    if (old.status === 'CANCELLED')
      throw new ConflictException('Cancelled invoices cannot be edited.');
    if (dto.status && !['DRAFT', 'APPROVED'].includes(dto.status))
      throw new BadRequestException(
        'Payment status is calculated from valid allocations.',
      );
    if (dto.currency) this.assertInvoiceCurrency(old.currency, dto.currency);
    await this.assertDocument(old.bookingId, dto.documentId);
    const applied = this.total(
      old.payments.filter((payment) =>
        ['PAID', 'VERIFIED'].includes(payment.status),
      ),
    ).plus(this.total(old.advanceAllocations));
    if (dto.status === 'DRAFT' && !applied.isZero())
      throw new ConflictException(
        'An invoice with applied payments cannot return to draft.',
      );
    if (
      dto.totalAmount &&
      new Prisma.Decimal(dto.totalAmount).lessThan(applied)
    )
      throw new ConflictException(
        'Invoice total cannot be less than its applied payments.',
      );
    return this.prisma.$transaction(async (tx) => {
      const invoiceDate = dto.invoiceDate
        ? new Date(dto.invoiceDate)
        : old.invoiceDate;
      const currency = dto.currency ?? old.currency;
      const amounts = await this.controls.invoiceAmounts(
        tx,
        dto.totalAmount ?? old.totalAmount.toString(),
        dto.netAmount ?? old.netAmount.toString(),
        dto.taxCodeId ?? old.taxCodeId ?? undefined,
        'INPUT',
        invoiceDate,
        currency,
      );
      const value = await tx.supplierInvoice.update({
        where: { id },
        data: {
          status: dto.status,
          documentId: dto.documentId,
          ...(dto.invoiceNumber && { invoiceNumber: dto.invoiceNumber.trim() }),
          ...(dto.invoiceDate && { invoiceDate: new Date(dto.invoiceDate) }),
          ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          netAmount: amounts.netAmount,
          taxAmount: amounts.taxAmount,
          totalAmount: amounts.totalAmount,
          exchangeRate: amounts.exchangeRate,
          baseCurrency: amounts.baseCurrency,
          baseTotalAmount: amounts.baseAmount,
          taxCodeId: amounts.taxCode?.id,
        },
      });
      if (value.status === 'APPROVED')
        await this.ledger.postAutomatic(
          tx,
          {
            sourceType: 'SUPPLIER_INVOICE',
            sourceRecordId: value.id,
            date: value.invoiceDate,
            description: `Supplier invoice ${value.invoiceNumber}`,
            currency: value.currency,
            bookingId: value.bookingId,
            lines: [
              {
                mapping: 'DIRECT_BOOKING_COST',
                debit: amounts.taxCode?.isRecoverable
                  ? value.netAmount
                  : value.totalAmount,
                bookingId: value.bookingId,
                supplierId: value.supplierId,
              },
              ...(amounts.taxCode?.isRecoverable &&
              value.taxAmount.greaterThan(0)
                ? [
                    {
                      accountId: amounts.taxCode.glAccountId!,
                      debit: value.taxAmount,
                      bookingId: value.bookingId,
                      supplierId: value.supplierId,
                    },
                  ]
                : []),
              {
                mapping: 'ACCOUNTS_PAYABLE',
                credit: value.totalAmount,
                bookingId: value.bookingId,
                supplierId: value.supplierId,
              },
            ],
          },
          user,
          metadata,
        );
      await this.syncSupplierInvoiceStatus(tx, id);
      await this.auditFinance(
        tx,
        user,
        metadata,
        'SupplierInvoice',
        id,
        'SUPPLIER_INVOICE_UPDATED',
        value,
      );
      return value;
    });
  }

  async cancelInvoice(
    kind: 'customer' | 'supplier',
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const invoice =
      kind === 'customer'
        ? await this.prisma.customerInvoice.findUnique({
            where: { id },
            include: { payments: true, advanceAllocations: true },
          })
        : await this.prisma.supplierInvoice.findUnique({
            where: { id },
            include: { payments: true, advanceAllocations: true },
          });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    await this.assertFinanceWritable(invoice.bookingId, user);
    if (invoice.status === 'CANCELLED')
      throw new ConflictException('Invoice is already cancelled.');
    const validPayments = invoice.payments.some((payment) =>
      ['RECEIVED', 'PAID', 'VERIFIED'].includes(payment.status),
    );
    const activeAllocations = invoice.advanceAllocations.some(
      (allocation) => allocation.reversedAt === null,
    );
    if (validPayments || activeAllocations)
      throw new ConflictException(
        'Reverse payments and advance allocations before cancelling this invoice.',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.reverseSource(
        tx,
        kind === 'customer' ? 'CUSTOMER_INVOICE' : 'SUPPLIER_INVOICE',
        id,
        'Invoice cancelled',
        user,
        metadata,
      );
      const value =
        kind === 'customer'
          ? await tx.customerInvoice.update({
              where: { id },
              data: { status: 'CANCELLED' },
            })
          : await tx.supplierInvoice.update({
              where: { id },
              data: { status: 'CANCELLED' },
            });
      await this.auditFinance(
        tx,
        user,
        metadata,
        kind === 'customer' ? 'CustomerInvoice' : 'SupplierInvoice',
        id,
        kind === 'customer'
          ? 'CUSTOMER_INVOICE_CANCELLED'
          : 'SUPPLIER_INVOICE_CANCELLED',
        value,
      );
      return value;
    });
  }

  async listCustomerAdvances(bookingId: string) {
    await this.assertBooking(bookingId);
    const rows = await this.prisma.customerAdvance.findMany({
      where: { bookingId },
      include: {
        allocations: {
          include: { invoice: { select: { invoiceNumber: true } } },
        },
        recordedBy: { select: moneySelect },
      },
      orderBy: { paymentDate: 'desc' },
    });
    return rows.map((row) => this.advanceView(row));
  }

  async createCustomerAdvance(
    bookingId: string,
    dto: CreateAdvanceDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true, currency: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    this.assertInvoiceCurrency(booking.currency, dto.currency);
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdvanceBankAccount(
        tx,
        dto.companyBankAccountId,
        dto.currency,
      );
      const valuation = await this.controls.valuation(
        tx,
        dto.amount,
        dto.currency,
        new Date(dto.paymentDate),
      );
      const value = await tx.customerAdvance.create({
        data: {
          customerId: booking.customerId,
          bookingId,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency.toUpperCase(),
          exchangeRate: valuation.exchangeRate,
          baseCurrency: valuation.baseCurrency,
          baseAmount: valuation.baseAmount,
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.paymentReference,
          paymentDate: new Date(dto.paymentDate),
          notes: dto.notes,
          recordedById: user.id,
          companyBankAccountId: dto.companyBankAccountId,
        },
      });
      await this.ledger.postAutomatic(
        tx,
        {
          sourceType: 'CUSTOMER_ADVANCE',
          sourceRecordId: value.id,
          date: value.paymentDate,
          description: 'Customer advance received',
          currency: value.currency,
          bookingId: value.bookingId ?? undefined,
          lines: [
            {
              ...(value.companyBankAccountId
                ? { bankAccountId: value.companyBankAccountId }
                : { mapping: 'PAYMENT_CLEARING' as const }),
              debit: value.amount,
              bookingId: value.bookingId ?? undefined,
              customerId: value.customerId,
            },
            {
              mapping: 'CUSTOMER_ADVANCES',
              credit: value.amount,
              bookingId: value.bookingId ?? undefined,
              customerId: value.customerId,
            },
          ],
        },
        user,
        metadata,
      );
      await this.auditFinance(
        tx,
        user,
        metadata,
        'CustomerAdvance',
        value.id,
        'CUSTOMER_ADVANCE_RECORDED',
        value,
      );
      return value;
    });
  }

  async listSupplierAdvances(bookingId: string) {
    await this.assertBooking(bookingId);
    const rows = await this.prisma.supplierAdvance.findMany({
      where: { bookingId },
      include: {
        supplier: { select: { id: true, name: true } },
        allocations: {
          include: { invoice: { select: { invoiceNumber: true } } },
        },
        recordedBy: { select: moneySelect },
      },
      orderBy: { paymentDate: 'desc' },
    });
    return rows.map((row) => this.advanceView(row));
  }

  async createSupplierAdvance(
    bookingId: string,
    dto: CreateSupplierAdvanceDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    const bookingSupplier = await this.prisma.bookingSupplier.findFirst({
      where: { id: dto.bookingSupplierId, bookingId },
      select: {
        supplierId: true,
        currency: true,
        booking: { select: { currency: true } },
      },
    });
    if (!bookingSupplier)
      throw new BadRequestException(
        'Supplier does not belong to this booking.',
      );
    this.assertInvoiceCurrency(
      bookingSupplier.currency ?? bookingSupplier.booking.currency,
      dto.currency,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdvanceBankAccount(
        tx,
        dto.companyBankAccountId,
        dto.currency,
      );
      const valuation = await this.controls.valuation(
        tx,
        dto.amount,
        dto.currency,
        new Date(dto.paymentDate),
      );
      const value = await tx.supplierAdvance.create({
        data: {
          supplierId: bookingSupplier.supplierId,
          bookingId,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency.toUpperCase(),
          exchangeRate: valuation.exchangeRate,
          baseCurrency: valuation.baseCurrency,
          baseAmount: valuation.baseAmount,
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.paymentReference,
          paymentDate: new Date(dto.paymentDate),
          notes: dto.notes,
          recordedById: user.id,
          companyBankAccountId: dto.companyBankAccountId,
        },
      });
      await this.ledger.postAutomatic(
        tx,
        {
          sourceType: 'SUPPLIER_ADVANCE',
          sourceRecordId: value.id,
          date: value.paymentDate,
          description: 'Supplier advance paid',
          currency: value.currency,
          bookingId: value.bookingId ?? undefined,
          lines: [
            {
              mapping: 'SUPPLIER_ADVANCES',
              debit: value.amount,
              bookingId: value.bookingId ?? undefined,
              supplierId: value.supplierId,
            },
            {
              ...(value.companyBankAccountId
                ? { bankAccountId: value.companyBankAccountId }
                : { mapping: 'PAYMENT_CLEARING' as const }),
              credit: value.amount,
              bookingId: value.bookingId ?? undefined,
              supplierId: value.supplierId,
            },
          ],
        },
        user,
        metadata,
      );
      await this.auditFinance(
        tx,
        user,
        metadata,
        'SupplierAdvance',
        value.id,
        'SUPPLIER_ADVANCE_RECORDED',
        value,
      );
      return value;
    });
  }

  async allocateAdvance(
    kind: 'customer' | 'supplier',
    id: string,
    dto: AllocateAdvanceDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(
      async (tx) => {
        if (kind === 'customer') {
          const advance = await tx.customerAdvance.findUnique({
            where: { id },
            include: { allocations: { where: { reversedAt: null } } },
          });
          const invoice = await tx.customerInvoice.findUnique({
            where: { id: dto.invoiceId },
            include: {
              payments: true,
              advanceAllocations: { where: { reversedAt: null } },
            },
          });
          if (!advance || !invoice)
            throw new NotFoundException('Advance or invoice not found.');
          await this.assertFinanceWritable(invoice.bookingId, user, tx);
          this.assertAllocation(
            advance,
            invoice,
            amount,
            advance.allocations,
            invoice.payments,
            invoice.advanceAllocations,
            ['RECEIVED', 'VERIFIED'],
          );
          const value = await tx.customerAdvanceAllocation.create({
            data: {
              advanceId: id,
              invoiceId: dto.invoiceId,
              amount,
              allocatedById: user.id,
            },
          });
          await this.ledger.postAutomatic(
            tx,
            {
              sourceType: 'CUSTOMER_ADVANCE_ALLOCATION',
              sourceRecordId: value.id,
              date: value.allocatedAt,
              description: 'Customer advance allocated to invoice',
              currency: advance.currency,
              bookingId: invoice.bookingId,
              lines: [
                {
                  mapping: 'CUSTOMER_ADVANCES',
                  debit: value.amount,
                  bookingId: invoice.bookingId,
                  customerId: invoice.customerId,
                },
                {
                  mapping: 'ACCOUNTS_RECEIVABLE',
                  credit: value.amount,
                  bookingId: invoice.bookingId,
                  customerId: invoice.customerId,
                },
              ],
            },
            user,
            metadata,
          );
          await this.syncCustomerInvoiceStatus(tx, invoice.id);
          await this.auditFinance(
            tx,
            user,
            metadata,
            'CustomerAdvanceAllocation',
            value.id,
            'CUSTOMER_ADVANCE_ALLOCATED',
            value,
          );
          return value;
        }
        const advance = await tx.supplierAdvance.findUnique({
          where: { id },
          include: { allocations: { where: { reversedAt: null } } },
        });
        const invoice = await tx.supplierInvoice.findUnique({
          where: { id: dto.invoiceId },
          include: {
            payments: true,
            advanceAllocations: { where: { reversedAt: null } },
          },
        });
        if (!advance || !invoice)
          throw new NotFoundException('Advance or invoice not found.');
        await this.assertFinanceWritable(invoice.bookingId, user, tx);
        this.assertAllocation(
          advance,
          invoice,
          amount,
          advance.allocations,
          invoice.payments,
          invoice.advanceAllocations,
          ['PAID', 'VERIFIED'],
        );
        const value = await tx.supplierAdvanceAllocation.create({
          data: {
            advanceId: id,
            invoiceId: dto.invoiceId,
            amount,
            allocatedById: user.id,
          },
        });
        await this.ledger.postAutomatic(
          tx,
          {
            sourceType: 'SUPPLIER_ADVANCE_ALLOCATION',
            sourceRecordId: value.id,
            date: value.allocatedAt,
            description: 'Supplier advance allocated to invoice',
            currency: advance.currency,
            bookingId: invoice.bookingId,
            lines: [
              {
                mapping: 'ACCOUNTS_PAYABLE',
                debit: value.amount,
                bookingId: invoice.bookingId,
                supplierId: invoice.supplierId,
              },
              {
                mapping: 'SUPPLIER_ADVANCES',
                credit: value.amount,
                bookingId: invoice.bookingId,
                supplierId: invoice.supplierId,
              },
            ],
          },
          user,
          metadata,
        );
        await this.syncSupplierInvoiceStatus(tx, invoice.id);
        await this.auditFinance(
          tx,
          user,
          metadata,
          'SupplierAdvanceAllocation',
          value.id,
          'SUPPLIER_ADVANCE_ALLOCATED',
          value,
        );
        return value;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reverseAllocation(
    kind: 'customer' | 'supplier',
    id: string,
    dto: ReverseAllocationDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const old =
        kind === 'customer'
          ? await tx.customerAdvanceAllocation.findUnique({
              where: { id },
              include: { invoice: true },
            })
          : await tx.supplierAdvanceAllocation.findUnique({
              where: { id },
              include: { invoice: true },
            });
      if (!old) throw new NotFoundException('Advance allocation not found.');
      if (old.reversedAt)
        throw new ConflictException('Advance allocation is already reversed.');
      await this.assertFinanceWritable(old.invoice.bookingId, user, tx);
      const value =
        kind === 'customer'
          ? await tx.customerAdvanceAllocation.update({
              where: { id },
              data: {
                reversedAt: new Date(),
                reversedById: user.id,
                reversalReason: dto.reason,
              },
            })
          : await tx.supplierAdvanceAllocation.update({
              where: { id },
              data: {
                reversedAt: new Date(),
                reversedById: user.id,
                reversalReason: dto.reason,
              },
            });
      await this.ledger.reverseSource(
        tx,
        kind === 'customer'
          ? 'CUSTOMER_ADVANCE_ALLOCATION'
          : 'SUPPLIER_ADVANCE_ALLOCATION',
        id,
        dto.reason,
        user,
        metadata,
      );
      if (kind === 'customer')
        await this.syncCustomerInvoiceStatus(tx, old.invoiceId);
      else await this.syncSupplierInvoiceStatus(tx, old.invoiceId);
      await this.auditFinance(
        tx,
        user,
        metadata,
        kind === 'customer'
          ? 'CustomerAdvanceAllocation'
          : 'SupplierAdvanceAllocation',
        id,
        kind === 'customer'
          ? 'CUSTOMER_ADVANCE_ALLOCATION_REVERSED'
          : 'SUPPLIER_ADVANCE_ALLOCATION_REVERSED',
        value,
      );
      return value;
    });
  }

  async start(
    bookingId: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    await this.assertBooking(bookingId);
    const result = await this.prisma.$transaction(async (tx) => {
      const reconciliation = await tx.reconciliation.upsert({
        where: { bookingId },
        update: {
          status: ReconciliationStatus.IN_REVIEW,
          reconciledAt: null,
          reconciledById: null,
        },
        create: { bookingId, status: ReconciliationStatus.IN_REVIEW },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { accountsStatus: AccountsStatus.RECONCILIATION_PENDING },
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'Reconciliation',
          entityId: reconciliation.id,
          action: 'RECONCILIATION_STARTED',
          newValues: { bookingId, status: reconciliation.status },
          requestMetadata: metadata,
        },
        tx,
      );
      return reconciliation;
    });
    await this.financialSummary(bookingId);
    return result;
  }

  async getReconciliation(bookingId: string) {
    await this.assertBooking(bookingId);
    return this.prisma.reconciliation.findUnique({
      where: { bookingId },
      include: {
        reconciledBy: { select: moneySelect },
        discrepancies: {
          include: {
            assignedUser: { select: moneySelect },
            createdBy: { select: moneySelect },
            resolvedBy: { select: moneySelect },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async updateReconciliation(
    bookingId: string,
    dto: UpdateReconciliationDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    const old = await this.prisma.reconciliation.findUnique({
      where: { bookingId },
    });
    if (!old) throw new NotFoundException('Start reconciliation first.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.reconciliation.update({
        where: { bookingId },
        data: dto,
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'Reconciliation',
          entityId: old.id,
          action: 'RECONCILIATION_UPDATED',
          oldValues: old,
          newValues: value,
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
    return updated;
  }

  async complete(
    bookingId: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    const reconciliation = await this.prisma.reconciliation.findUnique({
      where: { bookingId },
      include: { booking: true },
    });
    if (!reconciliation)
      throw new NotFoundException('Start reconciliation first.');
    const flags = [
      'passengerPaymentsVerified',
      'supplierCostsVerified',
      'supplierPaymentsVerified',
      'sellingPriceVerified',
      'feesVerified',
      'adjustmentsVerified',
      'profitVerified',
    ] as const;
    if (flags.some((flag) => !reconciliation[flag]))
      throw new BadRequestException(
        'Complete every reconciliation verification before reconciling.',
      );
    const unresolved = await this.prisma.reconciliationDiscrepancy.count({
      where: {
        reconciliationId: reconciliation.id,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    });
    if (unresolved)
      throw new ConflictException(
        'Resolve or cancel all open discrepancies first.',
      );
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const value = await tx.reconciliation.update({
        where: { id: reconciliation.id },
        data: {
          status: 'RECONCILED',
          reconciledById: user.id,
          reconciledAt: now,
        },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { accountsStatus: 'RECONCILED' },
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'Reconciliation',
          entityId: reconciliation.id,
          action: 'RECONCILIATION_COMPLETED',
          oldValues: { status: reconciliation.status },
          newValues: { status: value.status, reconciledAt: now.toISOString() },
          requestMetadata: metadata,
        },
        tx,
      );
      await this.notifications.create(
        {
          userId: reconciliation.booking.salesAdvisorId,
          type: NotificationType.RECONCILIATION_COMPLETED,
          title: 'Reconciliation Completed',
          message: `Folder ${reconciliation.booking.folderNumber} has been reconciled.`,
          entityType: 'Booking',
          entityId: bookingId,
        },
        tx,
      );
      return value;
    });
    await this.lifecycle.evaluateBookingLifecycle(bookingId, {
      actorId: user.id,
      requestMetadata: metadata,
      allowCloseAfterReopen: true,
    });
    return result;
  }

  listPassengerPayments(bookingId: string) {
    return this.prisma.passengerPayment.findMany({
      where: { bookingId },
      include: {
        recordedBy: { select: moneySelect },
        verifiedBy: { select: moneySelect },
        customerInvoice: { select: { id: true, invoiceNumber: true } },
        bankTransaction: { include: { companyBankAccount: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async createPassengerPayment(
    bookingId: string,
    dto: CreatePassengerPaymentDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    await this.assertBooking(bookingId);
    this.assertEditablePaymentStatus(dto.status);
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertCustomerPayment(
          tx,
          bookingId,
          dto.customerInvoiceId,
          new Prisma.Decimal(dto.amount),
          dto.currency,
        );
        const valuation = await this.controls.valuation(
          tx,
          dto.amount,
          dto.currency,
          new Date(dto.paymentDate),
        );
        const value = await tx.passengerPayment.create({
          data: {
            bookingId,
            amount: new Prisma.Decimal(dto.amount),
            currency: dto.currency.toUpperCase(),
            exchangeRate: valuation.exchangeRate,
            baseCurrency: valuation.baseCurrency,
            baseAmount: valuation.baseAmount,
            paymentMethod: dto.paymentMethod,
            paymentReference: dto.paymentReference,
            paymentDate: new Date(dto.paymentDate),
            status: dto.status ?? 'RECEIVED',
            recordedById: user.id,
            notes: dto.notes,
            customerInvoiceId: dto.customerInvoiceId,
          },
        });
        if (value.customerInvoiceId)
          await this.syncCustomerInvoiceStatus(tx, value.customerInvoiceId);
        await this.banking.linkCustomerReceipt(
          tx,
          value,
          dto.companyBankAccountId,
          user,
          metadata,
        );
        await this.postPaymentJournal(
          tx,
          'passenger',
          value.id,
          user,
          metadata,
        );
        await this.audit.log(
          {
            actorUserId: user.id,
            entityType: 'PassengerPayment',
            entityId: value.id,
            action: 'PASSENGER_PAYMENT_CREATED',
            newValues: this.paymentAudit(value),
            requestMetadata: metadata,
          },
          tx,
        );
        return value;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updatePassengerPayment(
    id: string,
    dto: UpdatePassengerPaymentDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    this.assertEditablePaymentStatus(dto.status);
    const old = await this.prisma.passengerPayment.findUnique({
      where: { id },
    });
    if (!old) throw new NotFoundException('Passenger payment not found.');
    await this.assertFinanceWritable(old.bookingId, user);
    if (old.status === 'VERIFIED')
      throw new ConflictException('Verified payments cannot be edited.');
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.assertSourceEditable(tx, 'CUSTOMER_RECEIPT', id);
      await this.banking.assertSourcePaymentEditable(tx, 'customer', id);
      const valuation = await this.controls.valuation(
        tx,
        dto.amount ?? old.amount,
        dto.currency ?? old.currency,
        dto.paymentDate ? new Date(dto.paymentDate) : old.paymentDate,
      );
      const value = await tx.passengerPayment.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.amount && { amount: new Prisma.Decimal(dto.amount) }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          ...(dto.paymentDate && { paymentDate: new Date(dto.paymentDate) }),
          exchangeRate: valuation.exchangeRate,
          baseCurrency: valuation.baseCurrency,
          baseAmount: valuation.baseAmount,
        },
      });
      await this.assertCustomerPayment(
        tx,
        old.bookingId,
        value.customerInvoiceId ?? undefined,
        value.amount,
        value.currency,
        value.id,
      );
      if (old.customerInvoiceId)
        await this.syncCustomerInvoiceStatus(tx, old.customerInvoiceId);
      if (
        value.customerInvoiceId &&
        value.customerInvoiceId !== old.customerInvoiceId
      )
        await this.syncCustomerInvoiceStatus(tx, value.customerInvoiceId);
      await this.postPaymentJournal(tx, 'passenger', value.id, user, metadata);
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'PassengerPayment',
          entityId: id,
          action: 'PASSENGER_PAYMENT_UPDATED',
          oldValues: this.paymentAudit(old),
          newValues: this.paymentAudit(value),
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  verifyPassengerPayment(
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.verifyPayment('passenger', id, user, metadata);
  }

  listSupplierPayments(bookingId: string) {
    return this.prisma.supplierPayment.findMany({
      where: { bookingId },
      include: {
        bookingSupplier: { include: { supplier: true } },
        recordedBy: { select: moneySelect },
        verifiedBy: { select: moneySelect },
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bankTransaction: { include: { companyBankAccount: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async createSupplierPayment(
    bookingId: string,
    dto: CreateSupplierPaymentDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    await this.assertSupplier(bookingId, dto.bookingSupplierId);
    this.assertEditablePaymentStatus(dto.status);
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertSupplierPayment(
          tx,
          bookingId,
          dto.bookingSupplierId,
          dto.supplierInvoiceId,
          new Prisma.Decimal(dto.amount),
          dto.currency,
        );
        const valuation = await this.controls.valuation(
          tx,
          dto.amount,
          dto.currency,
          new Date(dto.paymentDate),
        );
        const value = await tx.supplierPayment.create({
          data: {
            bookingId,
            bookingSupplierId: dto.bookingSupplierId,
            amount: new Prisma.Decimal(dto.amount),
            currency: dto.currency.toUpperCase(),
            exchangeRate: valuation.exchangeRate,
            baseCurrency: valuation.baseCurrency,
            baseAmount: valuation.baseAmount,
            paymentReference: dto.paymentReference,
            paymentMethod: dto.paymentMethod ?? 'OTHER',
            paymentDate: new Date(dto.paymentDate),
            status: dto.status ?? 'PAID',
            recordedById: user.id,
            notes: dto.notes,
            supplierInvoiceId: dto.supplierInvoiceId,
          },
        });
        if (value.supplierInvoiceId)
          await this.syncSupplierInvoiceStatus(tx, value.supplierInvoiceId);
        await this.banking.linkSupplierPayment(
          tx,
          value,
          dto.companyBankAccountId,
          user,
          metadata,
        );
        await this.postPaymentJournal(tx, 'supplier', value.id, user, metadata);
        await this.audit.log(
          {
            actorUserId: user.id,
            entityType: 'SupplierPayment',
            entityId: value.id,
            action: 'SUPPLIER_PAYMENT_CREATED',
            newValues: this.paymentAudit(value),
            requestMetadata: metadata,
          },
          tx,
        );
        return value;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateSupplierPayment(
    id: string,
    dto: UpdateSupplierPaymentDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    this.assertEditablePaymentStatus(dto.status);
    const old = await this.prisma.supplierPayment.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Supplier payment not found.');
    await this.assertFinanceWritable(old.bookingId, user);
    if (old.status === 'VERIFIED')
      throw new ConflictException('Verified payments cannot be edited.');
    if (dto.bookingSupplierId)
      await this.assertSupplier(old.bookingId, dto.bookingSupplierId);
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.assertSourceEditable(tx, 'SUPPLIER_PAYMENT', id);
      await this.banking.assertSourcePaymentEditable(tx, 'supplier', id);
      const valuation = await this.controls.valuation(
        tx,
        dto.amount ?? old.amount,
        dto.currency ?? old.currency,
        dto.paymentDate ? new Date(dto.paymentDate) : old.paymentDate,
      );
      const value = await tx.supplierPayment.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.amount && { amount: new Prisma.Decimal(dto.amount) }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          ...(dto.paymentDate && { paymentDate: new Date(dto.paymentDate) }),
          exchangeRate: valuation.exchangeRate,
          baseCurrency: valuation.baseCurrency,
          baseAmount: valuation.baseAmount,
        },
      });
      await this.assertSupplierPayment(
        tx,
        old.bookingId,
        value.bookingSupplierId,
        value.supplierInvoiceId ?? undefined,
        value.amount,
        value.currency,
        value.id,
      );
      if (old.supplierInvoiceId)
        await this.syncSupplierInvoiceStatus(tx, old.supplierInvoiceId);
      if (
        value.supplierInvoiceId &&
        value.supplierInvoiceId !== old.supplierInvoiceId
      )
        await this.syncSupplierInvoiceStatus(tx, value.supplierInvoiceId);
      await this.postPaymentJournal(tx, 'supplier', value.id, user, metadata);
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'SupplierPayment',
          entityId: id,
          action: 'SUPPLIER_PAYMENT_UPDATED',
          oldValues: this.paymentAudit(old),
          newValues: this.paymentAudit(value),
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  verifySupplierPayment(
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.verifyPayment('supplier', id, user, metadata);
  }

  async reversePayment(
    kind: 'customer' | 'supplier',
    id: string,
    dto: ReverseAllocationDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (kind === 'customer') {
        const old = await tx.passengerPayment.findUnique({ where: { id } });
        if (!old) throw new NotFoundException('Passenger payment not found.');
        await this.assertFinanceWritable(old.bookingId, user, tx);
        if (['REFUNDED', 'REJECTED'].includes(old.status))
          throw new ConflictException('Payment is already reversed.');
        await this.banking.reverseSourcePayment(tx, kind, id);
        await this.ledger.reverseSource(
          tx,
          'CUSTOMER_RECEIPT',
          id,
          dto.reason,
          user,
          metadata,
        );
        const value = await tx.passengerPayment.update({
          where: { id },
          data: {
            status: 'REFUNDED',
            notes: [old.notes, `Reversal: ${dto.reason}`]
              .filter(Boolean)
              .join('\n'),
          },
        });
        if (old.customerInvoiceId)
          await this.syncCustomerInvoiceStatus(tx, old.customerInvoiceId);
        await this.auditFinance(
          tx,
          user,
          metadata,
          'PassengerPayment',
          id,
          'CUSTOMER_PAYMENT_REVERSED',
          value,
        );
        return value;
      }
      const old = await tx.supplierPayment.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Supplier payment not found.');
      await this.assertFinanceWritable(old.bookingId, user, tx);
      if (['CANCELLED', 'DISPUTED'].includes(old.status))
        throw new ConflictException('Payment is already reversed.');
      await this.banking.reverseSourcePayment(tx, kind, id);
      await this.ledger.reverseSource(
        tx,
        'SUPPLIER_PAYMENT',
        id,
        dto.reason,
        user,
        metadata,
      );
      const value = await tx.supplierPayment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: [old.notes, `Reversal: ${dto.reason}`]
            .filter(Boolean)
            .join('\n'),
        },
      });
      if (old.supplierInvoiceId)
        await this.syncSupplierInvoiceStatus(tx, old.supplierInvoiceId);
      await this.auditFinance(
        tx,
        user,
        metadata,
        'SupplierPayment',
        id,
        'SUPPLIER_PAYMENT_REVERSED',
        value,
      );
      return value;
    });
  }

  listAdjustments(bookingId: string) {
    return this.prisma.bookingAdjustment.findMany({
      where: { bookingId },
      include: {
        createdBy: { select: moneySelect },
        approvedBy: { select: moneySelect },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async createAdjustment(
    bookingId: string,
    dto: CreateAdjustmentDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    await this.assertBooking(bookingId);
    const amount = new Prisma.Decimal(dto.amount);
    if (
      amount.isNegative() &&
      dto.type !== BookingAdjustmentType.MANUAL_ADJUSTMENT &&
      dto.type !== BookingAdjustmentType.OTHER
    )
      throw new BadRequestException(
        'Only manual or other adjustments may be negative.',
      );
    if (amount.isZero())
      throw new BadRequestException('Adjustment amount cannot be zero.');
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.bookingAdjustment.create({
        data: {
          bookingId,
          type: dto.type,
          amount,
          currency: dto.currency.toUpperCase(),
          reason: dto.reason,
          createdById: user.id,
        },
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'BookingAdjustment',
          entityId: value.id,
          action: 'FINANCIAL_ADJUSTMENT_CREATED',
          newValues: {
            bookingId,
            type: value.type,
            amount: value.amount.toString(),
            currency: value.currency,
            reason: value.reason,
          },
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  async approveAdjustment(
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.bookingAdjustment.findUnique({
      where: { id },
    });
    if (!old) throw new NotFoundException('Adjustment not found.');
    await this.assertFinanceWritable(old.bookingId, user);
    if (old.approvedAt)
      throw new ConflictException('Adjustment is already approved.');
    if (old.createdById === user.id)
      throw new ConflictException(
        'The adjustment creator cannot approve it.',
      );
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.bookingAdjustment.update({
        where: { id },
        data: { approvedById: user.id, approvedAt: new Date() },
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'BookingAdjustment',
          entityId: id,
          action: 'FINANCIAL_ADJUSTMENT_APPROVED',
          oldValues: { approvedAt: null },
          newValues: {
            approvedAt: value.approvedAt?.toISOString(),
            approvedById: user.id,
          },
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  async createDiscrepancy(
    bookingId: string,
    dto: CreateDiscrepancyDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertFinanceWritable(bookingId, user);
    let reconciliation = await this.prisma.reconciliation.findUnique({
      where: { bookingId },
      include: { booking: true },
    });
    if (!reconciliation) {
      await this.start(bookingId, user, metadata);
      reconciliation = await this.prisma.reconciliation.findUniqueOrThrow({
        where: { bookingId },
        include: { booking: true },
      });
    }
    if (dto.assignedUserId) await this.assertActiveUser(dto.assignedUserId);
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.reconciliationDiscrepancy.create({
        data: {
          reconciliationId: reconciliation.id,
          bookingId,
          type: dto.type,
          description: dto.description,
          amountDifference: dto.amountDifference
            ? new Prisma.Decimal(dto.amountDifference)
            : null,
          currency: dto.currency?.toUpperCase(),
          assignedUserId: dto.assignedUserId,
          createdById: user.id,
        },
      });
      await tx.reconciliation.update({
        where: { id: reconciliation.id },
        data: { status: 'DISCREPANCY' },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { accountsStatus: 'DISCREPANCY' },
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'ReconciliationDiscrepancy',
          entityId: value.id,
          action: 'RECONCILIATION_DISCREPANCY_CREATED',
          newValues: {
            bookingId,
            type: value.type,
            description: value.description,
            amountDifference: value.amountDifference?.toString(),
            assignedUserId: value.assignedUserId,
          },
          requestMetadata: metadata,
        },
        tx,
      );
      const recipient =
        dto.assignedUserId ?? reconciliation.booking.salesAdvisorId;
      await this.notifications.create(
        {
          userId: recipient,
          type: dto.assignedUserId
            ? 'DISCREPANCY_ASSIGNED'
            : 'RECONCILIATION_DISCREPANCY',
          title: 'Discrepancy Requires Action',
          message: `Folder ${reconciliation.booking.folderNumber} has a ${dto.type.toLowerCase().replaceAll('_', ' ')}.`,
          entityType: 'Booking',
          entityId: bookingId,
        },
        tx,
      );
      return value;
    });
  }

  async resolveDiscrepancy(
    id: string,
    dto: ResolveDiscrepancyDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.reconciliationDiscrepancy.findUnique({
      where: { id },
      include: { booking: true },
    });
    if (!old) throw new NotFoundException('Discrepancy not found.');
    await this.assertFinanceWritable(old.bookingId, user);
    if (
      old.status !== DiscrepancyStatus.OPEN &&
      old.status !== DiscrepancyStatus.IN_PROGRESS
    )
      throw new ConflictException('Discrepancy is not open.');
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.reconciliationDiscrepancy.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedById: user.id,
          resolvedAt: new Date(),
          resolutionNotes: dto.resolutionNotes,
        },
      });
      const remaining = await tx.reconciliationDiscrepancy.count({
        where: {
          reconciliationId: old.reconciliationId,
          id: { not: id },
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      });
      if (!remaining) {
        await tx.reconciliation.update({
          where: { id: old.reconciliationId },
          data: { status: 'IN_REVIEW' },
        });
        await tx.booking.update({
          where: { id: old.bookingId },
          data: { accountsStatus: 'RECONCILIATION_PENDING' },
        });
      }
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'ReconciliationDiscrepancy',
          entityId: id,
          action: 'RECONCILIATION_DISCREPANCY_RESOLVED',
          oldValues: { status: old.status },
          newValues: {
            status: value.status,
            resolutionNotes: value.resolutionNotes,
          },
          requestMetadata: metadata,
        },
        tx,
      );
      const recipient = old.assignedUserId ?? old.createdById;
      if (recipient !== user.id)
        await this.notifications.create(
          {
            userId: recipient,
            type: 'DISCREPANCY_RESOLVED',
            title: 'Discrepancy Resolved',
            message: `A discrepancy for folder ${old.booking.folderNumber} was resolved.`,
            entityType: 'Booking',
            entityId: old.bookingId,
          },
          tx,
        );
      return value;
    });
  }

  async discrepancies(query: DiscrepancyQueryDto) {
    const where: Prisma.ReconciliationDiscrepancyWhereInput = {
      ...(query.discrepancyStatus && { status: query.discrepancyStatus }),
      ...(query.folderNumber && {
        booking: {
          folderNumber: { contains: query.folderNumber, mode: 'insensitive' },
        },
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [total, data] = await Promise.all([
      this.prisma.reconciliationDiscrepancy.count({ where }),
      this.prisma.reconciliationDiscrepancy.findMany({
        where,
        include: {
          booking: {
            select: {
              id: true,
              folderNumber: true,
              currency: true,
              customer: { select: { firstName: true, lastName: true } },
            },
          },
          assignedUser: { select: moneySelect },
          createdBy: { select: moneySelect },
          resolvedBy: { select: moneySelect },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
    ]);
    return this.page(data, query, total);
  }

  private async verifyPayment(
    kind: 'passenger' | 'supplier',
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old =
      kind === 'passenger'
        ? await this.prisma.passengerPayment.findUnique({
            where: { id },
            select: { id: true, status: true, bookingId: true },
          })
        : await this.prisma.supplierPayment.findUnique({
            where: { id },
            select: { id: true, status: true, bookingId: true },
          });
    if (!old)
      throw new NotFoundException(
        `${kind === 'passenger' ? 'Passenger' : 'Supplier'} payment not found.`,
      );
    await this.assertFinanceWritable(old.bookingId, user);
    if (old.status === 'VERIFIED')
      throw new ConflictException('Payment is already verified.');
    return this.prisma.$transaction(async (tx) => {
      const value =
        kind === 'passenger'
          ? await tx.passengerPayment.update({
              where: { id },
              data: {
                status: 'VERIFIED',
                verifiedById: user.id,
                verifiedAt: new Date(),
              },
            })
          : await tx.supplierPayment.update({
              where: { id },
              data: {
                status: 'VERIFIED',
                verifiedById: user.id,
                verifiedAt: new Date(),
              },
            });
      await this.postPaymentJournal(tx, kind, id, user, metadata);
      if (kind === 'passenger') {
        const payment = await tx.passengerPayment.findUnique({
          where: { id },
          select: { customerInvoiceId: true },
        });
        if (payment?.customerInvoiceId)
          await this.syncCustomerInvoiceStatus(tx, payment.customerInvoiceId);
      } else {
        const payment = await tx.supplierPayment.findUnique({
          where: { id },
          select: { supplierInvoiceId: true },
        });
        if (payment?.supplierInvoiceId)
          await this.syncSupplierInvoiceStatus(tx, payment.supplierInvoiceId);
      }
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType:
            kind === 'passenger' ? 'PassengerPayment' : 'SupplierPayment',
          entityId: id,
          action:
            kind === 'passenger'
              ? 'PASSENGER_PAYMENT_VERIFIED'
              : 'SUPPLIER_PAYMENT_VERIFIED',
          oldValues: { status: old.status },
          newValues: { status: value.status, verifiedById: user.id },
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  private total(items: { amount: Prisma.Decimal }[]) {
    return items.reduce(
      (sum, item) => sum.plus(item.amount),
      new Prisma.Decimal(0),
    );
  }

  private async postPaymentJournal(
    tx: Prisma.TransactionClient,
    kind: 'passenger' | 'supplier',
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    if (kind === 'passenger') {
      const payment = await tx.passengerPayment.findUniqueOrThrow({
        where: { id },
        include: {
          booking: { select: { customerId: true } },
          bankTransaction: { select: { companyBankAccountId: true } },
        },
      });
      if (!['RECEIVED', 'VERIFIED'].includes(payment.status)) return;
      await this.ledger.postAutomatic(
        tx,
        {
          sourceType: 'CUSTOMER_RECEIPT',
          sourceRecordId: payment.id,
          date: payment.paymentDate,
          description: 'Customer receipt',
          currency: payment.currency,
          bookingId: payment.bookingId,
          lines: [
            {
              ...(payment.bankTransaction
                ? {
                    bankAccountId: payment.bankTransaction.companyBankAccountId,
                  }
                : { mapping: 'PAYMENT_CLEARING' as const }),
              debit: payment.amount,
              bookingId: payment.bookingId,
              customerId: payment.booking.customerId,
            },
            {
              mapping: 'ACCOUNTS_RECEIVABLE',
              credit: payment.amount,
              bookingId: payment.bookingId,
              customerId: payment.booking.customerId,
            },
          ],
        },
        user,
        metadata,
      );
      return;
    }
    const payment = await tx.supplierPayment.findUniqueOrThrow({
      where: { id },
      include: {
        bookingSupplier: { select: { supplierId: true } },
        bankTransaction: { select: { companyBankAccountId: true } },
      },
    });
    if (!['PAID', 'VERIFIED'].includes(payment.status)) return;
    await this.ledger.postAutomatic(
      tx,
      {
        sourceType: 'SUPPLIER_PAYMENT',
        sourceRecordId: payment.id,
        date: payment.paymentDate,
        description: 'Supplier payment',
        currency: payment.currency,
        bookingId: payment.bookingId,
        lines: [
          {
            mapping: 'ACCOUNTS_PAYABLE',
            debit: payment.amount,
            bookingId: payment.bookingId,
            supplierId: payment.bookingSupplier.supplierId,
          },
          {
            ...(payment.bankTransaction
              ? {
                  bankAccountId: payment.bankTransaction.companyBankAccountId,
                }
              : { mapping: 'PAYMENT_CLEARING' as const }),
            credit: payment.amount,
            bookingId: payment.bookingId,
            supplierId: payment.bookingSupplier.supplierId,
          },
        ],
      },
      user,
      metadata,
    );
  }

  private async assertAdvanceBankAccount(
    tx: Prisma.TransactionClient,
    id: string | undefined,
    currency: string,
  ) {
    if (!id) return;
    const account = await tx.companyBankAccount.findUnique({ where: { id } });
    if (!account?.isActive || account.currency !== currency.toUpperCase())
      throw new BadRequestException(
        'Advance bank account must be active and use the same currency.',
      );
  }

  private customerInvoiceView<
    T extends {
      totalAmount: Prisma.Decimal;
      status: string;
      dueDate: Date | null;
      payments: { amount: Prisma.Decimal; status: string }[];
      advanceAllocations: { amount: Prisma.Decimal; reversedAt: Date | null }[];
    },
  >(invoice: T) {
    const paid = this.total(
      invoice.payments.filter((payment) =>
        ['RECEIVED', 'VERIFIED'].includes(payment.status),
      ),
    );
    const allocated = this.total(
      invoice.advanceAllocations.filter((allocation) => !allocation.reversedAt),
    );
    return {
      ...invoice,
      amountPaid: paid.plus(allocated),
      outstanding: Prisma.Decimal.max(
        invoice.totalAmount.minus(paid).minus(allocated),
        0,
      ),
      ageingBucket: this.ageingBucket(invoice.dueDate, invoice.status),
    };
  }

  private supplierInvoiceView<
    T extends {
      totalAmount: Prisma.Decimal;
      status: string;
      dueDate: Date | null;
      payments: { amount: Prisma.Decimal; status: string }[];
      advanceAllocations: { amount: Prisma.Decimal; reversedAt: Date | null }[];
    },
  >(invoice: T) {
    const paid = this.total(
      invoice.payments.filter((payment) =>
        ['PAID', 'VERIFIED'].includes(payment.status),
      ),
    );
    const allocated = this.total(
      invoice.advanceAllocations.filter((allocation) => !allocation.reversedAt),
    );
    return {
      ...invoice,
      amountPaid: paid.plus(allocated),
      outstanding: Prisma.Decimal.max(
        invoice.totalAmount.minus(paid).minus(allocated),
        0,
      ),
      ageingBucket: this.ageingBucket(invoice.dueDate, invoice.status),
    };
  }

  private advanceView<
    T extends {
      amount: Prisma.Decimal;
      cancelledAt: Date | null;
      allocations: { amount: Prisma.Decimal; reversedAt: Date | null }[];
    },
  >(advance: T) {
    const allocatedAmount = this.total(
      advance.allocations.filter((allocation) => !allocation.reversedAt),
    );
    return {
      ...advance,
      originalAmount: advance.amount,
      allocatedAmount,
      remainingAmount: advance.cancelledAt
        ? new Prisma.Decimal(0)
        : advance.amount.minus(allocatedAmount),
    };
  }

  private ageingBucket(dueDate: Date | null, status: string) {
    if (!dueDate || ['DRAFT', 'CANCELLED', 'PAID'].includes(status))
      return null;
    const days = Math.max(
      0,
      Math.floor((Date.now() - dueDate.getTime()) / 86_400_000),
    );
    if (days === 0) return 'CURRENT';
    if (days <= 30) return '1_30';
    if (days <= 60) return '31_60';
    if (days <= 90) return '61_90';
    return '90_PLUS';
  }

  private assertAllocation(
    advance: {
      amount: Prisma.Decimal;
      currency: string;
      bookingId: string | null;
      customerId?: string;
      supplierId?: string;
      cancelledAt: Date | null;
    },
    invoice: {
      totalAmount: Prisma.Decimal;
      currency: string;
      bookingId: string;
      customerId?: string;
      supplierId?: string;
      status: string;
    },
    amount: Prisma.Decimal,
    advanceAllocations: { amount: Prisma.Decimal }[],
    payments: { amount: Prisma.Decimal; status: string }[],
    invoiceAllocations: { amount: Prisma.Decimal }[],
    validPaymentStatuses: string[],
  ) {
    if (advance.cancelledAt)
      throw new ConflictException('Cancelled advances cannot be allocated.');
    if (['DRAFT', 'CANCELLED', 'PAID'].includes(invoice.status))
      throw new ConflictException('The invoice is not open for allocation.');
    if (
      (advance.customerId && advance.customerId !== invoice.customerId) ||
      (advance.supplierId && advance.supplierId !== invoice.supplierId)
    )
      throw new BadRequestException(
        'Advance and invoice belong to different parties.',
      );
    if (advance.bookingId && advance.bookingId !== invoice.bookingId)
      throw new BadRequestException(
        'Advance and invoice belong to different bookings.',
      );
    this.assertInvoiceCurrency(invoice.currency, advance.currency);
    const available = advance.amount.minus(this.total(advanceAllocations));
    const outstanding = invoice.totalAmount
      .minus(
        this.total(
          payments.filter((payment) =>
            validPaymentStatuses.includes(payment.status),
          ),
        ),
      )
      .minus(this.total(invoiceAllocations));
    if (amount.greaterThan(available))
      throw new ConflictException(
        'Advance allocation exceeds the available advance balance.',
      );
    if (amount.greaterThan(outstanding))
      throw new ConflictException(
        'Advance allocation exceeds the invoice outstanding balance.',
      );
  }

  private async syncCustomerInvoiceStatus(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const invoice = await tx.customerInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        payments: true,
        advanceAllocations: { where: { reversedAt: null } },
      },
    });
    if (['DRAFT', 'CANCELLED'].includes(invoice.status)) return;
    const applied = this.total(
      invoice.payments.filter((payment) =>
        ['RECEIVED', 'VERIFIED'].includes(payment.status),
      ),
    ).plus(this.total(invoice.advanceAllocations));
    await tx.customerInvoice.update({
      where: { id },
      data: {
        status: applied.greaterThanOrEqualTo(invoice.totalAmount)
          ? 'PAID'
          : applied.isZero()
            ? 'ISSUED'
            : 'PARTIALLY_PAID',
      },
    });
  }

  private async syncSupplierInvoiceStatus(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const invoice = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        payments: true,
        advanceAllocations: { where: { reversedAt: null } },
      },
    });
    if (['DRAFT', 'CANCELLED'].includes(invoice.status)) return;
    const applied = this.total(
      invoice.payments.filter((payment) =>
        ['PAID', 'VERIFIED'].includes(payment.status),
      ),
    ).plus(this.total(invoice.advanceAllocations));
    await tx.supplierInvoice.update({
      where: { id },
      data: {
        status: applied.greaterThanOrEqualTo(invoice.totalAmount)
          ? 'PAID'
          : applied.isZero()
            ? 'APPROVED'
            : 'PARTIALLY_PAID',
      },
    });
  }

  private async assertDocument(bookingId: string, documentId?: string) {
    if (
      documentId &&
      !(await this.prisma.bookingDocument.findFirst({
        where: { id: documentId, bookingId },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Document does not belong to this booking.',
      );
  }

  private async assertCustomerPayment(
    tx: Prisma.TransactionClient,
    bookingId: string,
    invoiceId: string | undefined,
    amount: Prisma.Decimal,
    currency: string,
    excludeId?: string,
  ) {
    if (invoiceId) {
      const invoice = await tx.customerInvoice.findFirst({
        where: { id: invoiceId, bookingId },
        include: {
          payments: {
            where: {
              id: { not: excludeId },
              status: { in: ['RECEIVED', 'VERIFIED'] },
            },
          },
          advanceAllocations: { where: { reversedAt: null } },
        },
      });
      if (!invoice)
        throw new BadRequestException(
          'Customer invoice does not belong to this booking.',
        );
      if (['DRAFT', 'CANCELLED', 'PAID'].includes(invoice.status))
        throw new ConflictException(
          'Customer invoice is not open for payment.',
        );
      this.assertInvoiceCurrency(invoice.currency, currency);
      const remaining = invoice.totalAmount
        .minus(this.total(invoice.payments))
        .minus(this.total(invoice.advanceAllocations));
      if (amount.greaterThan(remaining))
        throw new ConflictException(
          'Payment exceeds the customer invoice outstanding balance; record the excess as an advance.',
        );
      return;
    }
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        sellingPrice: true,
        currency: true,
        passengerPayments: {
          where: {
            id: { not: excludeId },
            status: { in: ['RECEIVED', 'VERIFIED'] },
          },
          select: { amount: true },
        },
      },
    });
    this.assertInvoiceCurrency(booking.currency, currency);
    if (
      amount.greaterThan(
        booking.sellingPrice.minus(this.total(booking.passengerPayments)),
      )
    )
      throw new ConflictException(
        'Payment exceeds the booking selling price; record the excess as a customer advance.',
      );
  }

  private async assertSupplierPayment(
    tx: Prisma.TransactionClient,
    bookingId: string,
    bookingSupplierId: string,
    invoiceId: string | undefined,
    amount: Prisma.Decimal,
    currency: string,
    excludeId?: string,
  ) {
    if (invoiceId) {
      const invoice = await tx.supplierInvoice.findFirst({
        where: { id: invoiceId, bookingId, bookingSupplierId },
        include: {
          payments: {
            where: {
              id: { not: excludeId },
              status: { in: ['PAID', 'VERIFIED'] },
            },
          },
          advanceAllocations: { where: { reversedAt: null } },
        },
      });
      if (!invoice)
        throw new BadRequestException(
          'Supplier invoice does not belong to this booking supplier.',
        );
      if (['DRAFT', 'CANCELLED', 'PAID'].includes(invoice.status))
        throw new ConflictException(
          'Supplier invoice is not open for payment.',
        );
      this.assertInvoiceCurrency(invoice.currency, currency);
      const remaining = invoice.totalAmount
        .minus(this.total(invoice.payments))
        .minus(this.total(invoice.advanceAllocations));
      if (amount.greaterThan(remaining))
        throw new ConflictException(
          'Payment exceeds the supplier invoice outstanding balance; record the excess as an advance.',
        );
      return;
    }
    const supplier = await tx.bookingSupplier.findFirst({
      where: { id: bookingSupplierId, bookingId },
      select: {
        supplierCost: true,
        currency: true,
        booking: { select: { currency: true } },
        payments: {
          where: {
            id: { not: excludeId },
            status: { in: ['PAID', 'VERIFIED'] },
          },
          select: { amount: true },
        },
      },
    });
    if (!supplier)
      throw new BadRequestException(
        'Supplier does not belong to this booking.',
      );
    this.assertInvoiceCurrency(
      supplier.currency ?? supplier.booking.currency,
      currency,
    );
    if (
      supplier.supplierCost &&
      amount.greaterThan(
        supplier.supplierCost.minus(this.total(supplier.payments)),
      )
    )
      throw new ConflictException(
        'Payment exceeds the booking supplier cost; record the excess as a supplier advance.',
      );
  }

  private assertInvoiceCurrency(expected: string, actual: string) {
    if (expected.toUpperCase() !== actual.toUpperCase())
      throw new BadRequestException(
        'Currency must match the booking financial currency.',
      );
  }

  private async auditFinance(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    entityType: string,
    entityId: string,
    action: string,
    value: object,
  ) {
    await this.audit.log(
      {
        actorUserId: user.id,
        entityType,
        entityId,
        action,
        newValues: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
        requestMetadata: metadata,
      },
      tx,
    );
  }

  private async assertBooking(id: string) {
    if (
      !(await this.prisma.booking.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Booking not found.');
  }

  private async assertFinanceWritable(
    bookingId: string,
    user: AuthenticatedUser,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const booking = await client.booking.findUnique({
      where: { id: bookingId },
      select: { folderStatus: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (
      booking.folderStatus === 'CLOSED' &&
      !user.permissions.includes('booking.closed.edit')
    )
      throw new ConflictException(
        'Reopen the folder before changing financial records.',
      );
  }

  private async assertSupplier(bookingId: string, id: string) {
    if (
      !(await this.prisma.bookingSupplier.findFirst({
        where: { id, bookingId },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Supplier does not belong to this booking.',
      );
  }

  private async assertActiveUser(id: string) {
    if (
      !(await this.prisma.user.findFirst({
        where: { id, isActive: true },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Assigned user is invalid or inactive.');
  }

  private assertEditablePaymentStatus(status?: string) {
    if (status === 'VERIFIED')
      throw new BadRequestException(
        'Use the verify endpoint to verify a payment.',
      );
  }

  private paymentAudit(value: {
    amount: Prisma.Decimal;
    currency: string;
    status: string;
    paymentReference: string | null;
    paymentDate: Date;
  }) {
    return {
      amount: value.amount.toString(),
      currency: value.currency,
      status: value.status,
      paymentReference: value.paymentReference,
      paymentDate: value.paymentDate.toISOString(),
    };
  }

  private page<T>(
    data: T[],
    query: { page: number; limit: number },
    total: number,
  ) {
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
