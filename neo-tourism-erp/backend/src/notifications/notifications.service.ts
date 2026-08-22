import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationQueryDto } from './dto/notification-query.dto';

export interface NotificationEvent {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    event: NotificationEvent,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    return client.notification.create({ data: event });
  }

  async findAllForUser(userId: string, query: NotificationQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.isRead !== undefined && { isRead: query.isRead }),
      ...(query.type && { type: query.type }),
    };
    const skip = (query.page - 1) * query.limit;
    const total = await this.prisma.notification.count({ where });
    const data = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: query.limit,
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return {
      data,
      unreadCount,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async markAsRead(userId: string, id: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Notification not found.');
    }

    return this.prisma.notification.findUniqueOrThrow({ where: { id } });
  }

  async markAllAsRead(userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updatedCount: updated.count };
  }
}
