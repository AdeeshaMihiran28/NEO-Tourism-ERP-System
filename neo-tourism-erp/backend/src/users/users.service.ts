import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '../../generated/prisma/client';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { toSafeUser, userAccessInclude } from '../common/user-response';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserStatusDto } from './dto/update-user-status.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: userAccessInclude,
      orderBy: { email: 'asc' },
    });

    return users.map(toSafeUser);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userAccessInclude,
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return toSafeUser(user);
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        await this.ensureEmailAvailable(transaction, email);
        await this.ensureDepartmentExists(transaction, dto.departmentId);
        await this.ensureRolesExist(transaction, dto.roleIds);

        return transaction.user.create({
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
          include: userAccessInclude,
        });
      });

      return toSafeUser(user);
    } catch (error) {
      this.rethrowUniqueEmail(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        await this.ensureUserExists(transaction, id);

        const email = dto.email?.trim().toLowerCase();
        if (email) {
          await this.ensureEmailAvailable(transaction, email, id);
        }

        if (dto.departmentId) {
          await this.ensureDepartmentExists(transaction, dto.departmentId);
        }

        if (dto.roleIds) {
          await this.ensureRolesExist(transaction, dto.roleIds);
        }

        return transaction.user.update({
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
          include: userAccessInclude,
        });
      });

      return toSafeUser(user);
    } catch (error) {
      this.rethrowUniqueEmail(error);
      throw error;
    }
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto) {
    await this.ensureUserExists(this.prisma, id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
      include: userAccessInclude,
    });

    return toSafeUser(user);
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

  private rethrowUniqueEmail(error: unknown): void {
    if (isUniqueConstraintError(error)) {
      throw new ConflictException('A user with this email already exists.');
    }
  }
}
