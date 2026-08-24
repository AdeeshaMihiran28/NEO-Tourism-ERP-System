import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessReviewStatus,
  AccessReviewTriggerType,
  EmploymentChangeType,
  EmployeeDocumentVisibility,
  EmploymentStatus,
  HrTaskCategory,
  HrTaskStatus,
  LeaveApprovalLevel,
  LeaveApprovalStatus,
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
  AcknowledgeDocumentDto,
  AccrueLeaveDto,
  ApprovalCommentDto,
  AssignLeavePolicyDto,
  AttendanceReportQueryDto,
  CreateCustomFieldDto,
  CreateDocumentVersionDto,
  CreateLeavePolicyDto,
  CreateTaskTemplateDto,
  DirectoryQueryDto,
  ExpiringDocumentsQueryDto,
  HrReportQueryDto,
  ImportEmployeesDto,
  LeaveBalanceQueryDto,
  LeaveCalendarQueryDto,
  ReviewAccessDto,
  SetCustomFieldValueDto,
  StartProcessDto,
  UpdateCustomFieldDto,
  UpdateDocumentAccessDto,
  UpdateHrTaskDto,
  UpdateMyProfileDto,
  UpsertLeaveApprovalPolicyDto,
  UpsertExitInterviewDto,
  UpsertRoleMappingDto,
} from './dto/hr-launch.dto';

