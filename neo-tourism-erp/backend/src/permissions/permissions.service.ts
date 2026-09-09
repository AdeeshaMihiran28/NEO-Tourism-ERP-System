import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { isUniqueConstraintError } from '../common/prisma-errors';
import type { RequestMetadata } from '../common/request-metadata';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePermissionDto } from './dto/create-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findAll() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async create(
    dto: CreatePermissionDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
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
      return await this.prisma.$transaction(async (transaction) => {
        const permission = await transaction.permission.create({
          data: {
            code,
            description: dto.description?.trim(),
          },
        });
        await this.auditService.log(
          {
            actorUserId: actorId,
            entityType: 'Permission',
            entityId: permission.id,
            action: 'PERMISSION_CREATED',
            newValues: {
              code: permission.code,
              description: permission.description,
            },
            requestMetadata,
          },
          transaction,
        );
        return permission;
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
