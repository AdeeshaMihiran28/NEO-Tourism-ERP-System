import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MarketingPriority,
  NotificationType,
} from '../../../../generated/prisma/client';
import { AuditService } from '../../../audit/audit.service';
import type { RequestMetadata } from '../../../common/request-metadata';
import { NotificationsService } from '../../../notifications/notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  CreateSalesSignalDto,
  SalesSignalQueryDto,
  UpdateSalesSignalDto,
} from '../dto/pulse.dto';

@Injectable()
export class SalesSignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}
  async create(
    dto: CreateSalesSignalDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    let customerId = dto.customerId;
    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: dto.leadId },
        select: { customerId: true, destination: true },
      });
      if (!lead) throw new NotFoundException('Lead not found.');
      customerId ??= lead.customerId;
      dto.destination ??= lead.destination ?? undefined;
    }
    const signal = await this.prisma.marketingSalesSignal.create({
      data: { ...dto, customerId, createdByUserId: actorId },
    });
    await this.audit.log({
      actorUserId: actorId,
      action: 'MARKETING_SALES_SIGNAL_CREATED',
      entityType: 'MarketingSalesSignal',
      entityId: signal.id,
      newValues: {
        signalType: signal.signalType,
        title: signal.title,
        priority: signal.priority,
        status: signal.status,
      },
      requestMetadata,
    });
    if (
      signal.priority === MarketingPriority.HIGH ||
      signal.priority === MarketingPriority.URGENT
    ) {
      const recipients = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: {
            some: {
              role: {
                permissions: {
                  some: { permission: { code: 'marketing.sales_signal.view' } },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      await Promise.all(
        recipients.map((user) =>
          this.notifications.create({
            userId: user.id,
            type: NotificationType.MARKETING_SALES_SIGNAL,
            title: 'High-priority Sales signal',
            message: signal.title,
            entityType: 'MarketingSalesSignal',
            entityId: signal.id,
          }),
        ),
      );
    }
    return signal;
  }
  async list(query: SalesSignalQueryDto) {
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await Promise.all([
      this.prisma.marketingSalesSignal.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, destination: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.marketingSalesSignal.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async update(
    id: string,
    dto: UpdateSalesSignalDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const current = await this.prisma.marketingSalesSignal.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Sales signal not found.');
    const updated = await this.prisma.marketingSalesSignal.update({
      where: { id },
      data: { status: dto.status },
    });
    const action =
      dto.status === 'ACTIONED'
        ? 'MARKETING_SALES_SIGNAL_ACTIONED'
        : dto.status === 'DISMISSED'
          ? 'MARKETING_SALES_SIGNAL_DISMISSED'
          : 'MARKETING_SALES_SIGNAL_UPDATED';
    await this.audit.log({
      actorUserId: actorId,
      action,
      entityType: 'MarketingSalesSignal',
      entityId: id,
      oldValues: { status: current.status },
      newValues: { status: updated.status },
      requestMetadata,
    });
    return updated;
  }
}
