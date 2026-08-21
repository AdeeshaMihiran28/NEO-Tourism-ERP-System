import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEvent {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  create(event: AuditEvent, client: Prisma.TransactionClient = this.prisma) {
    return client.auditLog.create({
      data: {
        actorId: event.actorId,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        ...(event.oldValues !== undefined && { oldValues: event.oldValues }),
        ...(event.newValues !== undefined && { newValues: event.newValues }),
      },
    });
  }
}
