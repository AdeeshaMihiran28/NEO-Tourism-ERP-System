import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationType } from '../../../generated/prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NeoTrioDeadlineScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Interval(60 * 60 * 1000)
  async notifyDueSoon(now = new Date()) {
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const productions = await this.prisma.neoTrioProduction.findMany({
      where: {
        assignedUserId: { not: null },
        deadline: { gte: now, lte: nextDay },
        stage: { notIn: ['PUBLISHED', 'CANCELLED', 'ARCHIVED'] },
      },
    });
    for (const item of productions) {
      const exists = await this.prisma.notification.findFirst({
        where: {
          userId: item.assignedUserId!,
          type: NotificationType.NEOTRIO_PRODUCTION_DEADLINE,
          entityType: 'NeoTrioProduction',
          entityId: item.id,
          isRead: false,
        },
      });
      if (!exists)
        await this.notifications.create({
          userId: item.assignedUserId!,
          type: NotificationType.NEOTRIO_PRODUCTION_DEADLINE,
          title: 'NeoTrio deadline approaching',
          message: `${item.productionCode}: ${item.title}`,
          entityType: 'NeoTrioProduction',
          entityId: item.id,
        });
    }
    return productions.length;
  }
}
