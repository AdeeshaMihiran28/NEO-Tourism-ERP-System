import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessRequestStatus,
  ITAssetStatus,
  ITTicketActivityType,
  ITTicketStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { RequestMetadata } from '../common/request-metadata';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessQueryDto,
  AssetQueryDto,
  AssignAssetDto,
  AssignTicketDto,
  CreateAccessRequestDto,
  CreateAssetDto,
  CreateTicketDto,
  ResolveTicketDto,
  ReturnAssetDto,
  ReviewAccessRequestDto,
  TicketQueryDto,
  UpdateAssetDto,
  UpdateTicketStatusDto,
} from './dto/it.dto';

const employeeMini = {
  id: true,
  userId: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  employmentStatus: true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;
const ticketInclude = {
  requestedByEmployee: { select: employeeMini },
  assignedToUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  activities: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ITTicketInclude;

@Injectable()
export class ItService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createAsset(
    dto: CreateAssetDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const counter = await tx.iTAssetCounter.upsert({
          where: { id: 1 },
          create: { id: 1, nextNumber: 2 },
          update: { nextNumber: { increment: 1 } },
        });
        const asset = await tx.iTAsset.create({
          data: {
            ...dto,
            assetTag: `NEO-IT-${(counter.nextNumber - 1).toString().padStart(4, '0')}`,
            ...(dto.purchaseDate && {
              purchaseDate: dateOnly(dto.purchaseDate),
            }),
            ...(dto.warrantyEndDate && {
              warrantyEndDate: dateOnly(dto.warrantyEndDate),
            }),
          },
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'ITAsset',
            entityId: asset.id,
            action: 'IT_ASSET_CREATED',
            newValues: { assetTag: asset.assetTag, assetType: asset.assetType },
            requestMetadata: meta,
          },
          tx,
        );
        return asset;
      });
    } catch (error) {
      this.rethrowConflict(
        error,
        'An asset with this serial number already exists.',
      );
    }
  }

  async assets(query: AssetQueryDto) {
    const where: Prisma.ITAssetWhereInput = {
      ...(query.type && { assetType: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { assetTag: { contains: query.search, mode: 'insensitive' } },
          { serialNumber: { contains: query.search, mode: 'insensitive' } },
          { manufacturer: { contains: query.search, mode: 'insensitive' } },
          { model: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.iTAsset.count({ where }),
      this.prisma.iTAsset.findMany({
        where,
        include: {
          assignments: {
            where: { returnedAt: null },
            include: { employee: { select: employeeMini } },
            take: 1,
          },
        },
        orderBy: { assetTag: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
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

  async asset(id: string) {
    const asset = await this.prisma.iTAsset.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            employee: { select: employeeMini },
            assignedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            returnedTo: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found.');
    return asset;
  }

  async updateAsset(
    id: string,
    dto: UpdateAssetDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const old = await this.asset(id);
    try {
      const updated = await this.prisma.iTAsset.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.purchaseDate && { purchaseDate: dateOnly(dto.purchaseDate) }),
          ...(dto.warrantyEndDate && {
            warrantyEndDate: dateOnly(dto.warrantyEndDate),
          }),
        },
      });
      await this.audit.log({
        actorUserId: actorId,
        entityType: 'ITAsset',
        entityId: id,
        action: 'IT_ASSET_UPDATED',
        oldValues: { status: old.status },
        newValues: { status: updated.status },
        requestMetadata: meta,
      });
      return updated;
    } catch (error) {
      this.rethrowConflict(
        error,
        'An asset with this serial number already exists.',
      );
    }
  }

  async assignAsset(
    id: string,
    dto: AssignAssetDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const asset = await this.prisma.iTAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found.');
    if (asset.status !== ITAssetStatus.AVAILABLE)
      throw new ConflictException('Only available assets can be assigned.');
    try {
      const assignment = await this.prisma.$transaction(async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { id: dto.employeeId },
        });
        if (!employee) throw new NotFoundException('Employee not found.');
        const result = await tx.assetAssignment.create({
          data: {
            assetId: id,
            employeeId: dto.employeeId,
            assignedById: actorId,
            conditionOnAssignment: dto.condition,
            notes: dto.notes,
          },
          include: { employee: { select: employeeMini } },
        });
        await tx.iTAsset.update({
          where: { id },
          data: { status: ITAssetStatus.ASSIGNED },
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'ITAsset',
            entityId: id,
            action: 'IT_ASSET_ASSIGNED',
            newValues: { employeeId: dto.employeeId, assignmentId: result.id },
            requestMetadata: meta,
          },
          tx,
        );
        if (employee.userId)
          await this.notifications.create(
            {
              userId: employee.userId,
              type: NotificationType.ASSET_ASSIGNED,
              title: 'IT asset assigned',
              message: `${asset.assetTag} has been assigned to you.`,
              entityType: 'ITAsset',
              entityId: id,
            },
            tx,
          );
        return result;
      });
      return assignment;
    } catch (error) {
      this.rethrowConflict(
        error,
        'This asset already has an active assignment.',
      );
    }
  }

  async returnAsset(
    id: string,
    dto: ReturnAssetDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const assignment = await this.prisma.assetAssignment.findFirst({
      where: { assetId: id, returnedAt: null },
      include: { asset: true },
    });
    if (!assignment)
      throw new BadRequestException('This asset has no active assignment.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.assetAssignment.update({
        where: { id: assignment.id },
        data: {
          returnedAt: new Date(),
          returnedToId: actorId,
          conditionOnReturn: dto.condition,
          ...(dto.notes && { notes: dto.notes }),
        },
      });
      await tx.iTAsset.update({
        where: { id },
        data: { status: ITAssetStatus.AVAILABLE },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'ITAsset',
          entityId: id,
          action: 'IT_ASSET_RETURNED',
          oldValues: { employeeId: assignment.employeeId },
          newValues: { status: ITAssetStatus.AVAILABLE },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
  }

  employees() {
    return this.prisma.employee.findMany({
      where: { employmentStatus: { notIn: ['TERMINATED', 'INACTIVE'] } },
      select: employeeMini,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }
  offboarding() {
    return this.prisma.employee.findMany({
      where: {
        OR: [
          { offboardingStatus: { not: 'NOT_STARTED' } },
          { employmentStatus: { in: ['NOTICE_PERIOD', 'TERMINATED'] } },
        ],
      },
      select: {
        ...employeeMini,
        offboardingStatus: true,
        erpAccountDisabled: true,
        emailAccessRemoved: true,
        vpnRemoved: true,
        deviceReturnChecked: true,
        telephonyRemoved: true,
        otherAccessRemoved: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createTicket(
    dto: CreateTicketDto,
    userId: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.employeeForUser(userId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.iTTicketCounter.upsert({
        where: { year: now.getUTCFullYear() },
        create: { year: now.getUTCFullYear(), nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      const ticket = await tx.iTTicket.create({
        data: {
          ...dto,
          requestedByEmployeeId: employee.id,
          ticketNumber: `IT-${now.getUTCFullYear()}-${(counter.nextNumber - 1).toString().padStart(6, '0')}`,
        },
      });
      await tx.iTTicketActivity.create({
        data: {
          ticketId: ticket.id,
          userId,
          type: ITTicketActivityType.TICKET_CREATED,
          message: 'Ticket created.',
        },
      });
      await this.audit.log(
        {
          actorUserId: userId,
          entityType: 'ITTicket',
          entityId: ticket.id,
          action: 'IT_TICKET_CREATED',
          newValues: {
            ticketNumber: ticket.ticketNumber,
            priority: ticket.priority,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return ticket;
    });
  }

  async myTickets(userId: string, query: TicketQueryDto) {
    const employee = await this.employeeForUser(userId);
    return this.prisma.iTTicket.findMany({
      where: { requestedByEmployeeId: employee.id, ...ticketWhere(query) },
      include: ticketInclude,
      orderBy: { createdAt: 'desc' },
    });
  }
  tickets(query: TicketQueryDto) {
    return this.prisma.iTTicket.findMany({
      where: ticketWhere(query),
      include: ticketInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }
  async ticket(id: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.iTTicket.findUnique({
      where: { id },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException('IT ticket not found.');
    if (
      !user.permissions.includes('it.ticket.view_all') &&
      ticket.requestedByEmployee.userId !== user.id
    )
      throw new ForbiddenException('You cannot view this ticket.');
    return ticket;
  }

  async assignTicket(
    id: string,
    dto: AssignTicketDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const ticket = await this.requireTicket(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.iTTicket.update({
        where: { id },
        data: { assignedToUserId: dto.userId, status: ITTicketStatus.ASSIGNED },
      });
      await tx.iTTicketActivity.create({
        data: {
          ticketId: id,
          userId: actorId,
          type: ITTicketActivityType.ASSIGNED,
          message: dto.note ?? 'Ticket assigned.',
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'ITTicket',
          entityId: id,
          action: 'IT_TICKET_ASSIGNED',
          oldValues: { assignedToUserId: ticket.assignedToUserId },
          newValues: { assignedToUserId: dto.userId },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
    await this.notifyTicketRequester(
      ticket,
      NotificationType.IT_TICKET_ASSIGNED,
      'IT ticket assigned',
      `${ticket.ticketNumber} has been assigned.`,
    );
    return updated;
  }

  async updateTicketStatus(
    id: string,
    dto: UpdateTicketStatusDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    if (dto.status === ITTicketStatus.RESOLVED)
      throw new BadRequestException(
        'Use the resolve endpoint and provide a resolution.',
      );
    const ticket = await this.requireTicket(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.iTTicket.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.iTTicketActivity.create({
        data: {
          ticketId: id,
          userId: actorId,
          type: ITTicketActivityType.STATUS_CHANGED,
          message: dto.note ?? `Status changed to ${dto.status}.`,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'ITTicket',
          entityId: id,
          action: 'IT_TICKET_STATUS_CHANGED',
          oldValues: { status: ticket.status },
          newValues: { status: dto.status },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
    await this.notifyTicketRequester(
      ticket,
      NotificationType.IT_TICKET_UPDATED,
      'IT ticket updated',
      `${ticket.ticketNumber} is now ${dto.status}.`,
    );
    return updated;
  }

  async resolveTicket(
    id: string,
    dto: ResolveTicketDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const ticket = await this.requireTicket(id);
    if (ticket.status === ITTicketStatus.CLOSED)
      throw new ConflictException('A closed ticket cannot be resolved.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.iTTicket.update({
        where: { id },
        data: {
          status: ITTicketStatus.RESOLVED,
          resolution: dto.resolution,
          resolvedAt: new Date(),
        },
      });
      await tx.iTTicketActivity.create({
        data: {
          ticketId: id,
          userId: actorId,
          type: ITTicketActivityType.RESOLVED,
          message: dto.resolution,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'ITTicket',
          entityId: id,
          action: 'IT_TICKET_RESOLVED',
          oldValues: { status: ticket.status },
          newValues: { status: ITTicketStatus.RESOLVED },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
    await this.notifyTicketRequester(
      ticket,
      NotificationType.IT_TICKET_RESOLVED,
      'IT ticket resolved',
      `${ticket.ticketNumber} has been resolved.`,
    );
    return updated;
  }

  async createAccessRequest(
    dto: CreateAccessRequestDto,
    userId: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.employeeForUser(userId);
    const request = await this.prisma.accessRequest.create({
      data: { ...dto, employeeId: employee.id, requestedById: userId },
    });
    await this.audit.log({
      actorUserId: userId,
      entityType: 'AccessRequest',
      entityId: request.id,
      action: 'ACCESS_REQUEST_CREATED',
      newValues: { systemName: dto.systemName, accessType: dto.accessType },
      requestMetadata: meta,
    });
    return request;
  }
  async myAccessRequests(userId: string) {
    const employee = await this.employeeForUser(userId);
    return this.prisma.accessRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
  }
  accessRequests(query: AccessQueryDto) {
    return this.prisma.accessRequest.findMany({
      where: { ...(query.status && { status: query.status }) },
      include: {
        employee: { select: employeeMini },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async reviewAccess(
    id: string,
    status: AccessRequestStatus,
    dto: ReviewAccessRequestDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const request = await this.prisma.accessRequest.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!request) throw new NotFoundException('Access request not found.');
    if (request.status !== AccessRequestStatus.PENDING)
      throw new ConflictException(
        'Only pending access requests can be reviewed.',
      );
    const updated = await this.prisma.accessRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: actorId,
        reviewedAt: new Date(),
        reviewNotes: dto.notes,
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'AccessRequest',
      entityId: id,
      action:
        status === AccessRequestStatus.APPROVED
          ? 'ACCESS_REQUEST_APPROVED'
          : 'ACCESS_REQUEST_REJECTED',
      oldValues: { status: request.status },
      newValues: { status },
      requestMetadata: meta,
    });
    if (request.employee.userId)
      await this.notifications.create({
        userId: request.employee.userId,
        type:
          status === AccessRequestStatus.APPROVED
            ? NotificationType.ACCESS_REQUEST_APPROVED
            : NotificationType.ACCESS_REQUEST_REJECTED,
        title: `Access request ${status.toLowerCase()}`,
        message: `Your ${request.systemName} access request was ${status.toLowerCase()}.`,
        entityType: 'AccessRequest',
        entityId: id,
      });
    return updated;
  }

  async fulfilAccess(id: string, actorId: string, meta?: RequestMetadata) {
    const request = await this.prisma.accessRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Access request not found.');
    if (request.status !== AccessRequestStatus.APPROVED)
      throw new ConflictException(
        'Only approved access requests can be fulfilled.',
      );
    const updated = await this.prisma.accessRequest.update({
      where: { id },
      data: {
        status: AccessRequestStatus.FULFILLED,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'AccessRequest',
      entityId: id,
      action: 'ACCESS_REQUEST_FULFILLED',
      oldValues: { status: request.status },
      newValues: { status: updated.status },
      requestMetadata: meta,
    });
    return updated;
  }

  private employeeForUser(userId: string) {
    return this.prisma.employee
      .findUnique({ where: { userId } })
      .then((employee) => {
        if (!employee)
          throw new NotFoundException(
            'Your user account is not linked to an employee record.',
          );
        return employee;
      });
  }
  private async requireTicket(id: string) {
    const ticket = await this.prisma.iTTicket.findUnique({
      where: { id },
      include: { requestedByEmployee: true },
    });
    if (!ticket) throw new NotFoundException('IT ticket not found.');
    return ticket;
  }
  private async notifyTicketRequester(
    ticket: {
      id: string;
      ticketNumber: string;
      requestedByEmployee: { userId: string | null };
    },
    type: NotificationType,
    title: string,
    message: string,
  ) {
    if (ticket.requestedByEmployee.userId)
      await this.notifications.create({
        userId: ticket.requestedByEmployee.userId,
        type,
        title,
        message,
        entityType: 'ITTicket',
        entityId: ticket.id,
      });
  }
  private rethrowConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }
}

function dateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
function ticketWhere(query: TicketQueryDto): Prisma.ITTicketWhereInput {
  return {
    ...(query.status && { status: query.status }),
    ...(query.priority && { priority: query.priority }),
    ...(query.category && { category: query.category }),
  };
}
