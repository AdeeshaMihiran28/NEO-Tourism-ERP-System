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
  CreateAdjustmentDto,
  CreateDiscrepancyDto,
  CreatePassengerPaymentDto,
  CreateSupplierPaymentDto,
  DiscrepancyQueryDto,
  ResolveDiscrepancyDto,
  UpdatePassengerPaymentDto,
  UpdateReconciliationDto,
  UpdateSupplierPaymentDto,
} from '../dto/accounts.dto';

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

  async financialSummary(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        suppliers: { select: { supplierCost: true } },
        passengerPayments: { select: { amount: true, status: true } },
        supplierPayments: { select: { amount: true, status: true } },
        adjustments: { select: { amount: true, type: true, approvedAt: true } },
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
    const adjustments = approved.reduce((sum, item) => {
      if (
        item.type === BookingAdjustmentType.FEE ||
        item.type === BookingAdjustmentType.DISCOUNT
      )
        return sum;
      return item.type === BookingAdjustmentType.REFUND
        ? sum.minus(item.amount.abs())
        : sum.plus(item.amount);
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
      .plus(adjustments);
    const expectedProfit = expectedRevenue.minus(supplierCost);
    await this.prisma.bookingFinance.upsert({
      where: { bookingId },
      update: {
        sellingPrice: booking.sellingPrice,
        supplierCost,
        fees,
        discounts,
        adjustments,
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
        adjustments,
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
      adjustments,
      passengerPaymentsReceived,
      supplierPaymentsMade,
      expectedRevenue,
      expectedProfit,
      passengerBalance: expectedRevenue.minus(passengerPaymentsReceived),
      supplierBalance: supplierCost.minus(supplierPaymentsMade),
      currency: booking.currency.toUpperCase(),
    };
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
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
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
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.passengerPayment.create({
        data: {
          bookingId,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency.toUpperCase(),
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.paymentReference,
          paymentDate: new Date(dto.paymentDate),
          status: dto.status ?? 'RECEIVED',
          recordedById: user.id,
          notes: dto.notes,
        },
      });
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
    });
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
      const value = await tx.passengerPayment.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.amount && { amount: new Prisma.Decimal(dto.amount) }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          ...(dto.paymentDate && { paymentDate: new Date(dto.paymentDate) }),
        },
      });
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
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
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
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.supplierPayment.create({
        data: {
          bookingId,
          bookingSupplierId: dto.bookingSupplierId,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency.toUpperCase(),
          paymentReference: dto.paymentReference,
          paymentDate: new Date(dto.paymentDate),
          status: dto.status ?? 'PAID',
          recordedById: user.id,
          notes: dto.notes,
        },
      });
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
    });
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
      const value = await tx.supplierPayment.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.amount && { amount: new Prisma.Decimal(dto.amount) }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          ...(dto.paymentDate && { paymentDate: new Date(dto.paymentDate) }),
        },
      });
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

  listAdjustments(bookingId: string) {
    return this.prisma.bookingAdjustment.findMany({
      where: { bookingId },
      include: {
        createdBy: { select: moneySelect },
        approvedBy: { select: moneySelect },
      },
      orderBy: { createdAt: 'desc' },
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
  ) {
    const booking = await this.prisma.booking.findUnique({
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
