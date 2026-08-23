import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaveRequestStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { RequestMetadata } from '../common/request-metadata';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignEmployeeShiftDto,
  AssignShiftDto,
  AttendanceQueryDto,
  CreateEmployeeDocumentDto,
  CreateEmployeeDto,
  CreateLeaveRequestDto,
  CreateShiftDto,
  EmployeeQueryDto,
  ReviewLeaveDto,
  UpdateAttendanceDto,
  UpdateEmployeeDto,
  UpdateEmploymentStatusDto,
  UpdateProcessDto,
  UpdateShiftDto,
} from './dto/hr.dto';

const employeeSummary = {
  id: true,
  userId: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  workEmail: true,
  phone: true,
  jobTitle: true,
  employmentType: true,
  employmentStatus: true,
  joinDate: true,
  endDate: true,
  onboardingStatus: true,
  offboardingStatus: true,
  department: { select: { id: true, name: true } },
  manager: {
    select: { id: true, employeeNumber: true, firstName: true, lastName: true },
  },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createEmployee(
    dto: CreateEmployeeDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const counter = await tx.employeeCounter.upsert({
          where: { id: 1 },
          create: { id: 1, nextNumber: 2 },
          update: { nextNumber: { increment: 1 } },
        });
        const number = counter.nextNumber - 1;
        const employee = await tx.employee.create({
          data: {
            ...dto,
            employeeNumber: `NEO-EMP-${number.toString().padStart(4, '0')}`,
            joinDate: dateOnly(dto.joinDate),
            ...(dto.endDate && { endDate: dateOnly(dto.endDate) }),
            ...(dto.dateOfBirth && { dateOfBirth: dateOnly(dto.dateOfBirth) }),
          },
          select: employeeSummary,
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'Employee',
            entityId: employee.id,
            action: 'EMPLOYEE_CREATED',
            newValues: {
              employeeNumber: employee.employeeNumber,
              firstName: employee.firstName,
              lastName: employee.lastName,
            },
            requestMetadata: meta,
          },
          tx,
        );
        return employee;
      });
    } catch (error) {
      this.rethrowConflict(error, 'Employee user or email is already linked.');
    }
  }

  async findEmployees(query: EmployeeQueryDto) {
    const where: Prisma.EmployeeWhereInput = {
      ...(query.departmentId && { departmentId: query.departmentId }),
      ...(query.status && { employmentStatus: query.status }),
      ...(query.search && {
        OR: [
          { employeeNumber: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { workEmail: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        select: employeeSummary,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
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

  async findEmployee(id: string, user: AuthenticatedUser) {
    const canSeeSensitive = user.permissions.includes('hr.employee.edit');
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        ...employeeSummary,
        personalEmail: canSeeSensitive,
        dateOfBirth: canSeeSensitive,
        address: canSeeSensitive,
        emergencyContactName: canSeeSensitive,
        emergencyContactPhone: canSeeSensitive,
        erpAccountDisabled: true,
        emailAccessRemoved: true,
        vpnRemoved: true,
        deviceReturnChecked: true,
        telephonyRemoved: true,
        otherAccessRemoved: true,
        shifts: {
          include: { shift: true },
          orderBy: { effectiveFrom: 'desc' },
          take: 10,
        },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  async updateEmployee(
    id: string,
    dto: UpdateEmployeeDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const existing = await this.requireEmployee(id);
    try {
      const updated = await this.prisma.employee.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.joinDate && { joinDate: dateOnly(dto.joinDate) }),
          ...(dto.endDate && { endDate: dateOnly(dto.endDate) }),
          ...(dto.dateOfBirth && { dateOfBirth: dateOnly(dto.dateOfBirth) }),
        },
        select: employeeSummary,
      });
      await this.audit.log({
        actorUserId: actorId,
        entityType: 'Employee',
        entityId: id,
        action: 'EMPLOYEE_UPDATED',
        oldValues: publicEmployee(existing),
        newValues: publicEmployee(updated),
        requestMetadata: meta,
      });
      return updated;
    } catch (error) {
      this.rethrowConflict(error, 'Employee user or email is already linked.');
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateEmploymentStatusDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const old = await this.requireEmployee(id);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        employmentStatus: dto.status,
        ...(dto.endDate && { endDate: dateOnly(dto.endDate) }),
      },
      select: employeeSummary,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'Employee',
      entityId: id,
      action: 'EMPLOYEE_STATUS_CHANGED',
      oldValues: { status: old.employmentStatus },
      newValues: { status: updated.employmentStatus },
      requestMetadata: meta,
    });
    return updated;
  }

  async checkIn(userId: string, meta?: RequestMetadata) {
    const employee = await this.employeeForUser(userId);
    const now = new Date();
    try {
      const attendance = await this.prisma.attendance.create({
        data: { employeeId: employee.id, date: utcDay(now), checkInAt: now },
      });
      await this.audit.log({
        actorUserId: userId,
        entityType: 'Attendance',
        entityId: attendance.id,
        action: 'ATTENDANCE_CHECKED_IN',
        newValues: { employeeId: employee.id },
        requestMetadata: meta,
      });
      return attendance;
    } catch (error) {
      this.rethrowConflict(error, 'You have already checked in today.');
    }
  }

  async checkOut(userId: string, meta?: RequestMetadata) {
    const employee = await this.employeeForUser(userId);
    const attendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: { employeeId: employee.id, date: utcDay(new Date()) },
      },
    });
    if (!attendance?.checkInAt)
      throw new BadRequestException('Check in before checking out.');
    if (attendance.checkOutAt)
      throw new ConflictException('You have already checked out today.');
    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOutAt: new Date() },
    });
    await this.audit.log({
      actorUserId: userId,
      entityType: 'Attendance',
      entityId: updated.id,
      action: 'ATTENDANCE_CHECKED_OUT',
      requestMetadata: meta,
    });
    return updated;
  }

  async myAttendance(userId: string) {
    const employee = await this.employeeForUser(userId);
    return this.prisma.attendance.findMany({
      where: { employeeId: employee.id },
      orderBy: { date: 'desc' },
      take: 60,
    });
  }

  findAttendance(query: AttendanceQueryDto) {
    return this.prisma.attendance.findMany({
      where: {
        ...(query.employeeId && { employeeId: query.employeeId }),
        ...(query.status && { status: query.status }),
        ...(query.dateFrom || query.dateTo
          ? {
              date: {
                ...(query.dateFrom && { gte: dateOnly(query.dateFrom) }),
                ...(query.dateTo && { lte: dateOnly(query.dateTo) }),
              },
            }
          : {}),
      },
      include: { employee: { select: employeeSummary } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async updateAttendance(
    id: string,
    dto: UpdateAttendanceDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const old = await this.prisma.attendance.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Attendance record not found.');
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.checkInAt && { checkInAt: new Date(dto.checkInAt) }),
        ...(dto.checkOutAt && { checkOutAt: new Date(dto.checkOutAt) }),
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'Attendance',
      entityId: id,
      action: 'ATTENDANCE_CORRECTED',
      oldValues: { status: old.status, notes: old.notes },
      newValues: { status: updated.status, notes: updated.notes },
      requestMetadata: meta,
    });
    return updated;
  }

  shifts() {
    return this.prisma.shift.findMany({ orderBy: { name: 'asc' } });
  }
  createShift(dto: CreateShiftDto) {
    return this.prisma.shift
      .create({ data: dto })
      .catch((e: unknown) =>
        this.rethrowConflict(e, 'A shift with this name already exists.'),
      );
  }
  updateShift(id: string, dto: UpdateShiftDto) {
    return this.prisma.shift
      .update({ where: { id }, data: dto })
      .catch((e: unknown) => this.rethrowKnown(e, 'Shift'));
  }
  assignShift(dto: AssignShiftDto) {
    return this.prisma.employeeShift.create({
      data: {
        ...dto,
        effectiveFrom: dateOnly(dto.effectiveFrom),
        ...(dto.effectiveTo && { effectiveTo: dateOnly(dto.effectiveTo) }),
      },
      include: { employee: { select: employeeSummary }, shift: true },
    });
  }

  assignEmployeeShift(employeeId: string, dto: AssignEmployeeShiftDto) {
    return this.assignShift({ employeeId, ...dto });
  }

  async createLeave(
    dto: CreateLeaveRequestDto,
    userId: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.employeeForUser(userId);
    if (dateOnly(dto.endDate) < dateOnly(dto.startDate))
      throw new BadRequestException('End date must not be before start date.');
    const leave = await this.prisma.leaveRequest.create({
      data: {
        ...dto,
        employeeId: employee.id,
        startDate: dateOnly(dto.startDate),
        endDate: dateOnly(dto.endDate),
      },
      include: { employee: { select: employeeSummary } },
    });
    await this.audit.log({
      actorUserId: userId,
      entityType: 'LeaveRequest',
      entityId: leave.id,
      action: 'LEAVE_REQUESTED',
      newValues: { leaveType: leave.leaveType, status: leave.status },
      requestMetadata: meta,
    });
    const reviewers = await this.usersWithPermission('hr.leave.manage');
    await Promise.all(
      reviewers
        .filter((id) => id !== userId)
        .map((id) =>
          this.notifications.create({
            userId: id,
            type: NotificationType.LEAVE_REQUEST,
            title: 'Leave request submitted',
            message: `${employee.firstName} ${employee.lastName} submitted a leave request.`,
            entityType: 'LeaveRequest',
            entityId: leave.id,
          }),
        ),
    );
    return leave;
  }

  async myLeave(userId: string) {
    const employee = await this.employeeForUser(userId);
    return this.prisma.leaveRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
  }
  leaveRequests() {
    return this.prisma.leaveRequest.findMany({
      include: {
        employee: { select: employeeSummary },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async reviewLeave(
    id: string,
    status: LeaveRequestStatus,
    dto: ReviewLeaveDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!leave) throw new NotFoundException('Leave request not found.');
    if (leave.status !== LeaveRequestStatus.PENDING)
      throw new ConflictException(
        'Only pending leave requests can be reviewed.',
      );
    const updated = await this.prisma.leaveRequest.update({
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
      entityType: 'LeaveRequest',
      entityId: id,
      action:
        status === LeaveRequestStatus.APPROVED
          ? 'LEAVE_APPROVED'
          : 'LEAVE_REJECTED',
      oldValues: { status: leave.status },
      newValues: { status },
      requestMetadata: meta,
    });
    if (leave.employee.userId)
      await this.notifications.create({
        userId: leave.employee.userId,
        type:
          status === LeaveRequestStatus.APPROVED
            ? NotificationType.LEAVE_APPROVED
            : NotificationType.LEAVE_REJECTED,
        title: `Leave request ${status.toLowerCase()}`,
        message: `Your leave request was ${status.toLowerCase()}.`,
        entityType: 'LeaveRequest',
        entityId: id,
      });
    return updated;
  }

  async cancelLeave(id: string, userId: string, meta?: RequestMetadata) {
    const employee = await this.employeeForUser(userId);
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Leave request not found.');
    if (leave.employeeId !== employee.id)
      throw new ForbiddenException(
        'You can only cancel your own leave request.',
      );
    if (leave.status !== LeaveRequestStatus.PENDING)
      throw new ConflictException(
        'Only pending leave requests can be cancelled.',
      );
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveRequestStatus.CANCELLED },
    });
    await this.audit.log({
      actorUserId: userId,
      entityType: 'LeaveRequest',
      entityId: id,
      action: 'LEAVE_CANCELLED',
      requestMetadata: meta,
    });
    return updated;
  }

  employeeDocuments(employeeId: string) {
    return this.requireEmployee(employeeId).then(() =>
      this.prisma.employeeDocument.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
  async createDocument(
    employeeId: string,
    dto: CreateEmployeeDocumentDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    await this.requireEmployee(employeeId);
    const document = await this.prisma.employeeDocument.create({
      data: { ...dto, employeeId, uploadedById: actorId },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'EmployeeDocument',
      entityId: document.id,
      action: 'EMPLOYEE_DOCUMENT_ADDED',
      newValues: { employeeId, fileName: dto.fileName, category: dto.category },
      requestMetadata: meta,
    });
    return document;
  }

  async updateProcess(
    id: string,
    kind: 'onboarding' | 'offboarding',
    dto: UpdateProcessDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const old = await this.requireEmployee(id);
    const data =
      kind === 'onboarding'
        ? { onboardingStatus: dto.status }
        : {
            offboardingStatus: dto.status,
            erpAccountDisabled: dto.erpAccountDisabled,
            emailAccessRemoved: dto.emailAccessRemoved,
            vpnRemoved: dto.vpnRemoved,
            deviceReturnChecked: dto.deviceReturnChecked,
            telephonyRemoved: dto.telephonyRemoved,
            otherAccessRemoved: dto.otherAccessRemoved,
          };
    const updated = await this.prisma.employee.update({
      where: { id },
      data,
      select: employeeSummary,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'Employee',
      entityId: id,
      action:
        kind === 'onboarding'
          ? 'ONBOARDING_STATUS_CHANGED'
          : 'OFFBOARDING_STATUS_CHANGED',
      oldValues: {
        status:
          kind === 'onboarding' ? old.onboardingStatus : old.offboardingStatus,
      },
      newValues: { status: dto.status },
      requestMetadata: meta,
    });
    return updated;
  }

  private requireEmployee(id: string) {
    return this.prisma.employee
      .findUnique({ where: { id } })
      .then((employee) => {
        if (!employee) throw new NotFoundException('Employee not found.');
        return employee;
      });
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
  private async usersWithPermission(code: string) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: { role: { permissions: { some: { permission: { code } } } } },
        },
      },
      select: { id: true },
    });
    return users.map(({ id }) => id);
  }
  private rethrowConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }
  private rethrowKnown(error: unknown, entity: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    )
      throw new NotFoundException(`${entity} not found.`);
    this.rethrowConflict(error, `${entity} conflicts with an existing record.`);
  }
}

function dateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
function publicEmployee(value: {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
  jobTitle: string;
}) {
  return {
    employeeNumber: value.employeeNumber,
    firstName: value.firstName,
    lastName: value.lastName,
    employmentStatus: value.employmentStatus,
    jobTitle: value.jobTitle,
  };
}
