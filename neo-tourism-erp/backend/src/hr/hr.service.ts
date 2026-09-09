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
  AssignAttendancePolicyDto,
  AssignEmployeeShiftDto,
  AssignShiftDto,
  AttendanceQueryDto,
  CreateAttendancePolicyDto,
  CreateEmployeeDocumentDto,
  CreateEmployeeDto,
  CreateLeaveRequestDto,
  CreateShiftDto,
  EmployeeQueryDto,
  ReviewLeaveDto,
  UpdateAttendanceDto,
  UpdateAttendancePolicyDto,
  UpdateEmployeeDto,
  UpdateEmploymentStatusDto,
  UpdateProcessDto,
  UpdateShiftDto,
} from './dto/hr.dto';
import { HrLaunchService } from './hr-launch.service';

const employeeSummary = {
  id: true,
  userId: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  workEmail: true,
  workPhone: true,
  jobTitle: true,
  organizationLevel: true,
  employmentType: true,
  employmentStatus: true,
  joinDate: true,
  endDate: true,
  archivedAt: true,
  departmentId: true,
  managerId: true,
  attendancePolicyId: true,
  onboardingStatus: true,
  offboardingStatus: true,
  department: { select: { id: true, name: true } },
  manager: {
    select: { id: true, employeeNumber: true, firstName: true, lastName: true },
  },
  shifts: {
    orderBy: { effectiveFrom: 'desc' as const },
    take: 1,
    select: { shift: true },
  },
} satisfies Prisma.EmployeeSelect;

const attendanceSessions = {
  workSessions: { orderBy: { startedAt: 'asc' as const } },
  breaks: { orderBy: { startedAt: 'asc' as const } },
};

type AttendancePolicyRules = {
  id: string | null;
  name: string;
  dailyBreakMinutes: number | null;
  maxBreakSessions: number | null;
  flexibleBreaks: boolean;
  isActive: boolean;
};

