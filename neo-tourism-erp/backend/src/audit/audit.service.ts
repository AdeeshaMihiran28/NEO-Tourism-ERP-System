import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { RequestMetadata } from '../common/request-metadata';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditEvent {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  requestMetadata?: RequestMetadata;
}

const actorSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const sensitiveKeyPattern =
  /password|token|secret|authorization|cookie|api[-_]?key|database[-_]?url/i;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: AuditEvent, client: Prisma.TransactionClient = this.prisma) {
    const oldValues = sanitizeJson(event.oldValues);
    const newValues = sanitizeJson(event.newValues);
    const metadata = sanitizeJson(event.metadata);
    const changes = changedFields(oldValues, newValues);

    return client.auditLog.create({
      data: {
        actorId: event.actorUserId,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        ...(changes.oldValues !== undefined && {
          oldValues: changes.oldValues,
        }),
        ...(changes.newValues !== undefined && {
          newValues: changes.newValues,
        }),
        ...(metadata !== undefined && { metadata }),
        ...(event.requestMetadata?.ipAddress && {
          ipAddress: event.requestMetadata.ipAddress,
        }),
        ...(event.requestMetadata?.userAgent && {
          userAgent: event.requestMetadata.userAgent,
        }),
      },
    });
  }

  async findAll(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId && { actorId: query.actorUserId }),
      ...(query.action && { action: query.action }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom && {
                gte: new Date(`${query.dateFrom}T00:00:00.000Z`),
              }),
              ...(query.dateTo && {
                lte: new Date(`${query.dateTo}T23:59:59.999Z`),
              }),
            },
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const total = await this.prisma.auditLog.count({ where });
    const data = await this.prisma.auditLog.findMany({
      where,
      include: { actor: { select: actorSelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: query.limit,
    });

    return {
      data: data.map(({ actorId, ...entry }) => ({
        ...entry,
        actorUserId: actorId,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const result = await this.prisma.auditLog.findUnique({
      where: { id },
      include: { actor: { select: actorSelect } },
    });
    if (!result) throw new NotFoundException('Audit log not found.');

    const { actorId, ...entry } = result;
    return { ...entry, actorUserId: actorId };
  }
}

function sanitizeJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return (value as unknown[])
      .map((item) => sanitizeJson(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }
  if (typeof value !== 'object') return undefined;

  const sanitized: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) continue;
    if (item === null) {
      sanitized[key] = null;
      continue;
    }
    const cleanItem = sanitizeJson(item);
    if (cleanItem !== undefined) sanitized[key] = cleanItem;
  }
  return sanitized;
}

function changedFields(
  oldValues: Prisma.InputJsonValue | undefined,
  newValues: Prisma.InputJsonValue | undefined,
): {
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
} {
  if (
    !oldValues ||
    !newValues ||
    Array.isArray(oldValues) ||
    Array.isArray(newValues) ||
    typeof oldValues !== 'object' ||
    typeof newValues !== 'object'
  ) {
    return { oldValues, newValues };
  }

  const oldObject = oldValues as Prisma.InputJsonObject;
  const newObject = newValues as Prisma.InputJsonObject;
  const oldChanges: Record<string, Prisma.InputJsonValue | null> = {};
  const newChanges: Record<string, Prisma.InputJsonValue | null> = {};
  const keys = new Set([...Object.keys(oldObject), ...Object.keys(newObject)]);
  for (const key of keys) {
    if (JSON.stringify(oldObject[key]) === JSON.stringify(newObject[key])) {
      continue;
    }
    if (oldObject[key] !== undefined) oldChanges[key] = oldObject[key];
    if (newObject[key] !== undefined) newChanges[key] = newObject[key];
  }

  return { oldValues: oldChanges, newValues: newChanges };
}
