import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType } from '../../../generated/prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContentDeadlineScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'marketing-content-deadlines',
  })
  async evaluate(now = new Date()) {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const soon = new Date(today.getTime() + 3 * 86400000);
    const content = await this.prisma.marketingContent.findMany({
      where: {
        deadline: { not: null, lte: soon },
        stage: { notIn: ['LIVE', 'ARCHIVED', 'CANCELLED'] },
      },
    });
    let created = 0;
    for (const item of content) {
      const userId = item.assignedUserId ?? item.createdById;
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: NotificationType.MARKETING_CONTENT_DEADLINE,
          entityType: 'MarketingContent',
          entityId: item.id,
          createdAt: { gte: today },
        },
      });
      if (existing) continue;
      await this.notifications.create({
        userId,
        type: NotificationType.MARKETING_CONTENT_DEADLINE,
        title:
          item.deadline! < today
            ? 'Creative content overdue'
            : 'Creative deadline approaching',
        message: `${item.contentCode}: ${item.title}`,
        entityType: 'MarketingContent',
        entityId: item.id,
      });
      created += 1;
    }
    return { evaluated: content.length, notificationsCreated: created };
  }
}
