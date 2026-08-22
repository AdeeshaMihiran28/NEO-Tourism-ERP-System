import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Booking, Prisma } from '../../generated/prisma/client';
import {
  NotificationType,
  SaleSubmissionStatus,
} from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { isUniqueConstraintError } from '../common/prisma-errors';
import type { RequestMetadata } from '../common/request-metadata';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AssignOperationsDto,
  BookingQueryDto,
  CreateBookingDocumentDto,
  CreateBookingNoteDto,
  CreateBookingReferenceDto,
  CreateBookingSupplierDto,
  CreateBookingTaskDto,
  CreatePassengerDto,
  UpdateBookingDto,
  UpdateBookingReferenceDto,
  UpdateBookingSupplierDto,
  UpdateBookingTaskDto,
  UpdatePassengerDto,
} from './dto/booking.dto';

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;
const bookingInclude = {
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  salesAdvisor: { select: personSelect },
  operationsOwner: { select: personSelect },
  createdBy: { select: personSelect },
  passengers: {
    orderBy: [{ isPrimaryPassenger: 'desc' }, { createdAt: 'asc' }],
  },
  suppliers: { include: { supplier: true }, orderBy: { createdAt: 'asc' } },
  references: {
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  documents: {
    include: { uploadedBy: { select: personSelect } },
    orderBy: { createdAt: 'desc' },
  },
  notes: {
    include: { createdBy: { select: personSelect } },
    orderBy: { createdAt: 'desc' },
  },
  tasks: {
    include: {
      assignedUser: { select: personSelect },
      createdBy: { select: personSelect },
    },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  },
  saleSubmission: { select: { id: true, status: true } },
  lead: { select: { id: true, status: true } },
} satisfies Prisma.BookingInclude;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createFromSale(
    saleSubmissionId: string,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sale = await tx.saleSubmission.findUnique({
          where: { id: saleSubmissionId },
          include: { booking: { select: { id: true } } },
        });
        if (!sale) throw new NotFoundException('Sale Submission not found.');
        if (sale.status !== SaleSubmissionStatus.ADMIN_ACCEPTED)
          throw new ConflictException(
            'Only Admin-accepted sales can create a Booking.',
          );
        if (sale.booking)
          throw new ConflictException(
            'A Booking already exists for this Sale Submission.',
          );
        if (
          !sale.destination ||
          !sale.travelStartDate ||
          !sale.sellingPrice ||
          !sale.currency
        )
          throw new ConflictException(
            'Accepted Sale Submission is missing required booking information.',
          );

        const year = new Date().getUTCFullYear();
        const counter = await tx.folderCounter.upsert({
          where: { year },
          create: { year, nextNumber: 1 },
          update: { nextNumber: { increment: 1 } },
        });
        const folderNumber = `NT-${year}-${String(counter.nextNumber).padStart(6, '0')}`;
        const booking = await tx.booking.create({
          data: {
            folderNumber,
            customerId: sale.customerId,
            leadId: sale.leadId,
            saleSubmissionId: sale.id,
            salesAdvisorId: sale.submittedByUserId,
            destination: sale.destination,
            travelStartDate: sale.travelStartDate,
            travelEndDate: sale.travelEndDate,
            finalServiceDate: sale.travelEndDate,
            sellingPrice: sale.sellingPrice,
            currency: sale.currency,
            createdById: user.id,
          },
          include: bookingInclude,
        });
        await this.auditService.log(
          {
            actorUserId: user.id,
            entityType: 'Booking',
            entityId: booking.id,
            action: 'FOLDER_NUMBER_GENERATED',
            newValues: { folderNumber, year, sequence: counter.nextNumber },
            requestMetadata,
          },
          tx,
        );
        await this.auditService.log(
          {
            actorUserId: user.id,
            entityType: 'Booking',
            entityId: booking.id,
            action: 'BOOKING_CREATED',
            newValues: this.snapshot(booking),
            metadata: {
              saleSubmissionId,
              leadId: sale.leadId,
              customerId: sale.customerId,
            },
            requestMetadata,
          },
          tx,
        );
        await this.notificationsService.create(
          {
            userId: sale.submittedByUserId,
            type: NotificationType.BOOKING_CREATED,
            title: 'Booking Folder Created',
            message: `Folder ${folderNumber} has been created for your accepted sale.`,
            entityType: 'Booking',
            entityId: booking.id,
          },
          tx,
        );
        return booking;
      });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ConflictException(
          'A Booking already exists for this Sale Submission.',
        );
      throw error;
    }
  }

  async findAll(query: BookingQueryDto, user: AuthenticatedUser) {
    const where: Prisma.BookingWhereInput = {
      ...(!user.permissions.includes('booking.view_all') && {
        OR: [{ salesAdvisorId: user.id }, { operationsOwnerId: user.id }],
      }),
      ...(query.folderNumber && {
        folderNumber: {
          contains: query.folderNumber.trim(),
          mode: 'insensitive',
        },
      }),
      ...(query.customer && {
        customer: {
          OR: [
            {
              firstName: {
                contains: query.customer.trim(),
                mode: 'insensitive',
              },
            },
            {
              lastName: {
                contains: query.customer.trim(),
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
      ...(query.passenger && {
        passengers: {
          some: {
            OR: [
              {
                firstName: {
                  contains: query.passenger.trim(),
                  mode: 'insensitive',
                },
              },
              {
                lastName: {
                  contains: query.passenger.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          },
        },
      }),
      ...(query.salesAdvisorId && { salesAdvisorId: query.salesAdvisorId }),
      ...(query.operationsOwnerId && {
        operationsOwnerId: query.operationsOwnerId,
      }),
      ...(query.bookingStatus && { status: query.bookingStatus }),
      ...(query.travelStatus && { travelStatus: query.travelStatus }),
      ...(query.operationsStatus && {
        operationsStatus: query.operationsStatus,
      }),
      ...(query.dateFrom || query.dateTo
        ? {
            travelStartDate: {
              ...(query.dateFrom && { gte: this.date(query.dateFrom) }),
              ...(query.dateTo && { lte: this.date(query.dateTo) }),
            },
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        include: {
          customer: true,
          salesAdvisor: { select: personSelect },
          operationsOwner: { select: personSelect },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
    ]);
    return {
      data: data.map((item) => this.restrictFinance(item, user)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    this.assertAccess(booking, user);
    const activity = await this.prisma.auditLog.findMany({
      where: { entityType: 'Booking', entityId: id },
      include: { actor: { select: personSelect } },
      orderBy: { createdAt: 'desc' },
    });
    const withPassengers = user.permissions.includes(
      'booking.manage_passengers',
    )
      ? booking
      : {
          ...booking,
          passengers: booking.passengers.map((passenger) => ({
            ...passenger,
            passportNumber: this.maskPassport(passenger.passportNumber),
          })),
        };
    return { ...this.restrictFinance(withPassengers, user), activity };
  }

  async update(
    id: string,
    dto: UpdateBookingDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException('At least one booking field is required.');
    if (
      dto.supplierCost !== undefined &&
      !user.permissions.includes('finance.edit')
    )
      throw new ForbiddenException(
        'finance.edit is required to change supplier cost.',
      );
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.requireBooking(id, user, tx);
      const start = dto.travelStartDate
        ? this.date(dto.travelStartDate)
        : existing.travelStartDate;
      const end = dto.travelEndDate
        ? this.date(dto.travelEndDate)
        : existing.travelEndDate;
      if (end && end < start)
        throw new BadRequestException(
          'Travel end date cannot be before travel start date.',
        );
      const booking = await tx.booking.update({
        where: { id },
        data: {
          ...(dto.destination !== undefined && {
            destination: dto.destination.trim(),
          }),
          ...(dto.travelStartDate !== undefined && { travelStartDate: start }),
          ...(dto.travelEndDate !== undefined && { travelEndDate: end }),
          ...(dto.finalServiceDate !== undefined && {
            finalServiceDate: this.date(dto.finalServiceDate),
          }),
          ...(dto.supplierCost !== undefined && {
            supplierCost: dto.supplierCost,
          }),
        },
        include: bookingInclude,
      });
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'Booking',
          entityId: id,
          action: 'BOOKING_UPDATED',
          oldValues: this.snapshot(existing),
          newValues: this.snapshot(booking),
          requestMetadata: metadata,
        },
        tx,
      );
      return booking;
    });
  }

  async assignOperations(
    id: string,
    dto: AssignOperationsDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.requireBooking(id, user, tx);
      const owner = await tx.user.findUnique({
        where: { id: dto.userId },
        include: { department: true, roles: { include: { role: true } } },
      });
      if (!owner?.isActive)
        throw new NotFoundException('Active Operations user not found.');
      const appropriate =
        owner.department?.name === 'Administration / Operations' ||
        owner.roles.some(({ role }) => role.name === 'OPERATIONS');
      if (!appropriate)
        throw new BadRequestException(
          'Selected user is not an Operations user.',
        );
      const booking = await tx.booking.update({
        where: { id },
        data: { operationsOwnerId: owner.id },
        include: bookingInclude,
      });
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'Booking',
          entityId: id,
          action: 'OPERATIONS_OWNER_ASSIGNED',
          oldValues: { operationsOwnerId: existing.operationsOwnerId },
          newValues: { operationsOwnerId: owner.id },
          requestMetadata: metadata,
        },
        tx,
      );
      await this.notificationsService.create(
        {
          userId: owner.id,
          type: NotificationType.OPERATIONS_ASSIGNED,
          title: 'New Booking Assigned',
          message: `Folder ${existing.folderNumber} has been assigned to you.`,
          entityType: 'Booking',
          entityId: id,
        },
        tx,
      );
      return booking;
    });
  }

  async updateStatus(
    id: string,
    field: 'status' | 'operationsStatus' | 'travelStatus',
    value: string,
    action: string,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.requireBooking(id, user, tx);
      const oldValue = existing[field];
      const booking = await tx.booking.update({
        where: { id },
        data: { [field]: value },
        include: bookingInclude,
      });
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'Booking',
          entityId: id,
          action,
          oldValues: { [field]: oldValue },
          newValues: { [field]: value },
          requestMetadata: metadata,
        },
        tx,
      );
      return booking;
    });
  }

  async addPassenger(
    id: string,
    dto: CreatePassengerDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      if (dto.isPrimaryPassenger)
        await tx.passenger.updateMany({
          where: { bookingId: id },
          data: { isPrimaryPassenger: false },
        });
      const passenger = await tx.passenger.create({
        data: {
          bookingId: id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          dateOfBirth: dto.dateOfBirth ? this.date(dto.dateOfBirth) : undefined,
          nationality: dto.nationality?.trim(),
          passportNumber: dto.passportNumber?.trim(),
          passportExpiryDate: dto.passportExpiryDate
            ? this.date(dto.passportExpiryDate)
            : undefined,
          email: dto.email?.trim(),
          phone: dto.phone?.trim(),
          isPrimaryPassenger: dto.isPrimaryPassenger,
        },
      });
      await this.audit(
        id,
        user.id,
        'PASSENGER_ADDED',
        {
          passengerId: passenger.id,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          passportNumber: this.maskPassport(passenger.passportNumber),
        },
        metadata,
        tx,
      );
      return passenger;
    });
  }

  async updatePassenger(
    id: string,
    passengerId: string,
    dto: UpdatePassengerDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      const existing = await tx.passenger.findFirst({
        where: { id: passengerId, bookingId: id },
      });
      if (!existing) throw new NotFoundException('Passenger not found.');
      if (dto.isPrimaryPassenger)
        await tx.passenger.updateMany({
          where: { bookingId: id, id: { not: passengerId } },
          data: { isPrimaryPassenger: false },
        });
      const passenger = await tx.passenger.update({
        where: { id: passengerId },
        data: {
          ...dto,
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          dateOfBirth: dto.dateOfBirth ? this.date(dto.dateOfBirth) : undefined,
          passportExpiryDate: dto.passportExpiryDate
            ? this.date(dto.passportExpiryDate)
            : undefined,
        },
      });
      await this.audit(
        id,
        user.id,
        'PASSENGER_UPDATED',
        {
          passengerId,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          passportNumber: this.maskPassport(passenger.passportNumber),
        },
        metadata,
        tx,
      );
      return passenger;
    });
  }

  async addSupplier(
    id: string,
    dto: CreateBookingSupplierDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    if (dto.supplierCost && !user.permissions.includes('finance.edit'))
      throw new ForbiddenException(
        'finance.edit is required to record supplier cost.',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      let supplierId = dto.supplierId;
      if (!supplierId) {
        if (!dto.name || !dto.supplierType)
          throw new BadRequestException(
            'supplierId or supplier name and type are required.',
          );
        supplierId = (
          await tx.supplier.create({
            data: {
              name: dto.name.trim(),
              supplierType: dto.supplierType,
              email: dto.email?.trim(),
              phone: dto.phone?.trim(),
            },
          })
        ).id;
      } else if (!(await tx.supplier.findUnique({ where: { id: supplierId } })))
        throw new NotFoundException('Supplier not found.');
      const relation = await tx.bookingSupplier.create({
        data: {
          bookingId: id,
          supplierId,
          serviceType: dto.serviceType.trim(),
          supplierReference: dto.supplierReference?.trim(),
          supplierCost: dto.supplierCost,
          currency: dto.currency?.toUpperCase(),
          status: dto.status,
          notes: dto.notes?.trim(),
        },
        include: { supplier: true },
      });
      await this.audit(
        id,
        user.id,
        'SUPPLIER_ADDED',
        {
          bookingSupplierId: relation.id,
          supplierId,
          serviceType: relation.serviceType,
        },
        metadata,
        tx,
      );
      return relation;
    });
  }

  async updateSupplier(
    id: string,
    relationId: string,
    dto: UpdateBookingSupplierDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    if (dto.supplierCost && !user.permissions.includes('finance.edit'))
      throw new ForbiddenException(
        'finance.edit is required to change supplier cost.',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      if (
        !(await tx.bookingSupplier.findFirst({
          where: { id: relationId, bookingId: id },
        }))
      )
        throw new NotFoundException('Booking supplier not found.');
      const relation = await tx.bookingSupplier.update({
        where: { id: relationId },
        data: { ...dto, currency: dto.currency?.toUpperCase() },
        include: { supplier: true },
      });
      await this.audit(
        id,
        user.id,
        'SUPPLIER_UPDATED',
        {
          bookingSupplierId: relationId,
          serviceType: relation.serviceType,
          status: relation.status,
        },
        metadata,
        tx,
      );
      return relation;
    });
  }

  async addReference(
    id: string,
    dto: CreateBookingReferenceDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      const reference = await tx.bookingReference.create({
        data: {
          bookingId: id,
          type: dto.type,
          reference: dto.reference.trim(),
          supplierId: dto.supplierId,
        },
      });
      await this.audit(
        id,
        user.id,
        'BOOKING_REFERENCE_ADDED',
        {
          referenceId: reference.id,
          type: reference.type,
          reference: reference.reference,
        },
        metadata,
        tx,
      );
      return reference;
    });
  }

  async updateReference(
    id: string,
    referenceId: string,
    dto: UpdateBookingReferenceDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      if (
        !(await tx.bookingReference.findFirst({
          where: { id: referenceId, bookingId: id },
        }))
      )
        throw new NotFoundException('Booking reference not found.');
      const reference = await tx.bookingReference.update({
        where: { id: referenceId },
        data: { ...dto, reference: dto.reference?.trim() },
      });
      await this.audit(
        id,
        user.id,
        'BOOKING_REFERENCE_UPDATED',
        { referenceId, type: reference.type, reference: reference.reference },
        metadata,
        tx,
      );
      return reference;
    });
  }

  async addDocument(
    id: string,
    dto: CreateBookingDocumentDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      const document = await tx.bookingDocument.create({
        data: { bookingId: id, uploadedById: user.id, ...dto },
      });
      await this.audit(
        id,
        user.id,
        'DOCUMENT_METADATA_ADDED',
        {
          documentId: document.id,
          fileName: document.fileName,
          category: document.category,
        },
        metadata,
        tx,
      );
      return document;
    });
  }

  async addNote(
    id: string,
    dto: CreateBookingNoteDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireBooking(id, user, tx);
      const note = await tx.bookingNote.create({
        data: {
          bookingId: id,
          content: dto.content.trim(),
          createdById: user.id,
        },
        include: { createdBy: { select: personSelect } },
      });
      await this.audit(
        id,
        user.id,
        'BOOKING_NOTE_ADDED',
        { noteId: note.id, content: note.content },
        metadata,
        tx,
      );
      return note;
    });
  }

  async addTask(
    id: string,
    dto: CreateBookingTaskDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.requireBooking(id, user, tx);
      if (
        dto.assignedUserId &&
        !(await tx.user.findFirst({
          where: { id: dto.assignedUserId, isActive: true },
        }))
      )
        throw new NotFoundException('Assigned user not found.');
      const task = await tx.bookingTask.create({
        data: {
          bookingId: id,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          assignedUserId: dto.assignedUserId,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          createdById: user.id,
        },
        include: {
          assignedUser: { select: personSelect },
          createdBy: { select: personSelect },
        },
      });
      await this.audit(
        id,
        user.id,
        'BOOKING_TASK_CREATED',
        {
          taskId: task.id,
          title: task.title,
          assignedUserId: task.assignedUserId,
        },
        metadata,
        tx,
      );
      if (task.assignedUserId)
        await this.notificationsService.create(
          {
            userId: task.assignedUserId,
            type: NotificationType.BOOKING_TASK_ASSIGNED,
            title: 'Booking Task Assigned',
            message: `${task.title} has been assigned for folder ${booking.folderNumber}.`,
            entityType: 'Booking',
            entityId: id,
            metadata: { taskId: task.id },
          },
          tx,
        );
      return task;
    });
  }

  async updateTask(
    id: string,
    taskId: string,
    dto: UpdateBookingTaskDto,
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.requireBooking(id, user, tx);
      const existing = await tx.bookingTask.findFirst({
        where: { id: taskId, bookingId: id },
      });
      if (!existing) throw new NotFoundException('Booking task not found.');
      if (
        dto.assignedUserId &&
        !(await tx.user.findFirst({
          where: { id: dto.assignedUserId, isActive: true },
        }))
      )
        throw new NotFoundException('Assigned user not found.');
      const task = await tx.bookingTask.update({
        where: { id: taskId },
        data: {
          ...dto,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        },
        include: {
          assignedUser: { select: personSelect },
          createdBy: { select: personSelect },
        },
      });
      await this.audit(
        id,
        user.id,
        'BOOKING_TASK_UPDATED',
        { taskId, status: task.status, assignedUserId: task.assignedUserId },
        metadata,
        tx,
      );
      if (
        task.assignedUserId &&
        task.assignedUserId !== existing.assignedUserId
      )
        await this.notificationsService.create(
          {
            userId: task.assignedUserId,
            type: NotificationType.BOOKING_TASK_ASSIGNED,
            title: 'Booking Task Assigned',
            message: `${task.title} has been assigned for folder ${booking.folderNumber}.`,
            entityType: 'Booking',
            entityId: id,
            metadata: { taskId },
          },
          tx,
        );
      return task;
    });
  }

  private async requireBooking(
    id: string,
    user: AuthenticatedUser,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const booking = await tx.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found.');
    this.assertAccess(booking, user);
    return booking;
  }
  private assertAccess(
    booking: Pick<Booking, 'salesAdvisorId' | 'operationsOwnerId'>,
    user: AuthenticatedUser,
  ) {
    if (
      user.permissions.includes('booking.view_all') ||
      booking.salesAdvisorId === user.id ||
      booking.operationsOwnerId === user.id
    )
      return;
    throw new ForbiddenException('You cannot access this Booking.');
  }
  private async audit(
    bookingId: string,
    actorUserId: string,
    action: string,
    values: Prisma.InputJsonValue,
    requestMetadata: RequestMetadata | undefined,
    tx: Prisma.TransactionClient,
  ) {
    await this.auditService.log(
      {
        actorUserId,
        entityType: 'Booking',
        entityId: bookingId,
        action,
        newValues: values,
        requestMetadata,
      },
      tx,
    );
  }
  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  private maskPassport(value: string | null) {
    return value ? `****${value.slice(-4)}` : null;
  }
  private restrictFinance<
    T extends {
      sellingPrice: unknown;
      supplierCost: unknown;
      suppliers?: Array<{ supplierCost: unknown }>;
    },
  >(booking: T, user: AuthenticatedUser) {
    if (user.permissions.includes('finance.view')) return booking;
    return {
      ...booking,
      sellingPrice: undefined,
      supplierCost: undefined,
      ...(booking.suppliers && {
        suppliers: booking.suppliers.map((supplier) => ({
          ...supplier,
          supplierCost: undefined,
        })),
      }),
    };
  }
  private snapshot(
    booking: Pick<
      Booking,
      | 'id'
      | 'folderNumber'
      | 'customerId'
      | 'leadId'
      | 'saleSubmissionId'
      | 'salesAdvisorId'
      | 'operationsOwnerId'
      | 'status'
      | 'travelStatus'
      | 'operationsStatus'
      | 'accountsStatus'
      | 'folderStatus'
      | 'destination'
      | 'travelStartDate'
      | 'travelEndDate'
      | 'finalServiceDate'
      | 'sellingPrice'
      | 'supplierCost'
      | 'currency'
    >,
  ): Prisma.InputJsonObject {
    return {
      id: booking.id,
      folderNumber: booking.folderNumber,
      customerId: booking.customerId,
      leadId: booking.leadId,
      saleSubmissionId: booking.saleSubmissionId,
      salesAdvisorId: booking.salesAdvisorId,
      operationsOwnerId: booking.operationsOwnerId,
      status: booking.status,
      travelStatus: booking.travelStatus,
      operationsStatus: booking.operationsStatus,
      accountsStatus: booking.accountsStatus,
      folderStatus: booking.folderStatus,
      destination: booking.destination,
      travelStartDate: booking.travelStartDate.toISOString(),
      travelEndDate: booking.travelEndDate?.toISOString() ?? null,
      finalServiceDate: booking.finalServiceDate?.toISOString() ?? null,
      sellingPrice: booking.sellingPrice.toString(),
      supplierCost: booking.supplierCost?.toString() ?? null,
      currency: booking.currency,
    };
  }
}