const basicEmployee = {
  id: true,
  userId: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  workEmail: true,
  workPhone: true,
  phone: true,
  jobTitle: true,
  employmentType: true,
  employmentStatus: true,
  joinDate: true,
  endDate: true,
  departmentId: true,
  managerId: true,
  department: { select: { id: true, name: true } },
  manager: {
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class HrLaunchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async validateManager(employeeId: string | undefined, managerId?: string) {
    if (!managerId) return;
    if (employeeId === managerId)
      throw new BadRequestException('An employee cannot manage themselves.');
    let cursor: string | null = managerId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === employeeId)
        throw new BadRequestException(
          'Manager assignment would create a circular hierarchy.',
        );
      if (visited.has(cursor))
        throw new ConflictException(
          'The existing manager hierarchy is cyclic.',
        );
      visited.add(cursor);
      const manager: { managerId: string | null } | null =
        await this.prisma.employee.findUnique({
          where: { id: cursor },
          select: { managerId: true },
        });
      if (!manager) throw new BadRequestException('Manager was not found.');
      cursor = manager.managerId;
    }
  }

  async recordInitialHistory(
    employee: {
      id: string;
      jobTitle: string;
      departmentId: string;
      managerId: string | null;
      employmentType: Prisma.EmployeeCreateInput['employmentType'];
      employmentStatus: Prisma.EmployeeCreateInput['employmentStatus'];
      joinDate: Date;
    },
    actorId: string,
    client: Prisma.TransactionClient,
  ) {
    await client.employmentHistory.create({
      data: {
        employeeId: employee.id,
        jobTitle: employee.jobTitle,
        departmentId: employee.departmentId,
        managerId: employee.managerId,
        employmentType: employee.employmentType,
        employmentStatus: employee.employmentStatus ?? EmploymentStatus.ACTIVE,
        effectiveFrom: employee.joinDate,
        changeType: EmploymentChangeType.HIRED,
        changedById: actorId,
      },
    });
  }

  async recordEmploymentChange(
    old: {
      id: string;
      userId: string | null;
      jobTitle: string;
      departmentId: string;
      managerId: string | null;
      employmentType: string;
      employmentStatus: string;
      joinDate: Date;
    },
    next: {
      jobTitle?: string;
      departmentId?: string;
      managerId?: string | null;
      employmentType?: string;
      employmentStatus?: string;
    },
    actorId: string,
    reason: string | undefined,
    meta?: RequestMetadata,
  ) {
    const changes = {
      jobTitle: next.jobTitle !== undefined && next.jobTitle !== old.jobTitle,
      department:
        next.departmentId !== undefined &&
        next.departmentId !== old.departmentId,
      manager: next.managerId !== undefined && next.managerId !== old.managerId,
      employmentType:
        next.employmentType !== undefined &&
        next.employmentType !== old.employmentType,
      status:
        next.employmentStatus !== undefined &&
        next.employmentStatus !== old.employmentStatus,
    };
    if (!Object.values(changes).some(Boolean)) return;

    const changeType = changes.department
      ? EmploymentChangeType.DEPARTMENT_CHANGE
      : changes.manager
        ? EmploymentChangeType.MANAGER_CHANGE
        : changes.jobTitle
          ? EmploymentChangeType.JOB_TITLE_CHANGE
          : changes.employmentType
            ? EmploymentChangeType.EMPLOYMENT_TYPE_CHANGE
            : EmploymentChangeType.STATUS_CHANGE;
    const triggerType = changes.department
      ? AccessReviewTriggerType.DEPARTMENT_CHANGE
      : changes.manager
        ? AccessReviewTriggerType.MANAGER_CHANGE
        : changes.jobTitle
          ? AccessReviewTriggerType.JOB_TITLE_CHANGE
          : AccessReviewTriggerType.STATUS_CHANGE;

    await this.prisma.$transaction(async (tx) => {
      const history = await tx.employmentHistory.create({
        data: {
          employeeId: old.id,
          jobTitle: old.jobTitle,
          departmentId: old.departmentId,
          managerId: old.managerId,
          employmentType: old.employmentType as never,
          employmentStatus: old.employmentStatus as never,
          effectiveFrom: old.joinDate,
          effectiveTo: utcDay(new Date()),
          changeType,
          reason,
          changedById: actorId,
        },
      });
      const oldRoles = old.userId
        ? await tx.userRole.findMany({
            where: { userId: old.userId },
            select: { roleId: true },
          })
        : [];
      const newDepartmentId = next.departmentId ?? old.departmentId;
      const mappings = await tx.departmentRoleMapping.findMany({
        where: { departmentId: newDepartmentId, isActive: true },
        select: { roleId: true },
      });
      const review = await tx.employeeAccessReview.create({
        data: {
          employeeId: old.id,
          userId: old.userId,
          triggerType,
          oldDepartmentId: old.departmentId,
          newDepartmentId,
          oldRoles: oldRoles.map(({ roleId }) => roleId),
          recommendedRoles: mappings.map(({ roleId }) => roleId),
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmploymentHistory',
          entityId: history.id,
          action: 'EMPLOYMENT_HISTORY_CREATED',
          newValues: { employeeId: old.id, changeType },
          requestMetadata: meta,
        },
        tx,
      );
      if (
        changeType === EmploymentChangeType.MANAGER_CHANGE ||
        changeType === EmploymentChangeType.DEPARTMENT_CHANGE ||
        changeType === EmploymentChangeType.JOB_TITLE_CHANGE
      ) {
        const action =
          changeType === EmploymentChangeType.MANAGER_CHANGE
            ? 'EMPLOYEE_MANAGER_CHANGED'
            : changeType === EmploymentChangeType.DEPARTMENT_CHANGE
              ? 'EMPLOYEE_DEPARTMENT_CHANGED'
              : 'EMPLOYEE_JOB_TITLE_CHANGED';
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'Employee',
            entityId: old.id,
            action,
            newValues: { changeType },
            requestMetadata: meta,
          },
          tx,
        );
      }
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmployeeAccessReview',
          entityId: review.id,
          action: 'EMPLOYEE_ACCESS_REVIEW_CREATED',
          newValues: { employeeId: old.id, triggerType },
          requestMetadata: meta,
        },
        tx,
      );
      const reviewers = await this.userIdsWithPermission(
        'hr.access_review.manage',
        tx,
      );
      await Promise.all(
        reviewers.map((userId) =>
          this.notifications.create(
            {
              userId,
              type: NotificationType.ACCESS_REVIEW_REQUIRED,
              title: 'Employee access review required',
              message: 'An employment change requires an ERP access review.',
              entityType: 'EmployeeAccessReview',
              entityId: review.id,
            },
            tx,
          ),
        ),
      );
    });
  }

  employmentHistory(employeeId: string) {
    return this.prisma.employmentHistory.findMany({
      where: { employeeId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async orgChart() {
    const employees = await this.prisma.employee.findMany({
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        workPhone: true,
        jobTitle: true,
        employmentStatus: true,
        managerId: true,
        department: { select: { id: true, name: true } },
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    type Node = (typeof employees)[number] & { reports: Node[] };
    const nodes = new Map<string, Node>(
      employees.map((employee) => [employee.id, { ...employee, reports: [] }]),
    );
    const roots: Node[] = [];
    for (const node of nodes.values()) {
      const parent = node.managerId ? nodes.get(node.managerId) : undefined;
      if (parent) parent.reports.push(node);
      else roots.push(node);
    }
    return roots;
  }

  directory(query: DirectoryQueryDto) {
    return this.prisma.employee.findMany({
      where: {
        employmentStatus: { not: EmploymentStatus.TERMINATED },
        ...(query.departmentId && { departmentId: query.departmentId }),
        ...(query.search && {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { jobTitle: { contains: query.search, mode: 'insensitive' } },
            { workEmail: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        workPhone: true,
        jobTitle: true,
        employmentStatus: true,
        department: { select: { id: true, name: true } },
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 200,
    });
  }

  customFields() {
    return this.prisma.employeeCustomFieldDefinition.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCustomField(
    dto: CreateCustomFieldDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const definition = await this.prisma.employeeCustomFieldDefinition.create({
      data: {
        name: dto.name,
        code: dto.code.trim().toLowerCase(),
        fieldType: dto.fieldType,
        isRequired: dto.isRequired,
        selectOptions: dto.selectOptions,
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'EmployeeCustomFieldDefinition',
      entityId: definition.id,
      action: 'CUSTOM_HR_FIELD_CREATED',
      newValues: { code: definition.code, fieldType: definition.fieldType },
      requestMetadata: meta,
    });
    return definition;
  }

  async updateCustomField(
    id: string,
    dto: UpdateCustomFieldDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const updated = await this.prisma.employeeCustomFieldDefinition
      .update({ where: { id }, data: dto })
      .catch(() => {
        throw new NotFoundException('Custom field not found.');
      });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'EmployeeCustomFieldDefinition',
      entityId: id,
      action: 'CUSTOM_HR_FIELD_UPDATED',
      newValues: { isActive: updated.isActive, isRequired: updated.isRequired },
      requestMetadata: meta,
    });
    return updated;
  }

  async setCustomFieldValue(
    employeeId: string,
    definitionId: string,
    dto: SetCustomFieldValueDto,
  ) {
    const definition =
      await this.prisma.employeeCustomFieldDefinition.findUnique({
        where: { id: definitionId },
      });
    if (!definition?.isActive)
      throw new BadRequestException('Custom field is unavailable.');
    return this.prisma.employeeCustomFieldValue.upsert({
      where: { employeeId_definitionId: { employeeId, definitionId } },
      create: {
        employeeId,
        definitionId,
        value: dto.value as Prisma.InputJsonValue,
      },
      update: { value: dto.value as Prisma.InputJsonValue },
    });
  }

  async importEmployees(
    dto: ImportEmployeesDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const rows = parseCsv(dto.csv);
    if (!rows.length)
      throw new BadRequestException('CSV contains no data rows.');
    const departments = await this.prisma.department.findMany();
    const departmentByName = new Map(
      departments.map((department) => [
        department.name.toLowerCase(),
        department,
      ]),
    );
    const employees = await this.prisma.employee.findMany({
      select: { id: true, employeeNumber: true, workEmail: true },
    });
    const numberSet = new Set(
      employees.map((employee) => employee.employeeNumber),
    );
    const emailSet = new Set(
      employees.flatMap((employee) =>
        employee.workEmail ? [employee.workEmail.toLowerCase()] : [],
      ),
    );
    const batchNumbers = new Set<string>();
    const batchEmails = new Set<string>();
    const errors: Array<{ row: number; errors: string[] }> = [];
    const prepared: Array<Record<string, unknown>> = [];
    rows.forEach((row, index) => {
      const rowErrors: string[] = [];
      const department = departmentByName.get(
        (row.department ?? '').toLowerCase(),
      );
      if (!row.firstName || !row.lastName || !row.jobTitle || !row.joinDate)
        rowErrors.push(
          'firstName, lastName, jobTitle and joinDate are required',
        );
      if (!department) rowErrors.push('department is invalid');
      if (row.workEmail && !/^\S+@\S+\.\S+$/.test(row.workEmail))
        rowErrors.push('workEmail is invalid');
      if (row.personalEmail && !/^\S+@\S+\.\S+$/.test(row.personalEmail))
        rowErrors.push('personalEmail is invalid');
      if (
        !['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'].includes(
          row.employmentType ?? '',
        )
      )
        rowErrors.push('employmentType is invalid');
      if (
        ![
          'ACTIVE',
          'ON_LEAVE',
          'NOTICE_PERIOD',
          'TERMINATED',
          'INACTIVE',
        ].includes(row.employmentStatus ?? '')
      )
        rowErrors.push('employmentStatus is invalid');
      if (
        row.employeeNumber &&
        (numberSet.has(row.employeeNumber) ||
          batchNumbers.has(row.employeeNumber))
      )
        rowErrors.push('employeeNumber is duplicated');
      if (
        row.workEmail &&
        (emailSet.has(row.workEmail.toLowerCase()) ||
          batchEmails.has(row.workEmail.toLowerCase()))
      )
        rowErrors.push('workEmail is duplicated');
      const manager = row.manager
        ? employees.find((employee) => employee.employeeNumber === row.manager)
        : undefined;
      if (row.manager && !manager)
        rowErrors.push('manager employee number is invalid');
      if (rowErrors.length) errors.push({ row: index + 2, errors: rowErrors });
      else {
        if (row.employeeNumber) batchNumbers.add(row.employeeNumber);
        if (row.workEmail) batchEmails.add(row.workEmail.toLowerCase());
        prepared.push({
          ...row,
          departmentId: department!.id,
          managerId: manager?.id,
        });
      }
    });
    if (errors.length)
      return {
        totalRows: rows.length,
        successful: 0,
        failed: errors.length,
        warnings: [
          'No records imported because one or more rows failed validation.',
        ],
        errors,
      };

    await this.prisma.$transaction(async (tx) => {
      for (const row of prepared) {
        let employeeNumber = row.employeeNumber as string | undefined;
        if (!employeeNumber) {
          const counter = await tx.employeeCounter.upsert({
            where: { id: 1 },
            create: { id: 1, nextNumber: 2 },
            update: { nextNumber: { increment: 1 } },
          });
          employeeNumber = `NEO-EMP-${(counter.nextNumber - 1).toString().padStart(4, '0')}`;
        }
        const employee = await tx.employee.create({
          data: {
            employeeNumber,
            firstName: row.firstName as string,
            lastName: row.lastName as string,
            workEmail: (row.workEmail as string) || null,
            personalEmail: (row.personalEmail as string) || null,
            workPhone: (row.phone as string) || null,
            jobTitle: row.jobTitle as string,
            departmentId: row.departmentId as string,
            managerId: (row.managerId as string) || null,
            employmentType: row.employmentType as never,
            employmentStatus: row.employmentStatus as never,
            joinDate: dateOnly(row.joinDate as string),
          },
        });
        await this.recordInitialHistory(employee, actorId, tx);
      }
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmployeeImport',
          entityId: actorId,
          action: 'EMPLOYEE_IMPORT_COMPLETED',
          newValues: { totalRows: rows.length, successful: rows.length },
          requestMetadata: meta,
        },
        tx,
      );
    });
    return {
      totalRows: rows.length,
      successful: rows.length,
      failed: 0,
      warnings: [],
      errors: [],
    };
  }

  async exportEmployees(actorId: string, meta?: RequestMetadata) {
    const employees = await this.prisma.employee.findMany({
      select: basicEmployee,
      orderBy: { employeeNumber: 'asc' },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'EmployeeExport',
      entityId: actorId,
      action: 'EMPLOYEE_EXPORT_CREATED',
      newValues: { rowCount: employees.length },
      requestMetadata: meta,
    });
    return toCsv(
      [
        'employeeNumber',
        'firstName',
        'lastName',
        'workEmail',
        'phone',
        'jobTitle',
        'department',
        'manager',
        'employmentType',
        'employmentStatus',
        'joinDate',
      ],
      employees.map((employee) => [
        employee.employeeNumber,
        employee.firstName,
        employee.lastName,
        employee.workEmail ?? '',
        employee.workPhone ?? '',
        employee.jobTitle,
        employee.department.name,
        employee.manager?.employeeNumber ?? '',
        employee.employmentType,
        employee.employmentStatus,
        employee.joinDate.toISOString().slice(0, 10),
      ]),
    );
  }

  async createLeavePolicy(
    dto: CreateLeavePolicyDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const policy = await this.prisma.leavePolicy.create({ data: dto });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'LeavePolicy',
      entityId: policy.id,
      action: 'LEAVE_POLICY_UPDATED',
      newValues: { leaveType: policy.leaveType, isActive: policy.isActive },
      requestMetadata: meta,
    });
    return policy;
  }

  async initializeLeaveBalances(
    employeeId: string,
    effectiveFrom: Date,
    client: Prisma.TransactionClient,
  ) {
    const policies = await client.leavePolicy.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Set<string>();
    for (const policy of policies) {
      if (seen.has(policy.leaveType)) continue;
      seen.add(policy.leaveType);
      await client.employeeLeavePolicy.create({
        data: { employeeId, leavePolicyId: policy.id, effectiveFrom },
      });
      await client.leaveBalance.create({
        data: {
          employeeId,
          leaveType: policy.leaveType,
          year: effectiveFrom.getUTCFullYear(),
          openingBalance: policy.annualEntitlement,
          remainingBalance: policy.annualEntitlement,
        },
      });
    }
  }

  leavePolicies() {
    return this.prisma.leavePolicy.findMany({
      orderBy: [{ leaveType: 'asc' }, { name: 'asc' }],
    });
  }

  upsertLeaveApprovalPolicy(dto: UpsertLeaveApprovalPolicyDto) {
    return this.prisma.leaveApprovalPolicy.upsert({
      where: { leaveType: dto.leaveType },
      create: dto,
      update: dto,
    });
  }

  leaveApprovalPolicies() {
    return this.prisma.leaveApprovalPolicy.findMany({
      orderBy: { leaveType: 'asc' },
    });
  }

  async accrueLeave(
    dto: AccrueLeaveDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const assignments = await this.prisma.employeeLeavePolicy.findMany({
      where: {
        effectiveFrom: { lte: new Date(Date.UTC(dto.year, dto.month, 0)) },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date(Date.UTC(dto.year, 0, 1)) } },
        ],
        leavePolicy: { isActive: true },
      },
      include: { leavePolicy: true },
    });
    let updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const assignment of assignments) {
        const policy = assignment.leavePolicy;
        const accrued =
          policy.accrualMethod === 'MONTHLY'
            ? policy.accrualAmount.mul(dto.month)
            : new Prisma.Decimal(0);
        const opening =
          policy.accrualMethod === 'ANNUAL'
            ? policy.annualEntitlement
            : new Prisma.Decimal(0);
        const balance = await tx.leaveBalance.upsert({
          where: {
            employeeId_leaveType_year: {
              employeeId: assignment.employeeId,
              leaveType: policy.leaveType,
              year: dto.year,
            },
          },
          create: {
            employeeId: assignment.employeeId,
            leaveType: policy.leaveType,
            year: dto.year,
            openingBalance: opening,
            accrued,
            remainingBalance: opening.add(accrued),
          },
          update: { openingBalance: opening, accrued },
        });
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            remainingBalance: opening
              .add(accrued)
              .add(balance.adjusted)
              .sub(balance.used),
          },
        });
        updated += 1;
      }
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'LeaveBalance',
          entityId: `${dto.year}-${dto.month}`,
          action: 'LEAVE_BALANCE_UPDATED',
          newValues: { year: dto.year, month: dto.month, updated },
          requestMetadata: meta,
        },
        tx,
      );
    });
    return { year: dto.year, month: dto.month, updated };
  }

  async assignLeavePolicy(dto: AssignLeavePolicyDto) {
    const policy = await this.prisma.leavePolicy.findUnique({
      where: { id: dto.leavePolicyId },
    });
    if (!policy) throw new NotFoundException('Leave policy not found.');
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.employeeLeavePolicy.create({
        data: {
          employeeId: dto.employeeId,
          leavePolicyId: dto.leavePolicyId,
          effectiveFrom: dateOnly(dto.effectiveFrom),
          ...(dto.effectiveTo && { effectiveTo: dateOnly(dto.effectiveTo) }),
        },
      });
      await tx.leaveBalance.upsert({
        where: {
          employeeId_leaveType_year: {
            employeeId: dto.employeeId,
            leaveType: policy.leaveType,
            year: dateOnly(dto.effectiveFrom).getUTCFullYear(),
          },
        },
        create: {
          employeeId: dto.employeeId,
          leaveType: policy.leaveType,
          year: dateOnly(dto.effectiveFrom).getUTCFullYear(),
          openingBalance: policy.annualEntitlement,
          accrued: 0,
          remainingBalance: policy.annualEntitlement,
        },
        update: {},
      });
      return assignment;
    });
  }

  async setupLeaveApprovals(
    leave: { id: string; employeeId: string; leaveType: string },
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const today = utcDay(new Date());
    const assignment = await client.employeeLeavePolicy.findFirst({
      where: {
        employeeId: leave.employeeId,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        leavePolicy: {
          leaveType: leave.leaveType as never,
          isActive: true,
        },
      },
      select: { id: true },
    });
    if (!assignment) return;
    const policy = await client.leaveApprovalPolicy.findUnique({
      where: { leaveType: leave.leaveType as never },
    });
    if (!policy?.isActive) return;
    const employee = await client.employee.findUnique({
      where: { id: leave.employeeId },
      select: { manager: { select: { userId: true } } },
    });
    if (policy.requiresManagerApproval && employee?.manager?.userId) {
      await client.leaveApproval.create({
        data: {
          leaveRequestId: leave.id,
          approvalLevel: LeaveApprovalLevel.MANAGER,
          approverUserId: employee.manager.userId,
        },
      });
      await this.notifications.create(
        {
          userId: employee.manager.userId,
          type: NotificationType.LEAVE_APPROVAL_REQUIRED,
          title: 'Manager leave approval required',
          message: 'A direct report submitted a leave request.',
          entityType: 'LeaveRequest',
          entityId: leave.id,
        },
        client,
      );
    }
    if (policy.requiresHrApproval) {
      await client.leaveApproval.create({
        data: {
          leaveRequestId: leave.id,
          approvalLevel: LeaveApprovalLevel.HR,
        },
      });
      const reviewers = await this.userIdsWithPermission(
        'hr.leave.hr_approve',
        client,
      );
      await Promise.all(
        reviewers.map((userId) =>
          this.notifications.create(
            {
              userId,
              type: NotificationType.LEAVE_APPROVAL_REQUIRED,
              title: 'HR leave approval required',
              message: 'A leave request requires HR review.',
              entityType: 'LeaveRequest',
              entityId: leave.id,
            },
            client,
          ),
        ),
      );
    }
  }

  async approveLeaveLevel(
    id: string,
    level: LeaveApprovalLevel,
    dto: ApprovalCommentDto,
    actor: AuthenticatedUser,
    meta?: RequestMetadata,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, approvals: true },
    });
    if (!leave) throw new NotFoundException('Leave request not found.');
    if (leave.status !== LeaveRequestStatus.PENDING)
      throw new ConflictException('Leave request is no longer pending.');
    if (
      level === LeaveApprovalLevel.HR &&
      leave.approvals.some(
        (item) =>
          item.approvalLevel === LeaveApprovalLevel.MANAGER &&
          item.status !== LeaveApprovalStatus.APPROVED,
      )
    )
      throw new ConflictException(
        'Manager approval must be completed before HR approval.',
      );
    if (level === LeaveApprovalLevel.MANAGER) {
      const manager = leave.employee.managerId
        ? await this.prisma.employee.findUnique({
            where: { id: leave.employee.managerId },
          })
        : null;
      if (!manager?.userId || manager.userId !== actor.id)
        throw new ForbiddenException(
          'Only the employee’s direct manager may approve this step.',
        );
    }
    const approval = leave.approvals.find(
      (item) => item.approvalLevel === level,
    );
    if (!approval)
      throw new ConflictException('This approval level is not required.');
    if (approval.status !== LeaveApprovalStatus.PENDING)
      throw new ConflictException('This approval step was already reviewed.');

    return this.prisma.$transaction(async (tx) => {
      await tx.leaveApproval.update({
        where: { id: approval.id },
        data: {
          approverUserId: actor.id,
          status: LeaveApprovalStatus.APPROVED,
          comment: dto.comment,
          reviewedAt: new Date(),
        },
      });
      const remaining = await tx.leaveApproval.count({
        where: {
          leaveRequestId: id,
          status: LeaveApprovalStatus.PENDING,
          id: { not: approval.id },
        },
      });
      if (remaining === 0) {
        await this.deductLeaveBalance(leave, tx);
        await tx.leaveRequest.update({
          where: { id },
          data: {
            status: LeaveRequestStatus.APPROVED,
            reviewedById: actor.id,
            reviewedAt: new Date(),
          },
        });
        await this.audit.log(
          {
            actorUserId: actor.id,
            entityType: 'LeaveBalance',
            entityId: leave.employeeId,
            action: 'LEAVE_BALANCE_UPDATED',
            newValues: {
              leaveRequestId: id,
              leaveType: leave.leaveType,
            },
            requestMetadata: meta,
          },
          tx,
        );
      }
      await this.audit.log(
        {
          actorUserId: actor.id,
          entityType: 'LeaveRequest',
          entityId: id,
          action:
            level === LeaveApprovalLevel.MANAGER
              ? 'LEAVE_MANAGER_APPROVED'
              : 'LEAVE_HR_APPROVED',
          newValues: { level, finalApproval: remaining === 0 },
          requestMetadata: meta,
        },
        tx,
      );
      return tx.leaveRequest.findUniqueOrThrow({
        where: { id },
        include: { approvals: true },
      });
    });
  }

  async deductLeaveBalance(
    leave: {
      employeeId: string;
      leaveType: string;
      startDate: Date;
      endDate: Date;
    },
    tx: Prisma.TransactionClient,
  ) {
    const days = new Prisma.Decimal(
      Math.floor(
        (leave.endDate.getTime() - leave.startDate.getTime()) / 86400000,
      ) + 1,
    );
    const year = leave.startDate.getUTCFullYear();
    const balance = await tx.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId: leave.employeeId,
          leaveType: leave.leaveType as never,
          year,
        },
      },
    });
    const assignment = await tx.employeeLeavePolicy.findFirst({
      where: {
        employeeId: leave.employeeId,
        leavePolicy: { leaveType: leave.leaveType as never, isActive: true },
        effectiveFrom: { lte: leave.startDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: leave.startDate } }],
      },
      include: { leavePolicy: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!balance || !assignment)
      throw new ConflictException(
        'No active leave balance/policy exists for this request.',
      );
    if (
      !assignment.leavePolicy.allowNegativeBalance &&
      balance.remainingBalance.lessThan(days)
    )
      throw new ConflictException('Insufficient leave balance.');
    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        used: { increment: days },
        remainingBalance: { decrement: days },
      },
    });
  }

  myBalances(userId: string) {
    return this.employeeForUser(userId).then((employee) =>
      this.prisma.leaveBalance.findMany({
        where: { employeeId: employee.id },
        orderBy: [{ year: 'desc' }, { leaveType: 'asc' }],
      }),
    );
  }

  async managerLeaveRequests(userId: string) {
    const manager = await this.employeeForUser(userId);
    return this.prisma.leaveRequest.findMany({
      where: {
        employee: { managerId: manager.id },
        approvals: {
          some: {
            approvalLevel: LeaveApprovalLevel.MANAGER,
            status: LeaveApprovalStatus.PENDING,
          },
        },
      },
      include: { employee: { select: basicEmployee }, approvals: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  balances(query: LeaveBalanceQueryDto) {
    return this.prisma.leaveBalance.findMany({
      where: {
        ...(query.employeeId && { employeeId: query.employeeId }),
        ...(query.departmentId && {
          employee: { departmentId: query.departmentId },
        }),
        ...(query.leaveType && { leaveType: query.leaveType }),
        ...(query.year && { year: query.year }),
      },
      include: { employee: { select: basicEmployee } },
      orderBy: [{ year: 'desc' }, { employee: { lastName: 'asc' } }],
      take: 1000,
    });
  }

  leaveCalendar(query: LeaveCalendarQueryDto, actor: AuthenticatedUser) {
    const managerScope = actor.permissions.includes('hr.leave.calendar.view')
      ? query.managerId
      : undefined;
    return this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: dateOnly(query.dateTo) },
        endDate: { gte: dateOnly(query.dateFrom) },
        employee: {
          ...(query.departmentId && { departmentId: query.departmentId }),
          ...(managerScope && { managerId: managerScope }),
        },
      },
      select: {
        id: true,
        leaveType: true,
        startDate: true,
        endDate: true,
        employee: { select: basicEmployee },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async isEmployeeAvailable(employeeId: string, date: Date) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (
      !employee ||
      employee.employmentStatus === EmploymentStatus.INACTIVE ||
      employee.employmentStatus === EmploymentStatus.TERMINATED
    )
      return false;
    const leave = await this.prisma.leaveRequest.count({
      where: {
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: utcDay(date) },
        endDate: { gte: utcDay(date) },
      },
    });
    return leave === 0;
  }

  async attendanceReport(query: AttendanceReportQueryDto) {
    const start = dateOnly(query.dateFrom);
    const end = dateOnly(query.dateTo);
    const employees = await this.prisma.employee.findMany({
      where: {
        ...(query.employeeId && { id: query.employeeId }),
        ...(query.departmentId && { departmentId: query.departmentId }),
      },
      select: {
        ...basicEmployee,
        attendance: { where: { date: { gte: start, lte: end } } },
        shifts: {
          where: {
            effectiveFrom: { lte: end },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
          },
          include: { shift: true },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
    });
    return employees.map((employee) => {
      let totalMinutes = 0;
      let overtimeMinutes = 0;
      const shift = employee.shifts[0]?.shift;
      const standardMinutes = shift
        ? timeMinutes(shift.endTime) - timeMinutes(shift.startTime)
        : 480;
      for (const attendance of employee.attendance) {
        if (attendance.checkInAt && attendance.checkOutAt) {
          const minutes = Math.max(
            0,
            (attendance.checkOutAt.getTime() - attendance.checkInAt.getTime()) /
              60000,
          );
          totalMinutes += minutes;
          overtimeMinutes += Math.max(0, minutes - standardMinutes);
        }
      }
      const count = (status: string) =>
        employee.attendance.filter((item) => item.status === status).length;
      return {
        employee: {
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          firstName: employee.firstName,
          lastName: employee.lastName,
          department: employee.department,
        },
        presentDays: count('PRESENT'),
        absentDays: count('ABSENT'),
        lateDays: count('LATE'),
        halfDays: count('HALF_DAY'),
        remoteDays: count('REMOTE'),
        leaveDays: count('ON_LEAVE'),
        totalHours: Number((totalMinutes / 60).toFixed(2)),
        overtimeHours: Number((overtimeMinutes / 60).toFixed(2)),
      };
    });
  }

  async createOnboardingTemplate(dto: CreateTaskTemplateDto) {
    validateTemplateTasks(dto.tasks);
    return this.prisma.onboardingTemplate.create({
      data: {
        name: dto.name,
        tasks: {
          create: dto.tasks.map((task, sortOrder) => ({
            title: task.title,
            description: task.description,
            category: task.category,
            assignedRole: task.assignedRole,
            dueDaysAfterJoin: task.dueDays,
            requiresDocument: task.requiresDocument,
            sortOrder,
          })),
        },
      },
      include: { tasks: true },
    });
  }

  async createOffboardingTemplate(dto: CreateTaskTemplateDto) {
    validateTemplateTasks(dto.tasks);
    return this.prisma.offboardingTemplate.create({
      data: {
        name: dto.name,
        tasks: {
          create: dto.tasks.map((task, sortOrder) => ({
            title: task.title,
            description: task.description,
            category: task.category,
            assignedRole: task.assignedRole,
            dueDaysFromEnd: task.dueDays,
            blocksCompletion: task.blocksCompletion ?? true,
            sortOrder,
          })),
        },
      },
      include: { tasks: true },
    });
  }

  async startOnboarding(
    employeeId: string,
    dto: StartProcessDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const template = dto.templateId
      ? await this.prisma.onboardingTemplate.findUnique({
          where: { id: dto.templateId },
          include: { tasks: true },
        })
      : await this.defaultOnboardingTemplate();
    if (!template)
      throw new NotFoundException('Onboarding template not found.');
    return this.prisma.$transaction(async (tx) => {
      const tasks = await Promise.all(
        template.tasks.map((task) =>
          tx.onboardingTask.create({
            data: {
              employeeId,
              title: task.title,
              description: task.description,
              category: task.category,
              assignedRole: task.assignedRole,
              dueDate:
                task.dueDaysAfterJoin === null
                  ? null
                  : addDays(employee.joinDate, task.dueDaysAfterJoin),
              requiresDocument: task.requiresDocument,
            },
          }),
        ),
      );
      await tx.employee.update({
        where: { id: employeeId },
        data: { onboardingStatus: 'IN_PROGRESS' },
      });
      for (const task of tasks) {
        if (!task.assignedRole) continue;
        const users = await tx.user.findMany({
          where: {
            isActive: true,
            roles: { some: { role: { name: task.assignedRole } } },
          },
          select: { id: true },
        });
        await Promise.all(
          users.map(({ id: userId }) =>
            this.notifications.create(
              {
                userId,
                type: NotificationType.ONBOARDING_TASK_ASSIGNED,
                title: 'Onboarding task assigned',
                message: task.title,
                entityType: 'OnboardingTask',
                entityId: task.id,
              },
              tx,
            ),
          ),
        );
      }
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'OnboardingTask',
          entityId: employeeId,
          action: 'ONBOARDING_TASK_CREATED',
          newValues: { taskCount: tasks.length },
          requestMetadata: meta,
        },
        tx,
      );
      return tasks;
    });
  }

  async startOffboarding(
    employeeId: string,
    dto: StartProcessDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const template = dto.templateId
      ? await this.prisma.offboardingTemplate.findUnique({
          where: { id: dto.templateId },
          include: { tasks: true },
        })
      : await this.defaultOffboardingTemplate();
    if (!template)
      throw new NotFoundException('Offboarding template not found.');
    const baseDate = dto.effectiveDate
      ? dateOnly(dto.effectiveDate)
      : (employee.endDate ?? utcDay(new Date()));
    return this.prisma.$transaction(async (tx) => {
      const tasks = await Promise.all(
        template.tasks.map((task) =>
          tx.offboardingTask.create({
            data: {
              employeeId,
              title: task.title,
              description: task.description,
              category: task.category,
              assignedRole: task.assignedRole,
              dueDate:
                task.dueDaysFromEnd === null
                  ? null
                  : addDays(baseDate, task.dueDaysFromEnd),
              blocksCompletion: task.blocksCompletion,
            },
          }),
        ),
      );
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          offboardingStatus: 'IN_PROGRESS',
          employmentStatus: EmploymentStatus.NOTICE_PERIOD,
        },
      });
      for (const task of tasks) {
        if (!task.assignedRole) continue;
        const users = await tx.user.findMany({
          where: {
            isActive: true,
            roles: { some: { role: { name: task.assignedRole } } },
          },
          select: { id: true },
        });
        await Promise.all(
          users.map(({ id: userId }) =>
            this.notifications.create(
              {
                userId,
                type: NotificationType.OFFBOARDING_TASK_ASSIGNED,
                title: 'Offboarding task assigned',
                message: task.title,
                entityType: 'OffboardingTask',
                entityId: task.id,
              },
              tx,
            ),
          ),
        );
      }
      const roles = employee.userId
        ? await tx.userRole.findMany({
            where: { userId: employee.userId },
            select: { roleId: true },
          })
        : [];
      await tx.employeeAccessReview.create({
        data: {
          employeeId,
          userId: employee.userId,
          triggerType: AccessReviewTriggerType.OFFBOARDING,
          oldDepartmentId: employee.departmentId,
          newDepartmentId: employee.departmentId,
          oldRoles: roles.map(({ roleId }) => roleId),
          recommendedRoles: [],
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'OffboardingTask',
          entityId: employeeId,
          action: 'OFFBOARDING_TASK_CREATED',
          newValues: { taskCount: tasks.length },
          requestMetadata: meta,
        },
        tx,
      );
      return tasks;
    });
  }

  processTasks(employeeId: string, kind: 'onboarding' | 'offboarding') {
    return kind === 'onboarding'
      ? this.prisma.onboardingTask.findMany({
          where: { employeeId },
          orderBy: { createdAt: 'asc' },
        })
      : this.prisma.offboardingTask.findMany({
          where: { employeeId },
          orderBy: { createdAt: 'asc' },
        });
  }

  async offboardingDetails(employeeId: string) {
    await this.requireEmployee(employeeId);
    const [tasks, assets, exitInterview] = await Promise.all([
      this.prisma.offboardingTask.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.assetAssignment.findMany({
        where: { employeeId, returnedAt: null },
        include: { asset: true },
        orderBy: { assignedAt: 'asc' },
      }),
      this.prisma.exitInterview.findFirst({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { tasks, assignedAssets: assets, exitInterview };
  }

  async upsertExitInterview(employeeId: string, dto: UpsertExitInterviewDto) {
    await this.requireEmployee(employeeId);
    const existing = await this.prisma.exitInterview.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
    const data = {
      interviewerUserId: dto.interviewerUserId,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      notes: dto.notes,
    };
    return existing
      ? this.prisma.exitInterview.update({ where: { id: existing.id }, data })
      : this.prisma.exitInterview.create({ data: { employeeId, ...data } });
  }

  async updateTask(
    kind: 'onboarding' | 'offboarding',
    id: string,
    dto: UpdateHrTaskDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const completed = dto.status === HrTaskStatus.COMPLETED;
    if (kind === 'onboarding' && completed) {
      const current = await this.prisma.onboardingTask.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Onboarding task not found.');
      if (current.requiresDocument && !dto.employeeDocumentId)
        throw new BadRequestException(
          'This task requires an employee document before completion.',
        );
      if (dto.employeeDocumentId) {
        const document = await this.prisma.employeeDocument.findFirst({
          where: {
            id: dto.employeeDocumentId,
            employeeId: current.employeeId,
          },
        });
        if (!document)
          throw new BadRequestException(
            'The selected document does not belong to this employee.',
          );
      }
    }
    const task =
      kind === 'onboarding'
        ? await this.prisma.onboardingTask.update({
            where: { id },
            data: {
              status: dto.status,
              employeeDocumentId: dto.employeeDocumentId,
              completedById: completed ? actorId : null,
              completedAt: completed ? new Date() : null,
            },
          })
        : await this.prisma.offboardingTask.update({
            where: { id },
            data: {
              status: dto.status,
              completedById: completed ? actorId : null,
              completedAt: completed ? new Date() : null,
            },
          });
    await this.audit.log({
      actorUserId: actorId,
      entityType: kind === 'onboarding' ? 'OnboardingTask' : 'OffboardingTask',
      entityId: id,
      action:
        kind === 'onboarding'
          ? 'ONBOARDING_TASK_COMPLETED'
          : 'OFFBOARDING_TASK_COMPLETED',
      newValues: { status: dto.status },
      requestMetadata: meta,
    });
    await this.refreshProcessStatus(task.employeeId, kind);
    return task;
  }

  async completeOffboarding(
    employeeId: string,
    actorId: string,
    reason: string | undefined,
    meta?: RequestMetadata,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const [blockingTasks, outstandingAssets] = await Promise.all([
      this.prisma.offboardingTask.count({
        where: {
          employeeId,
          blocksCompletion: true,
          status: { notIn: [HrTaskStatus.COMPLETED, HrTaskStatus.CANCELLED] },
        },
      }),
      this.prisma.assetAssignment.count({
        where: { employeeId, returnedAt: null },
      }),
    ]);
    if (blockingTasks || outstandingAssets)
      throw new ConflictException(
        `Offboarding cannot complete: ${blockingTasks} blocking task(s) and ${outstandingAssets} outstanding asset(s).`,
      );
    return this.prisma.$transaction(async (tx) => {
      const oldRoles = employee.userId
        ? await tx.userRole.findMany({
            where: { userId: employee.userId },
            select: { roleId: true },
          })
        : [];
      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false },
        });
        await tx.userRole.deleteMany({ where: { userId: employee.userId } });
      }
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: {
          employmentStatus: EmploymentStatus.TERMINATED,
          offboardingStatus: 'COMPLETED',
          erpAccountDisabled: true,
          endDate: employee.endDate ?? utcDay(new Date()),
        },
      });
      const review = await tx.employeeAccessReview.create({
        data: {
          employeeId,
          userId: employee.userId,
          triggerType: AccessReviewTriggerType.OFFBOARDING,
          oldDepartmentId: employee.departmentId,
          newDepartmentId: employee.departmentId,
          oldRoles: oldRoles.map(({ roleId }) => roleId),
          recommendedRoles: [],
          status: AccessReviewStatus.COMPLETED,
          reviewedById: actorId,
          reviewedAt: new Date(),
          notes: reason,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmployeeAccessReview',
          entityId: review.id,
          action: 'ERP_ACCESS_REVOKED',
          oldValues: { roleIds: oldRoles.map(({ roleId }) => roleId) },
          newValues: { userActive: false },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
  }

  async myProfile(userId: string) {
    const employee = await this.employeeForUser(userId);
    return this.prisma.employee.findUniqueOrThrow({
      where: { id: employee.id },
      select: {
        ...basicEmployee,
        personalEmail: true,
        address: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        leaveBalances: { orderBy: [{ year: 'desc' }, { leaveType: 'asc' }] },
        leaveRequests: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { approvals: true },
        },
        attendance: { orderBy: { date: 'desc' }, take: 60 },
        documents: {
          where: { visibility: EmployeeDocumentVisibility.EMPLOYEE },
          orderBy: { createdAt: 'desc' },
        },
        onboardingTasks: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateMyProfileDto,
    meta?: RequestMetadata,
  ) {
    const employee = await this.employeeForUser(userId);
    const updated = await this.prisma.employee.update({
      where: { id: employee.id },
      data: dto,
      select: basicEmployee,
    });
    await this.audit.log({
      actorUserId: userId,
      entityType: 'Employee',
      entityId: employee.id,
      action: 'EMPLOYEE_SELF_SERVICE_UPDATED',
      newValues: { fields: Object.keys(dto) },
      requestMetadata: meta,
    });
    return updated;
  }

  async myTeam(userId: string) {
    const manager = await this.employeeForUser(userId);
    const today = utcDay(new Date());
    return this.prisma.employee.findMany({
      where: { managerId: manager.id },
      select: {
        ...basicEmployee,
        attendance: { where: { date: today }, take: 1 },
        leaveRequests: {
          where: {
            status: LeaveRequestStatus.APPROVED,
            startDate: { lte: today },
            endDate: { gte: today },
          },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async ownDocuments(userId: string) {
    const employee = await this.employeeForUser(userId);
    return this.prisma.employeeDocument.findMany({
      where: {
        employeeId: employee.id,
        visibility: EmployeeDocumentVisibility.EMPLOYEE,
      },
      include: {
        versions: { orderBy: { version: 'desc' } },
        acknowledgements: { where: { employeeId: employee.id } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDocumentAccess(id: string, dto: UpdateDocumentAccessDto) {
    return this.prisma.employeeDocument.update({
      where: { id },
      data: {
        visibility: dto.visibility,
        ...(dto.expiryDate && { expiryDate: dateOnly(dto.expiryDate) }),
      },
    });
  }

  async addDocumentVersion(
    id: string,
    dto: CreateDocumentVersionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.employeeDocument.findUnique({ where: { id } });
      if (!document)
        throw new NotFoundException('Employee document not found.');
      const latest = await tx.employeeDocumentVersion.aggregate({
        where: { employeeDocumentId: id },
        _max: { version: true },
      });
      const version = await tx.employeeDocumentVersion.create({
        data: {
          employeeDocumentId: id,
          version: (latest._max.version ?? 0) + 1,
          fileName: dto.fileName,
          storageKey: dto.storageKey,
          uploadedById: actorId,
        },
      });
      await tx.employeeDocument.update({
        where: { id },
        data: { fileName: dto.fileName, storageKey: dto.storageKey },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmployeeDocumentVersion',
          entityId: version.id,
          action: 'EMPLOYEE_DOCUMENT_VERSION_CREATED',
          newValues: { employeeDocumentId: id, version: version.version },
          requestMetadata: meta,
        },
        tx,
      );
      return version;
    });
  }

  async acknowledgeDocument(
    id: string,
    dto: AcknowledgeDocumentDto,
    userId: string,
    ipAddress?: string,
    meta?: RequestMetadata,
  ) {
    const employee = await this.employeeForUser(userId);
    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id,
        employeeId: employee.id,
        visibility: EmployeeDocumentVisibility.EMPLOYEE,
      },
    });
    if (!document)
      throw new ForbiddenException(
        'Document is not available for acknowledgement.',
      );
    const acknowledgement = await this.prisma.documentAcknowledgement.upsert({
      where: {
        employeeId_employeeDocumentId: {
          employeeId: employee.id,
          employeeDocumentId: id,
        },
      },
      create: {
        employeeId: employee.id,
        employeeDocumentId: id,
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        typedName: dto.typedName,
        ipAddress,
      },
      update: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        typedName: dto.typedName,
        ipAddress,
      },
    });
    await this.audit.log({
      actorUserId: userId,
      entityType: 'DocumentAcknowledgement',
      entityId: acknowledgement.id,
      action: 'DOCUMENT_ACKNOWLEDGED',
      newValues: { employeeDocumentId: id },
      requestMetadata: meta,
    });
    return {
      ...acknowledgement,
      disclaimer:
        'Internal acknowledgement only; not a certified third-party electronic signature.',
    };
  }

  expiringDocuments(query: ExpiringDocumentsQueryDto) {
    const now = utcDay(new Date());
    return this.prisma.employeeDocument.findMany({
      where: { expiryDate: { not: null, lte: addDays(now, query.days) } },
      include: { employee: { select: basicEmployee } },
      orderBy: { expiryDate: 'asc' },
    });
  }

  roleMappings() {
    return this.prisma.departmentRoleMapping.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  upsertRoleMapping(dto: UpsertRoleMappingDto) {
    return this.prisma.departmentRoleMapping.upsert({
      where: {
        departmentId_roleId: {
          departmentId: dto.departmentId,
          roleId: dto.roleId,
        },
      },
      create: dto,
      update: { isActive: dto.isActive ?? true },
    });
  }

  accessReviews() {
    return this.prisma.employeeAccessReview.findMany({
      include: { employee: { select: basicEmployee } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async reviewAccess(
    id: string,
    dto: ReviewAccessDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const review = await this.prisma.employeeAccessReview.findUnique({
      where: { id },
    });
    if (!review) throw new NotFoundException('Access review not found.');
    if (review.status !== AccessReviewStatus.PENDING)
      throw new ConflictException('Access review has already been reviewed.');
    return this.prisma.$transaction(async (tx) => {
      if (dto.status === AccessReviewStatus.COMPLETED && review.userId) {
        if (dto.removeRoleIds?.length)
          await tx.userRole.deleteMany({
            where: { userId: review.userId, roleId: { in: dto.removeRoleIds } },
          });
        if (dto.approvedRoleIds?.length)
          await tx.userRole.createMany({
            data: dto.approvedRoleIds.map((roleId) => ({
              userId: review.userId!,
              roleId,
            })),
            skipDuplicates: true,
          });
      }
      const updated = await tx.employeeAccessReview.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes,
          reviewedById: actorId,
          reviewedAt: new Date(),
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'EmployeeAccessReview',
          entityId: id,
          action: 'EMPLOYEE_ACCESS_REVIEW_COMPLETED',
          newValues: { status: dto.status },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
  }

  async hrReports(query: HrReportQueryDto) {
    const from = dateOnly(query.dateFrom);
    const to = dateOnly(query.dateTo);
    const [
      activeHeadcount,
      byDepartment,
      byEmploymentType,
      joined,
      terminated,
      onLeave,
      onboarding,
      offboarding,
      pendingLeave,
    ] = await this.prisma.$transaction([
      this.prisma.employee.count({
        where: {
          employmentStatus: {
            in: [
              EmploymentStatus.ACTIVE,
              EmploymentStatus.ON_LEAVE,
              EmploymentStatus.NOTICE_PERIOD,
            ],
          },
        },
      }),
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: {
          employmentStatus: {
            notIn: [EmploymentStatus.TERMINATED, EmploymentStatus.INACTIVE],
          },
        },
        orderBy: { departmentId: 'asc' },
        _count: true,
      }),
      this.prisma.employee.groupBy({
        by: ['employmentType'],
        where: {
          employmentStatus: {
            notIn: [EmploymentStatus.TERMINATED, EmploymentStatus.INACTIVE],
          },
        },
        orderBy: { employmentType: 'asc' },
        _count: true,
      }),
      this.prisma.employee.count({
        where: { joinDate: { gte: from, lte: to } },
      }),
      this.prisma.employee.count({
        where: {
          endDate: { gte: from, lte: to },
          employmentStatus: EmploymentStatus.TERMINATED,
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: utcDay(new Date()) },
          endDate: { gte: utcDay(new Date()) },
        },
      }),
      this.prisma.employee.count({
        where: { onboardingStatus: 'IN_PROGRESS' },
      }),
      this.prisma.employee.count({
        where: { offboardingStatus: 'IN_PROGRESS' },
      }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveRequestStatus.PENDING },
      }),
    ]);
    const starting = await this.prisma.employee.count({
      where: {
        joinDate: { lt: from },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
    });
    const ending = activeHeadcount;
    const averageHeadcount = (starting + ending) / 2;
    return {
      activeHeadcount,
      headcountByDepartment: byDepartment,
      headcountByEmploymentType: byEmploymentType,
      employeesJoined: joined,
      employeesTerminated: terminated,
      turnoverCount: terminated,
      turnoverRate: averageHeadcount
        ? Number(((terminated / averageHeadcount) * 100).toFixed(2))
        : 0,
      turnoverDefinition:
        'Employees terminated during the period divided by average of opening and closing active headcount, multiplied by 100.',
      employeesOnLeave: onLeave,
      pendingLeaveApprovals: pendingLeave,
      onboardingInProgress: onboarding,
      offboardingInProgress: offboarding,
    };
  }

  private async refreshProcessStatus(
    employeeId: string,
    kind: 'onboarding' | 'offboarding',
  ) {
    const pending =
      kind === 'onboarding'
        ? await this.prisma.onboardingTask.count({
            where: {
              employeeId,
              status: {
                notIn: [HrTaskStatus.COMPLETED, HrTaskStatus.CANCELLED],
              },
            },
          })
        : await this.prisma.offboardingTask.count({
            where: {
              employeeId,
              blocksCompletion: true,
              status: {
                notIn: [HrTaskStatus.COMPLETED, HrTaskStatus.CANCELLED],
              },
            },
          });
    if (kind === 'onboarding')
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { onboardingStatus: pending ? 'IN_PROGRESS' : 'COMPLETED' },
      });
  }

  private async defaultOnboardingTemplate() {
    let template = await this.prisma.onboardingTemplate.findFirst({
      where: { isActive: true },
      include: { tasks: true },
    });
    if (!template) {
      await this.createOnboardingTemplate({
        name: 'Standard onboarding',
        tasks: [
          {
            title: 'Complete employee profile',
            category: HrTaskCategory.HR,
            assignedRole: 'HR',
          },
          {
            title: 'Collect employee documents',
            category: HrTaskCategory.DOCUMENT,
            assignedRole: 'HR',
            requiresDocument: true,
          },
          {
            title: 'Create ERP user and assign approved role',
            category: HrTaskCategory.ACCESS,
            assignedRole: 'HR',
          },
          {
            title: 'Prepare and assign laptop',
            category: HrTaskCategory.EQUIPMENT,
            assignedRole: 'IT',
          },
          {
            title: 'Acknowledge required policies',
            category: HrTaskCategory.EMPLOYEE,
            assignedRole: 'EMPLOYEE',
            requiresDocument: true,
          },
        ],
      });
      template = await this.prisma.onboardingTemplate.findFirst({
        where: { name: 'Standard onboarding' },
        include: { tasks: true },
      });
    }
    return template;
  }

  private async defaultOffboardingTemplate() {
    let template = await this.prisma.offboardingTemplate.findFirst({
      where: { isActive: true },
      include: { tasks: true },
    });
    if (!template) {
      await this.createOffboardingTemplate({
        name: 'Standard offboarding',
        tasks: [
          {
            title: 'Record final working date',
            category: HrTaskCategory.HR,
            assignedRole: 'HR',
            blocksCompletion: true,
          },
          {
            title: 'Return company assets',
            category: HrTaskCategory.EQUIPMENT,
            assignedRole: 'IT',
            blocksCompletion: true,
          },
          {
            title: 'Remove system access',
            category: HrTaskCategory.ACCESS,
            assignedRole: 'IT',
            blocksCompletion: true,
          },
          {
            title: 'Complete exit interview',
            category: HrTaskCategory.HR,
            assignedRole: 'HR',
            blocksCompletion: false,
          },
          {
            title: 'Review final settlement',
            category: HrTaskCategory.FINANCE,
            assignedRole: 'ACCOUNTS',
            blocksCompletion: true,
          },
        ],
      });
      template = await this.prisma.offboardingTemplate.findFirst({
        where: { name: 'Standard offboarding' },
        include: { tasks: true },
      });
    }
    return template;
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

  private async userIdsWithPermission(
    code: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const users = await client.user.findMany({
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
}

function dateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function validateTemplateTasks(tasks: CreateTaskTemplateDto['tasks']) {
  if (!Array.isArray(tasks) || !tasks.length)
    throw new BadRequestException('At least one template task is required.');
  for (const task of tasks) {
    if (
      !task.title?.trim() ||
      !Object.values(HrTaskCategory).includes(task.category)
    )
      throw new BadRequestException(
        'Every template task requires a title and valid category.',
      );
  }
}

function parseCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [
        header.trim(),
        values[index]?.trim() ?? '',
      ]),
    );
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else value += character;
  }
  values.push(value);
  return values;
}

function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  return [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\r\n');
}