const STANDARD_ATTENDANCE_POLICY: AttendancePolicyRules = {
  id: null,
  name: 'STANDARD',
  dailyBreakMinutes: 60,
  maxBreakSessions: 3,
  flexibleBreaks: false,
  isActive: true,
};

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly launch: HrLaunchService,
  ) {}

  async createEmployee(
    dto: CreateEmployeeDto,
    actor: AuthenticatedUser,
    meta?: RequestMetadata,
  ) {
    this.assertOrganizationLevelAllowed(dto.organizationLevel, actor);
    await this.launch.validateManager(undefined, dto.managerId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { shiftId, ...employeeData } = dto;
        if (shiftId) await this.requireActiveShift(shiftId, tx);
        const counter = await tx.employeeCounter.upsert({
          where: { id: 1 },
          create: { id: 1, nextNumber: 2 },
          update: { nextNumber: { increment: 1 } },
        });
        const number = counter.nextNumber - 1;
        const employee = await tx.employee.create({
          data: {
            ...employeeData,
            employeeNumber: `NEO-EMP-${number.toString().padStart(4, '0')}`,
            joinDate: dateOnly(dto.joinDate),
            ...(dto.endDate && { endDate: dateOnly(dto.endDate) }),
            ...(dto.dateOfBirth && { dateOfBirth: dateOnly(dto.dateOfBirth) }),
          },
          select: employeeSummary,
        });
        if (shiftId) {
          await tx.employeeShift.create({
            data: {
              employeeId: employee.id,
              shiftId,
              effectiveFrom: employee.joinDate,
            },
          });
        }
        await this.launch.recordInitialHistory(employee, actor.id, tx);
        await this.launch.initializeLeaveBalances(
          employee.id,
          employee.joinDate,
          tx,
        );
        await this.audit.log(
          {
            actorUserId: actor.id,
            entityType: 'Employee',
            entityId: employee.id,
            action: 'EMPLOYEE_CREATED',
            newValues: {
              employeeNumber: employee.employeeNumber,
              firstName: employee.firstName,
              lastName: employee.lastName,
              shiftId: shiftId ?? null,
            },
            requestMetadata: meta,
          },
          tx,
        );
        return shiftId
          ? tx.employee.findUniqueOrThrow({
              where: { id: employee.id },
              select: employeeSummary,
            })
          : employee;
      });
    } catch (error) {
      this.rethrowConflict(error, 'Employee user or email is already linked.');
    }
  }

  async findEmployees(query: EmployeeQueryDto) {
    const where: Prisma.EmployeeWhereInput = {
      ...(!query.includeArchived && { archivedAt: null }),
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
        phone: canSeeSensitive,
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
        user: { select: { email: true, isActive: true } },
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
    actor: AuthenticatedUser,
    meta?: RequestMetadata,
  ) {
    this.assertOrganizationLevelAllowed(dto.organizationLevel, actor);
    const existing = await this.requireEmployee(id);
    await this.launch.validateManager(id, dto.managerId);
    const { changeReason, shiftId, ...changes } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (shiftId) await this.requireActiveShift(shiftId, tx);
        const updated = await tx.employee.update({
          where: { id },
          data: {
            ...changes,
            ...(dto.joinDate && { joinDate: dateOnly(dto.joinDate) }),
            ...(dto.endDate && { endDate: dateOnly(dto.endDate) }),
            ...(dto.dateOfBirth && { dateOfBirth: dateOnly(dto.dateOfBirth) }),
          },
          select: employeeSummary,
        });
        await this.audit.log(
          {
            actorUserId: actor.id,
            entityType: 'Employee',
            entityId: id,
            action: 'EMPLOYEE_UPDATED',
            oldValues: publicEmployee(existing),
            newValues: publicEmployee(updated),
            requestMetadata: meta,
          },
          tx,
        );
        await this.launch.recordEmploymentChange(
          existing,
          changes,
          actor.id,
          changeReason,
          meta,
          tx,
        );
        if (shiftId) {
          await this.setEmployeeShift(
            id,
            shiftId,
            new Date().toISOString(),
            actor.id,
            meta,
            tx,
          );
          return tx.employee.findUniqueOrThrow({
            where: { id },
            select: employeeSummary,
          });
        }
        return updated;
      });
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
    if (old.archivedAt)
      throw new ConflictException('Archived employees cannot change status.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: {
          employmentStatus: dto.status,
          ...(dto.endDate && { endDate: dateOnly(dto.endDate) }),
        },
        select: employeeSummary,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'Employee',
          entityId: id,
          action: 'EMPLOYEE_STATUS_CHANGED',
          oldValues: { status: old.employmentStatus },
          newValues: { status: updated.employmentStatus },
          requestMetadata: meta,
        },
        tx,
      );
      await this.launch.recordEmploymentChange(
        old,
        { employmentStatus: dto.status },
        actorId,
        dto.reason,
        meta,
        tx,
      );
      await this.launch.flagErpAccessIfRequired(
        old,
        old.employmentStatus,
        updated.employmentStatus,
        actorId,
        meta,
        tx,
      );
      return updated;
    });
  }

  async archiveEmployee(id: string, actorId: string, meta?: RequestMetadata) {
    const old = await this.requireEmployee(id);
    if (old.archivedAt)
      throw new ConflictException('Employee is already archived.');
    return this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();
      const updated = await tx.employee.update({
        where: { id },
        data: { archivedAt, employmentStatus: 'INACTIVE' },
        select: employeeSummary,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'Employee',
          entityId: id,
          action: 'EMPLOYEE_ARCHIVED',
          oldValues: { archivedAt: null, status: old.employmentStatus },
          newValues: { archivedAt, status: updated.employmentStatus },
          requestMetadata: meta,
        },
        tx,
      );
      if (old.employmentStatus !== updated.employmentStatus) {
        await this.launch.recordEmploymentChange(
          old,
          { employmentStatus: updated.employmentStatus },
          actorId,
          'Employee archived',
          meta,
          tx,
        );
        await this.launch.flagErpAccessIfRequired(
          old,
          old.employmentStatus,
          updated.employmentStatus,
          actorId,
          meta,
          tx,
        );
      }
      return updated;
    });
  }

  async checkIn(userId: string, meta?: RequestMetadata) {
    const employee = await this.attendanceEmployeeForUser(userId);
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const activeAttendance = await tx.attendance.findFirst({
          where: {
            employeeId: employee.id,
            workSessions: { some: { endedAt: null } },
          },
          select: { id: true },
        });
        if (activeAttendance)
          throw new ConflictException('You are already checked in.');
        const attendance = await tx.attendance.upsert({
          where: {
            employeeId_date: {
              employeeId: employee.id,
              date: utcDay(now),
            },
          },
          create: {
            employeeId: employee.id,
            date: utcDay(now),
            checkInAt: now,
          },
          update: {},
          include: attendanceSessions,
        });
        if (attendance.workSessions.some(({ endedAt }) => endedAt === null)) {
          throw new ConflictException('You are already checked in.');
        }
        const workSession = await tx.attendanceWorkSession.create({
          data: { attendanceId: attendance.id, startedAt: now },
        });
        const updated = await tx.attendance.update({
          where: { id: attendance.id },
          data: {
            checkInAt: attendance.checkInAt ?? now,
            checkOutAt: null,
          },
          include: attendanceSessions,
        });
        await this.audit.log(
          {
            actorUserId: userId,
            entityType: 'Attendance',
            entityId: attendance.id,
            action: 'ATTENDANCE_CHECKED_IN',
            newValues: {
              employeeId: employee.id,
              workSessionId: workSession.id,
              startedAt: now,
            },
            requestMetadata: meta,
          },
          tx,
        );
        const policy = await this.policyForEmployee(employee, tx);
        return attendanceMetrics(updated, policy, now);
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.rethrowConflict(error, 'You are already checked in.');
    }
  }

  async checkOut(userId: string, meta?: RequestMetadata) {
    const employee = await this.attendanceEmployeeForUser(userId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findFirst({
        where: { employeeId: employee.id },
        orderBy: { date: 'desc' },
        include: attendanceSessions,
      });
      if (!attendance?.checkInAt)
        throw new BadRequestException('Check in before checking out.');
      const workSession = attendance.workSessions.find(
        ({ endedAt }) => endedAt === null,
      );
      if (!workSession)
        throw new ConflictException('You are already checked out.');
      const activeBreak = attendance.breaks.find(
        ({ endedAt }) => endedAt === null,
      );
      if (activeBreak) {
        await tx.attendanceBreak.update({
          where: { id: activeBreak.id },
          data: { endedAt: now },
        });
      }
      await tx.attendanceWorkSession.update({
        where: { id: workSession.id },
        data: { endedAt: now },
      });
      const updated = await tx.attendance.update({
        where: { id: attendance.id },
        data: { checkOutAt: now },
        include: attendanceSessions,
      });
      await this.audit.log(
        {
          actorUserId: userId,
          entityType: 'Attendance',
          entityId: updated.id,
          action: 'ATTENDANCE_CHECKED_OUT',
          newValues: {
            workSessionId: workSession.id,
            endedAt: now,
            closedBreakId: activeBreak?.id ?? null,
          },
          requestMetadata: meta,
        },
        tx,
      );
      const policy = await this.policyForEmployee(employee, tx);
      return attendanceMetrics(updated, policy, now);
    });
  }

  async startBreak(userId: string, meta?: RequestMetadata) {
    const employee = await this.attendanceEmployeeForUser(userId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findFirst({
        where: {
          employeeId: employee.id,
          workSessions: { some: { endedAt: null } },
        },
        orderBy: { date: 'desc' },
        include: attendanceSessions,
      });
      if (!attendance?.workSessions.some(({ endedAt }) => endedAt === null))
        throw new BadRequestException('Check in before taking a break.');
      if (attendance.breaks.some(({ endedAt }) => endedAt === null))
        throw new ConflictException('You are already on a break.');
      const policy = await this.policyForEmployee(employee, tx);
      const current = attendanceMetrics(attendance, policy, now);
      if (!current.canStartBreak)
        throw new ConflictException('Your daily break allowance is exhausted.');
      const breakSession = await tx.attendanceBreak.create({
        data: { attendanceId: attendance.id, startedAt: now },
      });
      const updated = await tx.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
        include: attendanceSessions,
      });
      await this.audit.log(
        {
          actorUserId: userId,
          entityType: 'Attendance',
          entityId: attendance.id,
          action: 'ATTENDANCE_BREAK_STARTED',
          newValues: { breakId: breakSession.id, startedAt: now },
          requestMetadata: meta,
        },
        tx,
      );
      return attendanceMetrics(updated, policy, now);
    });
  }

  async endBreak(userId: string, meta?: RequestMetadata) {
    const employee = await this.attendanceEmployeeForUser(userId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findFirst({
        where: {
          employeeId: employee.id,
          breaks: { some: { endedAt: null } },
        },
        orderBy: { date: 'desc' },
        include: attendanceSessions,
      });
      const activeBreak = attendance?.breaks.find(
        ({ endedAt }) => endedAt === null,
      );
      if (!attendance || !activeBreak)
        throw new BadRequestException('You are not currently on a break.');
      await tx.attendanceBreak.update({
        where: { id: activeBreak.id },
        data: { endedAt: now },
      });
      const updated = await tx.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
        include: attendanceSessions,
      });
      await this.audit.log(
        {
          actorUserId: userId,
          entityType: 'Attendance',
          entityId: attendance.id,
          action: 'ATTENDANCE_BREAK_ENDED',
          newValues: { breakId: activeBreak.id, endedAt: now },
          requestMetadata: meta,
        },
        tx,
      );
      const policy = await this.policyForEmployee(employee, tx);
      return attendanceMetrics(updated, policy, now);
    });
  }

  async attendanceStatus(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: { attendancePolicy: true },
    });
    if (!employee || employee.employmentStatus !== 'ACTIVE') {
      return { eligible: false };
    }
    const now = new Date();
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        OR: [
          { date: utcDay(now) },
          { workSessions: { some: { endedAt: null } } },
        ],
      },
      orderBy: { date: 'desc' },
      include: attendanceSessions,
    });
    if (!attendance) return { eligible: true, state: 'NOT_CHECKED_IN' };
    const policy = await this.policyForEmployee(employee);
    return { eligible: true, ...attendanceMetrics(attendance, policy, now) };
  }

  async myAttendance(userId: string) {
    const employee = await this.employeeForUser(userId);
    const [items, policy] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { employeeId: employee.id },
        include: attendanceSessions,
        orderBy: { date: 'desc' },
        take: 60,
      }),
      this.policyForEmployee(employee),
    ]);
    return items.map((item) => attendanceMetrics(item, policy));
  }

  async findAttendance(query: AttendanceQueryDto) {
    const [items, standardPolicy] = await Promise.all([
      this.prisma.attendance.findMany({
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
        include: {
          ...attendanceSessions,
          employee: {
            select: { ...employeeSummary, attendancePolicy: true },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      this.standardAttendancePolicy(),
    ]);
    return items.map((item) =>
      attendanceMetrics(
        item,
        item.employee.attendancePolicy?.isActive
          ? item.employee.attendancePolicy
          : standardPolicy,
      ),
    );
  }

  attendancePolicies() {
    return this.prisma.attendancePolicy.findMany({ orderBy: { name: 'asc' } });
  }

  async createAttendancePolicy(
    dto: CreateAttendancePolicyDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const data = validPolicy({
      ...dto,
      name: dto.name.trim().toUpperCase(),
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const policy = await tx.attendancePolicy.create({ data });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'AttendancePolicy',
            entityId: policy.id,
            action: 'ATTENDANCE_POLICY_CREATED',
            newValues: policy,
            requestMetadata: meta,
          },
          tx,
        );
        return policy;
      });
    } catch (error) {
      this.rethrowConflict(
        error,
        'An attendance policy with this name exists.',
      );
    }
  }

  async updateAttendancePolicy(
    id: string,
    dto: UpdateAttendancePolicyDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const old = await this.prisma.attendancePolicy.findUnique({
      where: { id },
    });
    if (!old) throw new NotFoundException('Attendance policy not found.');
    const data = validPolicy({
      name: dto.name?.trim().toUpperCase() ?? old.name,
      dailyBreakMinutes:
        dto.dailyBreakMinutes === undefined
          ? old.dailyBreakMinutes
          : dto.dailyBreakMinutes,
      maxBreakSessions:
        dto.maxBreakSessions === undefined
          ? old.maxBreakSessions
          : dto.maxBreakSessions,
      flexibleBreaks: dto.flexibleBreaks ?? old.flexibleBreaks,
      isActive: dto.isActive ?? old.isActive,
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const policy = await tx.attendancePolicy.update({
          where: { id },
          data,
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'AttendancePolicy',
            entityId: id,
            action: 'ATTENDANCE_POLICY_UPDATED',
            oldValues: old,
            newValues: policy,
            requestMetadata: meta,
          },
          tx,
        );
        return policy;
      });
    } catch (error) {
      this.rethrowConflict(
        error,
        'An attendance policy with this name exists.',
      );
    }
  }

  async assignAttendancePolicy(
    employeeId: string,
    attendancePolicyId: AssignAttendancePolicyDto['attendancePolicyId'],
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.requireEmployee(employeeId);
    if (attendancePolicyId) {
      const policy = await this.prisma.attendancePolicy.findUnique({
        where: { id: attendancePolicyId },
      });
      if (!policy?.isActive)
        throw new BadRequestException('Select an active attendance policy.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: { attendancePolicyId },
        select: employeeSummary,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'Employee',
          entityId: employeeId,
          action: 'ATTENDANCE_POLICY_ASSIGNED',
          oldValues: { attendancePolicyId: employee.attendancePolicyId },
          newValues: { attendancePolicyId },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
  }

  async updateAttendance(
    id: string,
    dto: UpdateAttendanceDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const old = await this.prisma.attendance.findUnique({
      where: { id },
      include: attendanceSessions,
    });
    if (!old) throw new NotFoundException('Attendance record not found.');
    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : old.checkInAt;
    const checkOutAt = dto.checkOutAt
      ? new Date(dto.checkOutAt)
      : old.checkOutAt;
    if (checkInAt && checkOutAt && checkOutAt < checkInAt)
      throw new BadRequestException('Check-out cannot be before check-in.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendance.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.checkInAt && { checkInAt: new Date(dto.checkInAt) }),
          ...(dto.checkOutAt && { checkOutAt: new Date(dto.checkOutAt) }),
        },
      });
      if (dto.checkInAt && old.workSessions[0]) {
        await tx.attendanceWorkSession.update({
          where: { id: old.workSessions[0].id },
          data: { startedAt: new Date(dto.checkInAt) },
        });
      }
      const lastWorkSession = old.workSessions.at(-1);
      if (dto.checkOutAt && lastWorkSession) {
        await tx.attendanceWorkSession.update({
          where: { id: lastWorkSession.id },
          data: { endedAt: new Date(dto.checkOutAt) },
        });
      }
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'Attendance',
          entityId: id,
          action: 'ATTENDANCE_CORRECTED',
          oldValues: {
            checkInAt: old.checkInAt,
            checkOutAt: old.checkOutAt,
            status: old.status,
            notes: old.notes,
          },
          newValues: {
            checkInAt: updated.checkInAt,
            checkOutAt: updated.checkOutAt,
            status: updated.status,
            notes: updated.notes,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
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
  async assignShift(
    dto: AssignShiftDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    await this.requireEmployee(dto.employeeId);
    return this.prisma.$transaction((tx) =>
      this.setEmployeeShift(
        dto.employeeId,
        dto.shiftId,
        dto.effectiveFrom,
        actorId,
        meta,
        tx,
        dto.effectiveTo,
      ),
    );
  }

  assignEmployeeShift(
    employeeId: string,
    dto: AssignEmployeeShiftDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    return this.assignShift({ employeeId, ...dto }, actorId, meta);
  }

  async createLeave(
    dto: CreateLeaveRequestDto,
    userId: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.employeeForUser(userId);
    const startDate = dateOnly(dto.startDate);
    const endDate = dateOnly(dto.endDate);
    if (endDate < startDate)
      throw new BadRequestException('End date must not be before start date.');
    if (startDate.getUTCFullYear() !== endDate.getUTCFullYear())
      throw new BadRequestException(
        'A leave request cannot span multiple leave years.',
      );
    return this.prisma.$transaction(
      async (tx) => {
        await this.launch.validateLeaveBalance(
          {
            employeeId: employee.id,
            leaveType: dto.leaveType,
            startDate,
            endDate,
          },
          tx,
        );
        const overlap = await tx.leaveRequest.findFirst({
          where: {
            employeeId: employee.id,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
          select: { id: true },
        });
        if (overlap)
          throw new ConflictException(
            'Leave dates overlap an existing pending or approved request.',
          );
        const leave = await tx.leaveRequest.create({
          data: { ...dto, employeeId: employee.id, startDate, endDate },
          include: { employee: { select: employeeSummary } },
        });
        await this.launch.setupLeaveApprovals(leave, tx);
        await this.audit.log(
          {
            actorUserId: userId,
            entityType: 'LeaveRequest',
            entityId: leave.id,
            action: 'LEAVE_REQUESTED',
            newValues: { leaveType: leave.leaveType, status: leave.status },
            requestMetadata: meta,
          },
          tx,
        );
        return tx.leaveRequest.findUniqueOrThrow({
          where: { id: leave.id },
          include: {
            employee: { select: employeeSummary },
            approvals: {
              include: {
                approver: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async myLeave(userId: string) {
    const employee = await this.employeeForUser(userId);
    return this.prisma.leaveRequest.findMany({
      where: { employeeId: employee.id },
      include: {
        employee: { select: employeeSummary },
        approvals: {
          include: {
            approver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  leaveRequests() {
    return this.prisma.leaveRequest.findMany({
      include: {
        employee: { select: employeeSummary },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        approvals: {
          include: {
            approver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
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
      include: { employee: true, approvals: true },
    });
    if (!leave) throw new NotFoundException('Leave request not found.');
    if (leave.status !== LeaveRequestStatus.PENDING)
      throw new ConflictException(
        'Only pending leave requests can be reviewed.',
      );
    if (leave.approvals.length > 0)
      throw new ConflictException(
        'Use the configured manager or HR approval step for this request.',
      );
    if (status === LeaveRequestStatus.REJECTED && !dto.notes?.trim())
      throw new BadRequestException('A rejection reason is required.');
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
    if (
      leave.status !== LeaveRequestStatus.PENDING &&
      leave.status !== LeaveRequestStatus.APPROVED
    )
      throw new ConflictException('This leave request cannot be cancelled.');
    if (
      leave.status === LeaveRequestStatus.APPROVED &&
      leave.startDate < utcDay(new Date())
    )
      throw new ConflictException(
        'Started or past approved leave cannot be cancelled.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      if (leave.status === LeaveRequestStatus.APPROVED) {
        const days = new Prisma.Decimal(
          Math.floor(
            (leave.endDate.getTime() - leave.startDate.getTime()) / 86400000,
          ) + 1,
        );
        await tx.leaveBalance.updateMany({
          where: {
            employeeId: leave.employeeId,
            leaveType: leave.leaveType,
            year: leave.startDate.getUTCFullYear(),
          },
          data: {
            used: { decrement: days },
            remainingBalance: { increment: days },
          },
        });
      }
      const cancelled = await tx.leaveRequest.update({
        where: { id },
        data: { status: LeaveRequestStatus.CANCELLED },
      });
      await this.audit.log(
        {
          actorUserId: userId,
          entityType: 'LeaveRequest',
          entityId: id,
          action: 'LEAVE_CANCELLED',
          newValues: {
            balanceRestored: leave.status === LeaveRequestStatus.APPROVED,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return cancelled;
    });
    return updated;
  }

  employeeDocuments(employeeId: string) {
    return this.requireEmployee(employeeId).then(() =>
      this.prisma.employeeDocument.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        take: 100,
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
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.employeeDocument.create({
        data: {
          fileName: dto.fileName,
          fileType: dto.fileType,
          storageKey: dto.storageKey,
          category: dto.category,
          visibility: dto.visibility,
          ...(dto.expiryDate && { expiryDate: dateOnly(dto.expiryDate) }),
          employeeId,
          uploadedById: actorId,
        },
      });
      await tx.employeeDocumentVersion.create({
        data: {
          employeeDocumentId: document.id,
          version: 1,
          fileName: dto.fileName,
          storageKey: dto.storageKey,
          uploadedById: actorId,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmployeeDocumentVersion',
          entityId: document.id,
          action: 'EMPLOYEE_DOCUMENT_VERSION_CREATED',
          newValues: { employeeDocumentId: document.id, version: 1 },
          requestMetadata: meta,
        },
        tx,
      );
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmployeeDocument',
          entityId: document.id,
          action: 'EMPLOYEE_DOCUMENT_ADDED',
          newValues: {
            employeeId,
            fileName: dto.fileName,
            category: dto.category,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return document;
    });
  }

  async updateProcess(
    id: string,
    kind: 'onboarding' | 'offboarding',
    dto: UpdateProcessDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    if (dto.status === 'COMPLETED')
      throw new ConflictException(
        `Use the controlled ${kind} workflow to complete this process.`,
      );
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

  private assertOrganizationLevelAllowed(
    level: string | undefined,
    actor: AuthenticatedUser,
  ) {
    if (
      level === 'OWNER' &&
      !actor.permissions.includes('organization.owner.manage')
    )
      throw new ForbiddenException('Owner organization level is restricted.');
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
  private async attendanceEmployeeForUser(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee)
      throw new NotFoundException(
        'Your user account is not linked to an employee record.',
      );
    if (employee.employmentStatus !== 'ACTIVE')
      throw new ForbiddenException(
        'Attendance is limited to active employees.',
      );
    return employee;
  }
  private async policyForEmployee(
    employee: { attendancePolicyId: string | null },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<AttendancePolicyRules> {
    if (employee.attendancePolicyId) {
      const assigned = await client.attendancePolicy.findUnique({
        where: { id: employee.attendancePolicyId },
      });
      if (assigned?.isActive) return assigned;
    }
    return this.standardAttendancePolicy(client);
  }
  private async standardAttendancePolicy(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<AttendancePolicyRules> {
    return (
      (await client.attendancePolicy.findUnique({
        where: { name: 'STANDARD' },
      })) ?? STANDARD_ATTENDANCE_POLICY
    );
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

  private async requireActiveShift(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const shift = await client.shift.findFirst({
      where: { id, isActive: true },
    });
    if (!shift) throw new BadRequestException('Active shift was not found.');
    return shift;
  }

  private async setEmployeeShift(
    employeeId: string,
    shiftId: string,
    effectiveFrom: string,
    actorId: string,
    meta: RequestMetadata | undefined,
    tx: Prisma.TransactionClient,
    effectiveTo?: string,
  ) {
    const shift = await this.requireActiveShift(shiftId, tx);
    const current = await tx.employeeShift.findFirst({
      where: { employeeId, effectiveTo: null },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (current?.shiftId === shiftId) return current;
    await tx.employeeShift.updateMany({
      where: { employeeId, effectiveTo: null },
      data: { effectiveTo: dateOnly(effectiveFrom) },
    });
    const assignment = await tx.employeeShift.create({
      data: {
        employeeId,
        shiftId,
        effectiveFrom: dateOnly(effectiveFrom),
        ...(effectiveTo && { effectiveTo: dateOnly(effectiveTo) }),
      },
      include: { employee: { select: employeeSummary }, shift: true },
    });
    await this.audit.log(
      {
        actorUserId: actorId,
        entityType: 'Employee',
        entityId: employeeId,
        action: 'EMPLOYEE_SHIFT_CHANGED',
        oldValues: current
          ? { shiftId: current.shiftId, shiftName: current.shift.name }
          : { shiftId: null, shiftName: null },
        newValues: { shiftId: shift.id, shiftName: shift.name },
        requestMetadata: meta,
      },
      tx,
    );
    return assignment;
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

type AttendanceWithSessions = {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workSessions: Array<{ startedAt: Date; endedAt: Date | null }>;
  breaks: Array<{ startedAt: Date; endedAt: Date | null }>;
};

function attendanceMetrics<T extends AttendanceWithSessions>(
  attendance: T,
  policy: AttendancePolicyRules,
  now = new Date(),
) {
  const activeWorkSession = attendance.workSessions.find(
    ({ endedAt }) => endedAt === null,
  );
  const activeBreak = attendance.breaks.find(({ endedAt }) => endedAt === null);
  const duration = (startedAt: Date, endedAt: Date | null) =>
    Math.max(0, (endedAt ?? now).getTime() - startedAt.getTime());
  const workMilliseconds = attendance.workSessions.reduce(
    (total, session) => total + duration(session.startedAt, session.endedAt),
    0,
  );
  const breakMilliseconds = attendance.breaks.reduce(
    (total, session) => total + duration(session.startedAt, session.endedAt),
    0,
  );
  const breakSeconds = Math.floor(breakMilliseconds / 1000);
  const allowanceSeconds = policy.flexibleBreaks
    ? null
    : (policy.dailyBreakMinutes ?? 60) * 60;
  const remainingBreakSeconds =
    allowanceSeconds === null
      ? null
      : Math.max(0, allowanceSeconds - breakSeconds);
  const sessionLimitReached =
    !policy.flexibleBreaks &&
    policy.maxBreakSessions !== null &&
    attendance.breaks.length >= policy.maxBreakSessions;
  return {
    ...attendance,
    state: activeBreak
      ? 'ON_BREAK'
      : activeWorkSession
        ? 'WORKING'
        : attendance.checkOutAt
          ? 'CHECKED_OUT'
          : 'NOT_CHECKED_IN',
    activeSince: activeBreak?.startedAt ?? activeWorkSession?.startedAt ?? null,
    workedSeconds: Math.floor(
      Math.max(0, workMilliseconds - breakMilliseconds) / 1000,
    ),
    breakSeconds,
    remainingBreakSeconds,
    excessBreakSeconds:
      allowanceSeconds === null
        ? null
        : Math.max(0, breakSeconds - allowanceSeconds),
    breakSessionsUsed: attendance.breaks.length,
    maxBreakSessions: policy.flexibleBreaks ? null : policy.maxBreakSessions,
    dailyBreakMinutes: policy.flexibleBreaks ? null : policy.dailyBreakMinutes,
    flexibleBreaks: policy.flexibleBreaks,
    canStartBreak:
      Boolean(activeWorkSession) &&
      !activeBreak &&
      !sessionLimitReached &&
      (remainingBreakSeconds === null || remainingBreakSeconds > 0),
  };
}

function validPolicy<
  T extends {
    name: string;
    dailyBreakMinutes?: number | null;
    maxBreakSessions?: number | null;
    flexibleBreaks: boolean;
    isActive?: boolean;
  },
>(policy: T) {
  if (
    !policy.flexibleBreaks &&
    (policy.dailyBreakMinutes == null || policy.maxBreakSessions == null)
  ) {
    throw new BadRequestException(
      'Standard policies require daily break minutes and a session limit.',
    );
  }
  return {
    ...policy,
    dailyBreakMinutes: policy.flexibleBreaks ? null : policy.dailyBreakMinutes,
    maxBreakSessions: policy.flexibleBreaks ? null : policy.maxBreakSessions,
  };
}
function publicEmployee(value: {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
  jobTitle: string;
  organizationLevel: string;
}) {
  return {
    employeeNumber: value.employeeNumber,
    firstName: value.firstName,
    lastName: value.lastName,
    employmentStatus: value.employmentStatus,
    jobTitle: value.jobTitle,
    organizationLevel: value.organizationLevel,
  };
}
