import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateSeriesDto, UpdateSeriesDto } from './dto/neotrio.dto';

@Injectable()
export class NeoTrioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async home() {
    const [ideas, production, characters, publishedThisMonth, totalPublished] =
      await Promise.all([
        this.prisma.neoTrioIdea.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.neoTrioProduction.groupBy({
          by: ['stage'],
          _count: { _all: true },
        }),
        this.prisma.neoTrioCharacter.findMany({
          where: { isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.neoTrioLibraryItem.count({
          where: {
            publishedAt: {
              gte: new Date(
                Date.UTC(
                  new Date().getUTCFullYear(),
                  new Date().getUTCMonth(),
                  1,
                ),
              ),
            },
          },
        }),
        this.prisma.neoTrioLibraryItem.count(),
      ]);
    const count = (
      rows: { status?: string; stage?: string; _count: { _all: number } }[],
      key: string,
    ) =>
      rows.find((row) => row.status === key || row.stage === key)?._count
        ._all ?? 0;
    return {
      ideas: {
        new: count(ideas, 'NEW'),
        shortlisted: count(ideas, 'SHORTLISTED'),
        readyToProduce: count(ideas, 'ACCEPTED'),
      },
      production: {
        script: count(production, 'SCRIPT'),
        production: count(production, 'PRODUCTION'),
        review: count(production, 'REVIEW'),
        ready: count(production, 'READY'),
      },
      characters,
      library: { publishedThisMonth, totalPublished },
    };
  }
  series() {
    return this.prisma.neoTrioSeries.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }
  async createSeries(
    dto: CreateSeriesDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const counter = await tx.neoTrioSeriesCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      const value = await tx.neoTrioSeries.create({
        data: {
          seriesCode: `NEOTRIO-SERIES-${year}-${String(counter.nextNumber - 1).padStart(4, '0')}`,
          name: dto.name,
          description: dto.description,
          createdById: actorId,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioSeries',
          entityId: value.id,
          action: 'NEOTRIO_SERIES_CREATED',
          newValues: { seriesCode: value.seriesCode, name: value.name },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
  }
  async updateSeries(
    id: string,
    dto: UpdateSeriesDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const before = await this.prisma.neoTrioSeries.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('NeoTrio series not found.');
    const value = await this.prisma.neoTrioSeries.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioSeries',
      entityId: id,
      action: 'NEOTRIO_SERIES_UPDATED',
      oldValues: {
        name: before.name,
        description: before.description,
        isActive: before.isActive,
      },
      newValues: {
        name: value.name,
        description: value.description,
        isActive: value.isActive,
      },
      requestMetadata: meta,
    });
    return value;
  }
}
