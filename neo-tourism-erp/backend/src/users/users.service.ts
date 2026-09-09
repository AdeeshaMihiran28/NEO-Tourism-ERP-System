import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { isUniqueConstraintError } from '../common/prisma-errors';
import {
  PRIVILEGED_PERMISSION_CODES,
  PRIVILEGED_ROLE_NAMES,
} from '../common/privileged-access';
import type { RequestMetadata } from '../common/request-metadata';
import { toSafeUser, userIdentityInclude } from '../common/user-response';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { UpdateUserStatusDto } from './dto/update-user-status.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const PASSWORD_SALT_ROUNDS = 12;

const userListInclude = {
  department: true,
  employee: {
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      organizationLevel: true,
      employmentStatus: true,
      department: { select: { name: true } },
    },
  },
  roles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: userListInclude,
      orderBy: { email: 'asc' },
      take: 500,
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      department: user.department?.name ?? null,
      employee: user.employee,
      accessMismatch:
        user.isActive &&
        !!user.employee &&
        ['INACTIVE', 'TERMINATED'].includes(user.employee.employmentStatus),
      roles: user.roles.map(({ role }) => role.name).sort(),
      permissions: [
        ...new Set(
          user.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        ),
      ].sort(),
    }));
  }

  async accessOptions() {
    const [employees, roles] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where: { archivedAt: null },
        select: {
          id: true,
          userId: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          workEmail: true,
          departmentId: true,
          organizationLevel: true,
          employmentStatus: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.role.findMany({
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { employees, roles };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userIdentityInclude,
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return toSafeUser(this.prisma, user);
  }

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    const email = dto.email.trim().toLowerCase();

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        await this.ensureEmailAvailable(transaction, email);
        await this.ensureDepartmentExists(transaction, dto.departmentId);
        await this.ensureRoleAssignmentAllowed(transaction, dto.roleIds, actor);
        if (dto.employeeId)
          await this.ensureEmployeeAvailable(transaction, dto.employeeId);

        const created = await transaction.user.create({
          data: {
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            email,
            passwordHash: await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS),
            departmentId: dto.departmentId,
            roles: {
              create: dto.roleIds.map((roleId) => ({ roleId })),
            },
          },
          include: userIdentityInclude,
        });
        if (dto.employeeId) {
          await transaction.employee.update({
            where: { id: dto.employeeId },
            data: { userId: created.id },
          });
        }
        await this.auditService.log(
          {
            actorUserId: actor.id,
            entityType: 'User',
            entityId: created.id,
            action: 'USER_CREATED',
            newValues: this.userSnapshot(created, dto.roleIds),
            requestMetadata,
          },
          transaction,
        );
        await this.auditRoleChanges(
          transaction,
          actor.id,
          created.id,
          [],
          dto.roleIds,
          requestMetadata,
        );
        if (dto.employeeId) {
          await this.auditService.log(
            {
              actorUserId: actor.id,
              entityType: 'User',
              entityId: created.id,
              action: 'USER_EMPLOYEE_LINKED',
              newValues: { employeeId: dto.employeeId },
              requestMetadata,
            },
            transaction,
          );
        }
        return created;
      });

      return toSafeUser(this.prisma, user);
    } catch (error) {
      this.rethrowUniqueEmail(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          where: { id },
          include: {
            roles: { select: { roleId: true } },
            employee: { select: { id: true } },
          },
        });
        if (!existing) throw new NotFoundException('User not found.');

        const email = dto.email?.trim().toLowerCase();
        if (email) {
          await this.ensureEmailAvailable(transaction, email, id);
        }

        if (dto.departmentId) {
          await this.ensureDepartmentExists(transaction, dto.departmentId);
        }

        if (dto.roleIds) {
          if (!actor.permissions.includes('user.manage_roles'))
            throw new ForbiddenException('Role assignment is not permitted.');
          await this.ensureRoleAssignmentAllowed(
            transaction,
            dto.roleIds,
            actor,
            id,
            existing.roles.map(({ roleId }) => roleId),
          );
          await this.ensureAdministratorRemains(
            transaction,
            id,
            existing.isActive,
            dto.roleIds,
          );
        }
        if (dto.employeeId && dto.employeeId !== existing.employee?.id)
          await this.ensureEmployeeAvailable(transaction, dto.employeeId);

        const updated = await transaction.user.update({
          where: { id },
          data: {
            ...(dto.firstName !== undefined && {
              firstName: dto.firstName.trim(),
            }),
            ...(dto.lastName !== undefined && {
              lastName: dto.lastName.trim(),
            }),
            ...(email !== undefined && { email }),
            ...(dto.password !== undefined && {
              passwordHash: await bcrypt.hash(
                dto.password,
                PASSWORD_SALT_ROUNDS,
              ),
            }),
            ...(dto.departmentId !== undefined && {
              departmentId: dto.departmentId,
            }),
            ...(dto.roleIds !== undefined && {
              roles: {
                deleteMany: {},
                create: dto.roleIds.map((roleId) => ({ roleId })),
              },
            }),
          },
          include: userIdentityInclude,
        });
        if (dto.employeeId && dto.employeeId !== existing.employee?.id) {
          if (existing.employee)
            await transaction.employee.update({
              where: { id: existing.employee.id },
              data: { userId: null },
            });
          await transaction.employee.update({
            where: { id: dto.employeeId },
            data: { userId: id },
          });
        }
        const newRoleIds =
          dto.roleIds ?? existing.roles.map(({ roleId }) => roleId);
        await this.auditService.log(
          {
            actorUserId: actor.id,
            entityType: 'User',
            entityId: id,
            action: 'USER_UPDATED',
            oldValues: this.userSnapshot(
              existing,
              existing.roles.map(({ roleId }) => roleId),
            ),
            newValues: this.userSnapshot(updated, newRoleIds),
            ...(dto.password !== undefined && {
              metadata: { passwordChanged: true },
            }),
            requestMetadata,
          },
          transaction,
        );
        await this.auditRoleChanges(
          transaction,
          actor.id,
          id,
          existing.roles.map(({ roleId }) => roleId),
          newRoleIds,
          requestMetadata,
        );
        return updated;
      });

      return toSafeUser(this.prisma, user);
    } catch (error) {
      this.rethrowUniqueEmail(error);
      throw error;
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    const user = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { id },
        include: userIdentityInclude,
      });
      if (!existing) throw new NotFoundException('User not found.');
      if (existing.isActive === dto.isActive) return existing;
      if (existing.isActive && !dto.isActive)
        await this.ensureAdministratorRemains(transaction, id, false);

      const updated = await transaction.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        include: userIdentityInclude,
      });
      await transaction.employee.updateMany({
        where: { userId: id },
        data: { erpAccountDisabled: !dto.isActive },
      });
      if (!dto.isActive) {
        await transaction.offboardingTask.updateMany({
          where: {
            employee: { userId: id },
            category: 'ACCESS',
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
          data: {
            status: 'COMPLETED',
            completedById: actor.id,
            completedAt: new Date(),
          },
        });
        await transaction.employeeAccessReview.updateMany({
          where: {
            employee: { userId: id },
            triggerType: 'OFFBOARDING',
            status: 'PENDING',
          },
          data: {
            status: 'COMPLETED',
            reviewedById: actor.id,
            reviewedAt: new Date(),
            notes: 'ERP access disabled through IT & Access Management.',
          },
        });
      }
      await this.auditService.log(
        {
          actorUserId: actor.id,
          entityType: 'User',
          entityId: id,
          action: updated.isActive
            ? 'USER_ACCESS_ENABLED'
            : 'USER_ACCESS_DISABLED',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive: updated.isActive },
          requestMetadata,
        },
        transaction,
      );
      return updated;
    });

    return toSafeUser(this.prisma, user);
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.ensureUserExists(transaction, id);
      await transaction.user.update({
        where: { id },
        data: {
          passwordHash: await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS),
        },
      });
      await this.auditService.log(
        {
          actorUserId: actor.id,
          entityType: 'User',
          entityId: id,
          action: 'PASSWORD_RESET',
          metadata: { resetByAdministrator: true },
          requestMetadata,
        },
        transaction,
      );
      return { success: true };
    });
  }

  private userSnapshot(
    user: {
      email: string;
      firstName: string;
      lastName: string;
      isActive: boolean;
      departmentId: string | null;
    },
    roleIds: string[],
  ): Prisma.InputJsonObject {
    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      departmentId: user.departmentId,
      roleIds: [...roleIds].sort(),
    };
  }

  private async ensureUserExists(
    client: Prisma.TransactionClient | PrismaService,
    id: string,
  ): Promise<void> {
    const user = await client.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }
  }

  private async ensureEmailAvailable(
    client: Prisma.TransactionClient,
    email: string,
    excludedUserId?: string,
  ): Promise<void> {
    const existingUser = await client.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser && existingUser.id !== excludedUserId) {
      throw new ConflictException('A user with this email already exists.');
    }
  }

  private async ensureDepartmentExists(
    client: Prisma.TransactionClient,
    departmentId: string,
  ): Promise<void> {
    const department = await client.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });

    if (!department) {
      throw new NotFoundException('Department not found.');
    }
  }

  private async ensureRolesExist(
    client: Prisma.TransactionClient,
    roleIds: string[],
  ): Promise<void> {
    const uniqueRoleIds = [...new Set(roleIds)];
    const roleCount = await client.role.count({
      where: { id: { in: uniqueRoleIds } },
    });

    if (roleCount !== uniqueRoleIds.length) {
      throw new NotFoundException('One or more roles were not found.');
    }
  }

  private async ensureRoleAssignmentAllowed(
    client: Prisma.TransactionClient,
    roleIds: string[],
    actor: AuthenticatedUser,
    targetUserId?: string,
    existingRoleIds: string[] = [],
  ): Promise<void> {
    await this.ensureRolesExist(client, roleIds);
    const changedRoleIds = [
      ...new Set([
        ...roleIds.filter((id) => !existingRoleIds.includes(id)),
        ...existingRoleIds.filter((id) => !roleIds.includes(id)),
      ]),
    ];
    if (!changedRoleIds.length) return;
    const changedRoles = await client.role.findMany({
      where: { id: { in: changedRoleIds } },
      select: {
        id: true,
        name: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    });
    const privileged = changedRoles.filter(
      ({ name, permissions }) =>
        PRIVILEGED_ROLE_NAMES.includes(name) ||
        permissions.some(({ permission }) =>
          PRIVILEGED_PERMISSION_CODES.includes(permission.code),
        ),
    );
    if (!privileged.length) return;
    const addedPrivileged = changedRoles.some(
      ({ id, name, permissions }) =>
        !existingRoleIds.includes(id) &&
        (PRIVILEGED_ROLE_NAMES.includes(name) ||
          permissions.some(({ permission }) =>
            PRIVILEGED_PERMISSION_CODES.includes(permission.code),
          )),
    );
    if (targetUserId === actor.id && addedPrivileged)
      throw new ForbiddenException(
        'You cannot grant yourself a privileged role.',
      );
    if (!actor.permissions.includes('user.manage_privileged_roles'))
      throw new ForbiddenException(
        'Privileged role assignment is not permitted.',
      );
    if (
      privileged.some(
        ({ name, permissions }) =>
          name === 'OWNER' ||
          permissions.some(
            ({ permission }) => permission.code === 'organization.owner.manage',
          ),
      ) &&
      !actor.permissions.includes('organization.owner.manage')
    )
      throw new ForbiddenException('Owner assignment is not permitted.');
  }

  private async ensureAdministratorRemains(
    client: Prisma.TransactionClient,
    userId: string,
    remainsActive: boolean,
    roleIds?: string[],
  ) {
    const administratorRoles = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];
    const existing = await client.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    if (
      !existing?.roles.some(({ role }) =>
        administratorRoles.includes(role.name),
      )
    )
      return;
    const keepsAdministratorRole = roleIds
      ? Boolean(
          await client.role.count({
            where: { id: { in: roleIds }, name: { in: administratorRoles } },
          }),
        )
      : true;
    if (remainsActive && keepsAdministratorRole) return;
    const otherActiveAdministrators = await client.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        roles: { some: { role: { name: { in: administratorRoles } } } },
      },
    });
    if (!otherActiveAdministrators)
      throw new ConflictException(
        'The last active system administrator cannot be disabled or demoted.',
      );
  }

  private async ensureEmployeeAvailable(
    client: Prisma.TransactionClient,
    employeeId: string,
  ): Promise<void> {
    const employee = await client.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true, archivedAt: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (employee.archivedAt)
      throw new ConflictException(
        'Archived employees cannot receive ERP access.',
      );
    if (employee.userId)
      throw new ConflictException('This employee already has an ERP account.');
  }

  private async auditRoleChanges(
    client: Prisma.TransactionClient,
    actorUserId: string,
    userId: string,
    oldRoleIds: string[],
    newRoleIds: string[],
    requestMetadata?: RequestMetadata,
  ) {
    for (const roleId of newRoleIds.filter((id) => !oldRoleIds.includes(id)))
      await this.auditService.log(
        {
          actorUserId,
          entityType: 'User',
          entityId: userId,
          action: 'USER_ROLE_ASSIGNED',
          newValues: { roleId },
          requestMetadata,
        },
        client,
      );
    for (const roleId of oldRoleIds.filter((id) => !newRoleIds.includes(id)))
      await this.auditService.log(
        {
          actorUserId,
          entityType: 'User',
          entityId: userId,
          action: 'USER_ROLE_REMOVED',
          oldValues: { roleId },
          requestMetadata,
        },
        client,
      );
  }

  private rethrowUniqueEmail(error: unknown): void {
    if (isUniqueConstraintError(error)) {
      throw new ConflictException('A user with this email already exists.');
    }
  }
}
