import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { isUniqueConstraintError } from '../common/prisma-errors';
import {
  PRIVILEGED_PERMISSION_CODES,
  PRIVILEGED_ROLE_NAMES,
} from '../common/privileged-access';
import type { RequestMetadata } from '../common/request-metadata';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

const roleInclude = {
  permissions: {
    include: { permission: true },
  },
  users: {
    select: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
        },
      },
    },
  },
  _count: { select: { users: true } },
};

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findAll() {
    return this.prisma.role.findMany({
      include: roleInclude,
      orderBy: { name: 'asc' },
    });
  }

  async create(
    dto: CreateRoleDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    const name = dto.name.trim().toUpperCase();
    this.assertPrivilegedRoleAllowed(name, actor);
    await this.ensureNameAvailable(name);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const role = await transaction.role.create({
          data: { name, description: dto.description?.trim() },
          include: roleInclude,
        });
        await this.auditService.log(
          {
            actorUserId: actor.id,
            entityType: 'Role',
            entityId: role.id,
            action: 'ROLE_CREATED',
            newValues: { name: role.name, description: role.description },
            requestMetadata,
          },
          transaction,
        );
        return role;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A role with this name already exists.');
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    await this.ensureExists(id);
    const name = dto.name?.trim().toUpperCase();

    const current = await this.prisma.role.findUniqueOrThrow({
      where: { id },
      select: { name: true },
    });
    this.assertPrivilegedRoleAllowed(current.name, actor);
    if (name) this.assertPrivilegedRoleAllowed(name, actor);

    if (name) {
      await this.ensureNameAvailable(name, id);
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.role.findUniqueOrThrow({
          where: { id },
        });
        const role = await transaction.role.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(dto.description !== undefined && {
              description: dto.description.trim(),
            }),
          },
          include: roleInclude,
        });
        await this.auditService.log(
          {
            actorUserId: actor.id,
            entityType: 'Role',
            entityId: role.id,
            action: 'ROLE_UPDATED',
            oldValues: {
              name: existing.name,
              description: existing.description,
            },
            newValues: { name: role.name, description: role.description },
            requestMetadata,
          },
          transaction,
        );
        return role;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A role with this name already exists.');
      }
      throw error;
    }
  }

  async setPermissions(
    id: string,
    dto: SetRolePermissionsDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const role = await transaction.role.findUnique({
        where: { id },
        include: {
          permissions: { select: { permissionId: true } },
          users: { where: { userId: actor.id }, select: { userId: true } },
        },
      });

      if (!role) {
        throw new NotFoundException('Role not found.');
      }

      const uniquePermissionIds = [...new Set(dto.permissionIds)];
      const selectedPermissions = await transaction.permission.findMany({
        where: { id: { in: uniquePermissionIds } },
        select: { id: true, code: true },
      });

      if (selectedPermissions.length !== uniquePermissionIds.length) {
        throw new NotFoundException('One or more permissions were not found.');
      }
      this.assertPrivilegedRoleAllowed(role.name, actor);
      const existingPermissionIds = role.permissions.map(
        ({ permissionId }) => permissionId,
      );
      const addsPermissions = uniquePermissionIds.some(
        (permissionId) => !existingPermissionIds.includes(permissionId),
      );
      if (
        addsPermissions &&
        role.users.length &&
        !actor.permissions.includes('user.manage_privileged_roles')
      )
        throw new ForbiddenException(
          'You cannot expand permissions on a role assigned to yourself.',
        );
      if (
        selectedPermissions.some(({ code }) =>
          PRIVILEGED_PERMISSION_CODES.includes(code),
        ) &&
        !actor.permissions.includes('user.manage_privileged_roles')
      )
        throw new ForbiddenException(
          'Privileged permissions require privileged-role authority.',
        );
      if (
        selectedPermissions.some(
          ({ code }) => code === 'organization.owner.manage',
        ) &&
        !actor.permissions.includes('organization.owner.manage')
      )
        throw new ForbiddenException(
          'Owner permission assignment is not permitted.',
        );

      await transaction.rolePermission.deleteMany({ where: { roleId: id } });

      if (uniquePermissionIds.length) {
        await transaction.rolePermission.createMany({
          data: uniquePermissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }

      const updated = await transaction.role.findUniqueOrThrow({
        where: { id },
        include: roleInclude,
      });
      await this.auditService.log(
        {
          actorUserId: actor.id,
          entityType: 'Role',
          entityId: id,
          action: 'ROLE_PERMISSION_UPDATED',
          oldValues: {
            permissionIds: role.permissions
              .map(({ permissionId }) => permissionId)
              .sort(),
          },
          newValues: { permissionIds: [...uniquePermissionIds].sort() },
          requestMetadata,
        },
        transaction,
      );
      return updated;
    });
  }

  private async ensureExists(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }
  }

  private assertPrivilegedRoleAllowed(
    roleName: string,
    actor: AuthenticatedUser,
  ) {
    if (!PRIVILEGED_ROLE_NAMES.includes(roleName)) return;
    if (!actor.permissions.includes('user.manage_privileged_roles'))
      throw new ForbiddenException(
        'Privileged role management is not permitted.',
      );
    if (
      roleName === 'OWNER' &&
      !actor.permissions.includes('organization.owner.manage')
    )
      throw new ForbiddenException('Owner role management is not permitted.');
  }

  private async ensureNameAvailable(
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { name },
      select: { id: true },
    });

    if (role && role.id !== excludedId) {
      throw new ConflictException('A role with this name already exists.');
    }
  }
}
