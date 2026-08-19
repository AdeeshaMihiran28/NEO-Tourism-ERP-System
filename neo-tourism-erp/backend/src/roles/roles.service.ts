import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

const roleInclude = {
  permissions: {
    include: { permission: true },
  },
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: roleInclude,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateRoleDto) {
    const name = dto.name.trim().toUpperCase();
    await this.ensureNameAvailable(name);

    try {
      return await this.prisma.role.create({
        data: { name, description: dto.description?.trim() },
        include: roleInclude,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A role with this name already exists.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.ensureExists(id);
    const name = dto.name?.trim().toUpperCase();

    if (name) {
      await this.ensureNameAvailable(name, id);
    }

    try {
      return await this.prisma.role.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(dto.description !== undefined && {
            description: dto.description.trim(),
          }),
        },
        include: roleInclude,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A role with this name already exists.');
      }
      throw error;
    }
  }

  async setPermissions(id: string, dto: SetRolePermissionsDto) {
    return this.prisma.$transaction(async (transaction) => {
      const role = await transaction.role.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!role) {
        throw new NotFoundException('Role not found.');
      }

      const uniquePermissionIds = [...new Set(dto.permissionIds)];
      const permissionCount = await transaction.permission.count({
        where: { id: { in: uniquePermissionIds } },
      });

      if (permissionCount !== uniquePermissionIds.length) {
        throw new NotFoundException('One or more permissions were not found.');
      }

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

      return transaction.role.findUniqueOrThrow({
        where: { id },
        include: roleInclude,
      });
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
