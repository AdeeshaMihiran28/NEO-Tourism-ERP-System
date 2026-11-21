import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestMetadata } from '../common/request-metadata';
import {
  PRIVILEGED_PERMISSION_CODES,
  PRIVILEGED_ROLE_NAMES,
} from '../common/privileged-access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePositionDto,
  CreatePositionMappingDto,
  PositionMappingsQueryDto,
  UpdatePositionDto,
  UpdatePositionMappingDto,
} from './dto/positions.dto';

type RoleWithPermissions = {
  id: string;
  name: string;
  permissions: Array<{ permission: { code: string } }>;
};

export type PositionSyncResult = {
  synced: boolean;
  reason: string | null;
  addedAuto: string[];
  removedAuto: string[];
  preservedManual: string[];
  approvalPending: string[];
  reviewId: string | null;
};

const INACTIVE_STATUSES = new Set(['INACTIVE', 'TERMINATED']);

@Injectable()
export class PositionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  positions() {
    return this.prisma.position.findMany({ orderBy: { code: 'asc' } });
  }

  async createPosition(
    dto: CreatePositionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    try {
      const position = await this.prisma.position.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          title: dto.title.trim(),
          description: dto.description?.trim(),
        },
      });
      await this.audit.log({
        actorUserId: actorId,
        entityType: 'Position',
        entityId: position.id,
        action: 'POSITION_CREATED',
        newValues: { code: position.code, title: position.title },
        requestMetadata: meta,
      });
      return position;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A position with this code already exists.',
        );
      throw error;
    }
  }

  async updatePosition(
    id: string,
    dto: UpdatePositionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const position = await this.prisma.position.findUnique({ where: { id } });
    if (!position) throw new NotFoundException('Position not found.');
    const updated = await this.prisma.position.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title.trim() }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'Position',
      entityId: id,
      action: 'POSITION_UPDATED',
      oldValues: { title: position.title, isActive: position.isActive },
      newValues: { title: updated.title, isActive: updated.isActive },
      requestMetadata: meta,
    });
    if (position.isActive && dto.isActive === false)
      await this.resyncPosition(id, actorId, meta);
    return updated;
  }

  async deletePosition(id: string, actorId: string, meta?: RequestMetadata) {
    const position = await this.prisma.position.findUnique({ where: { id } });
    if (!position) throw new NotFoundException('Position not found.');
    const assigned = await this.prisma.employee.count({
      where: { positionId: id },
    });
    if (assigned)
      throw new ConflictException(
        `Position is assigned to ${assigned} employee(s). Reassign them before deleting it.`,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.positionRoleMapping.deleteMany({ where: { positionId: id } });
      await tx.position.delete({ where: { id } });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'Position',
          entityId: id,
          action: 'POSITION_DELETED',
          oldValues: { code: position.code, title: position.title },
          requestMetadata: meta,
        },
        tx,
      );
    });
    return { deleted: true };
  }

  mappings(query: PositionMappingsQueryDto) {
    return this.prisma.positionRoleMapping.findMany({
      where: { ...(query.positionId && { positionId: query.positionId }) },
      include: {
        position: { select: { id: true, code: true, title: true } },
        role: { select: { id: true, name: true } },
      },
      orderBy: [{ position: { code: 'asc' } }, { role: { name: 'asc' } }],
    });
  }

  async createMapping(
    dto: CreatePositionMappingDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const [position, role] = await Promise.all([
      this.prisma.position.findUnique({ where: { id: dto.positionId } }),
      this.prisma.role.findUnique({
        where: { id: dto.roleId },
        include: {
          permissions: { select: { permission: { select: { code: true } } } },
        },
      }),
    ]);
    if (!position || !position.isActive)
      throw new BadRequestException('Mapping must target an active position.');
    if (!role) throw new NotFoundException('Role not found.');
    const { requiresApproval, approvalEnforced } = this.resolveApprovalFlag(
      role,
      dto.requiresApproval ?? false,
    );
    try {
      const mapping = await this.prisma.$transaction(async (tx) => {
        const created = await tx.positionRoleMapping.create({
          data: {
            positionId: dto.positionId,
            roleId: dto.roleId,
            requiresApproval,
          },
          include: {
            position: { select: { id: true, code: true, title: true } },
            role: { select: { id: true, name: true } },
          },
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'PositionRoleMapping',
            entityId: created.id,
            action: 'POSITION_MAPPING_CREATED',
            newValues: {
              positionCode: created.position.code,
              roleName: created.role.name,
              requiresApproval,
              approvalEnforced,
            },
            requestMetadata: meta,
          },
          tx,
        );
        return created;
      });
      await this.resyncPosition(dto.positionId, actorId, meta);
      return { ...mapping, approvalEnforced };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('This position already maps to this role.');
      throw error;
    }
  }

  async updateMapping(
    id: string,
    dto: UpdatePositionMappingDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const mapping = await this.prisma.positionRoleMapping.findUnique({
      where: { id },
      include: {
        position: { select: { id: true, code: true } },
        role: {
          include: {
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    if (!mapping) throw new NotFoundException('Position mapping not found.');
    const { requiresApproval, approvalEnforced } = this.resolveApprovalFlag(
      mapping.role,
      dto.requiresApproval ?? mapping.requiresApproval,
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.positionRoleMapping.update({
        where: { id },
        data: {
          requiresApproval,
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'PositionRoleMapping',
          entityId: id,
          action: 'POSITION_MAPPING_UPDATED',
          oldValues: {
            requiresApproval: mapping.requiresApproval,
            isActive: mapping.isActive,
          },
          newValues: {
            requiresApproval: value.requiresApproval,
            isActive: value.isActive,
            approvalEnforced,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
    await this.resyncPosition(mapping.positionId, actorId, meta);
    return { ...updated, approvalEnforced };
  }

  async deleteMapping(id: string, actorId: string, meta?: RequestMetadata) {
    const mapping = await this.prisma.positionRoleMapping.findUnique({
      where: { id },
      include: {
        position: { select: { id: true, code: true } },
        role: { select: { name: true } },
      },
    });
    if (!mapping) throw new NotFoundException('Position mapping not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.positionRoleMapping.delete({ where: { id } });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'PositionRoleMapping',
          entityId: id,
          action: 'POSITION_MAPPING_DELETED',
          oldValues: {
            positionCode: mapping.position.code,
            roleName: mapping.role.name,
          },
          requestMetadata: meta,
        },
        tx,
      );
    });
    await this.resyncPosition(mapping.positionId, actorId, meta);
    return { deleted: true };
  }

  async resyncPosition(
    positionId: string,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const employees = await this.prisma.employee.findMany({
      where: { positionId },
      select: { id: true },
    });
    let changed = 0;
    for (const { id } of employees) {
      const result = await this.syncPositionRoles(id, actorId, meta);
      if (
        result.addedAuto.length ||
        result.removedAuto.length ||
        result.reviewId
      )
        changed += 1;
    }
    return {
      positionId,
      employeesChecked: employees.length,
      employeesChanged: changed,
    };
  }

  async syncPositionRoles(
    employeeId: string,
    actorId: string,
    meta?: RequestMetadata,
    client?: Prisma.TransactionClient,
  ): Promise<PositionSyncResult> {
    const run = async (tx: Prisma.TransactionClient) => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
      });
      if (!employee) throw new NotFoundException('Employee not found.');
      if (!employee.userId)
        return {
          synced: false,
          reason: 'NO_USER',
          addedAuto: [],
          removedAuto: [],
          preservedManual: [],
          approvalPending: [],
          reviewId: null,
        } satisfies PositionSyncResult;
      if (
        employee.archivedAt ||
        INACTIVE_STATUSES.has(employee.employmentStatus)
      )
        return {
          synced: false,
          reason: 'INACTIVE',
          addedAuto: [],
          removedAuto: [],
          preservedManual: [],
          approvalPending: [],
          reviewId: null,
        } satisfies PositionSyncResult;
      const user = await tx.user.findUnique({
        where: { id: employee.userId },
        select: { id: true, isActive: true },
      });
      if (!user)
        return {
          synced: false,
          reason: 'NO_USER',
          addedAuto: [],
          removedAuto: [],
          preservedManual: [],
          approvalPending: [],
          reviewId: null,
        } satisfies PositionSyncResult;
      const mappings = employee.positionId
        ? await tx.positionRoleMapping.findMany({
            where: { positionId: employee.positionId, isActive: true },
            include: {
              role: {
                include: {
                  permissions: {
                    select: { permission: { select: { code: true } } },
                  },
                },
              },
            },
          })
        : [];
      // Fail-closed partition: anything privileged or approval-flagged is
      // never granted automatically, even if a mapping row says otherwise.
      const autoRoleIds = mappings
        .filter(
          (mapping) =>
            !mapping.requiresApproval && !isPrivilegedRole(mapping.role),
        )
        .map((mapping) => mapping.roleId);
      const approvalRoleIds = mappings
        .filter(
          (mapping) =>
            mapping.requiresApproval || isPrivilegedRole(mapping.role),
        )
        .map((mapping) => mapping.roleId);
      const current = await tx.userRole.findMany({
        where: { userId: user.id },
        select: { roleId: true, source: true },
      });
      const currentIds = new Set(current.map(({ roleId }) => roleId));
      const preservedManual = current
        .filter(({ source }) => source !== 'POSITION_AUTO')
        .map(({ roleId }) => roleId);
      const toAdd = autoRoleIds.filter((roleId) => !currentIds.has(roleId));
      const toRemove = current
        .filter(
          ({ roleId, source }) =>
            source === 'POSITION_AUTO' && !autoRoleIds.includes(roleId),
        )
        .map(({ roleId }) => roleId);
      if (toRemove.length)
        await tx.userRole.deleteMany({
          where: {
            userId: user.id,
            roleId: { in: toRemove },
            source: 'POSITION_AUTO',
          },
        });
      if (toAdd.length)
        await tx.userRole.createMany({
          data: toAdd.map((roleId) => ({
            userId: user.id,
            roleId,
            source: 'POSITION_AUTO' as const,
          })),
          skipDuplicates: true,
        });
      // Privileged/approval roles route to the existing access-review flow —
      // a human with hr.access_review.manage approves; never auto-granted.
      // Account state is never touched: disabled users stay disabled.
      let reviewId: string | null = null;
      const pendingApproval = approvalRoleIds.filter(
        (roleId) => !currentIds.has(roleId),
      );
      if (pendingApproval.length) {
        const openReview = await tx.employeeAccessReview.findFirst({
          where: {
            employeeId,
            triggerType: 'POSITION_CHANGE',
            status: 'PENDING',
          },
          select: { id: true },
        });
        if (!openReview) {
          const review = await tx.employeeAccessReview.create({
            data: {
              employeeId,
              userId: user.id,
              triggerType: 'POSITION_CHANGE',
              oldDepartmentId: employee.departmentId,
              newDepartmentId: employee.departmentId,
              oldRoles: [...currentIds],
              recommendedRoles: pendingApproval,
            },
          });
          reviewId = review.id;
          await this.audit.log(
            {
              actorUserId: actorId,
              entityType: 'EmployeeAccessReview',
              entityId: review.id,
              action: 'EMPLOYEE_ACCESS_REVIEW_CREATED',
              newValues: {
                employeeId,
                triggerType: 'POSITION_CHANGE',
                approvalPending: pendingApproval,
              },
              requestMetadata: meta,
            },
            tx,
          );
          const reviewers = await tx.user.findMany({
            where: {
              isActive: true,
              roles: {
                some: {
                  role: {
                    permissions: {
                      some: {
                        permission: { code: 'hr.access_review.manage' },
                      },
                    },
                  },
                },
              },
            },
            select: { id: true },
          });
          await Promise.all(
            reviewers.map(({ id: reviewerId }) =>
              this.notifications.create(
                {
                  userId: reviewerId,
                  type: NotificationType.ACCESS_REVIEW_REQUIRED,
                  title: 'Position approval required',
                  message:
                    'A position mapping requires approval before privileged roles can be granted.',
                  entityType: 'EmployeeAccessReview',
                  entityId: review.id,
                },
                tx,
              ),
            ),
          );
        }
      }
      if (toAdd.length || toRemove.length || reviewId)
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'User',
            entityId: user.id,
            action: 'POSITION_ACCESS_SYNCED',
            oldValues: {
              positionId: employee.positionId,
              removedAuto: toRemove,
            },
            newValues: {
              addedAuto: toAdd,
              preservedManual,
              approvalPending: pendingApproval,
              reviewId,
            },
            metadata: { appliedBy: 'POSITION_SYNC' },
            requestMetadata: meta,
          },
          tx,
        );
      return {
        synced: true,
        reason: null,
        addedAuto: toAdd,
        removedAuto: toRemove,
        preservedManual,
        approvalPending: pendingApproval,
        reviewId,
      } satisfies PositionSyncResult;
    };
    return client ? run(client) : this.prisma.$transaction(run);
  }

  private resolveApprovalFlag(
    role: RoleWithPermissions,
    requested: boolean,
  ): { requiresApproval: boolean; approvalEnforced: boolean } {
    if (!isPrivilegedRole(role))
      return { requiresApproval: requested, approvalEnforced: false };
    return { requiresApproval: true, approvalEnforced: true };
  }
}

function isPrivilegedRole(role: RoleWithPermissions): boolean {
  return (
    PRIVILEGED_ROLE_NAMES.includes(role.name) ||
    role.permissions.some(({ permission }) =>
      PRIVILEGED_PERMISSION_CODES.includes(permission.code),
    )
  );
}
