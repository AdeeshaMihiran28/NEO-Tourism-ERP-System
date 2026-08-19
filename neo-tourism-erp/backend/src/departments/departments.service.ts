import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDepartmentDto } from './dto/create-department.dto';
import type { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateDepartmentDto) {
    const name = dto.name.trim();
    await this.ensureNameAvailable(name);

    try {
      return await this.prisma.department.create({
        data: {
          name,
          description: dto.description?.trim(),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A department with this name already exists.',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.ensureExists(id);
    const name = dto.name?.trim();

    if (name) {
      await this.ensureNameAvailable(name, id);
    }

    try {
      return await this.prisma.department.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(dto.description !== undefined && {
            description: dto.description.trim(),
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A department with this name already exists.',
        );
      }
      throw error;
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const department = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!department) {
      throw new NotFoundException('Department not found.');
    }
  }

  private async ensureNameAvailable(
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const department = await this.prisma.department.findUnique({
      where: { name },
      select: { id: true },
    });

    if (department && department.id !== excludedId) {
      throw new ConflictException(
        'A department with this name already exists.',
      );
    }
  }
}
