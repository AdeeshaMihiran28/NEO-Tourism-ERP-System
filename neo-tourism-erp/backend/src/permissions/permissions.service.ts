import { ConflictException, Injectable } from '@nestjs/common';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePermissionDto } from './dto/create-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async create(dto: CreatePermissionDto) {
    const code = dto.code.trim().toLowerCase();
    const existingPermission = await this.prisma.permission.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existingPermission) {
      throw new ConflictException(
        'A permission with this code already exists.',
      );
    }

    try {
      return await this.prisma.permission.create({
        data: {
          code,
          description: dto.description?.trim(),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A permission with this code already exists.',
        );
      }
      throw error;
    }
  }
}
