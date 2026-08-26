import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType } from '../../../../generated/prisma/client';
import { NotificationsService } from '../../../notifications/notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';

type Alert = {
  type: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'URGENT';
  relatedEntityType: string | null;
  relatedEntityId: string | null;
};

@Injectable()
export class MarketingAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getAlerts(now = new Date()): Promise<Alert[]> {
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrow = new Date(day.getTime() + 86400000);
    const nextDay = new Date(day.getTime() + 2 * 86400000);
    const in24h = new Date(now.getTime() + 86400000);
    const [deals, ready, overdue, campaigns, scheduled] = await Promise.all([
      this.prisma.marketingDeal.findMany({
        where: {
          expiryAt: { gt: now, lte: in24h },
          status: { in: ['LIVE', 'SCHEDULED', 'EXPIRING'] },
        },
      }),
      this.prisma.marketingContent.findMany({
        where: {
          stage: 'READY',
          currentVersionId: { not: null },
          approvals: { some: { status: 'APPROVED' } },
        },
        include: { approvals: { where: { status: 'APPROVED' } } },
      }),
      this.prisma.marketingContent.findMany({
        where: {
          deadline: { lt: day },
          stage: { notIn: ['LIVE', 'ARCHIVED', 'CANCELLED'] },
        },
      }),
      this.prisma.marketingCampaign.findMany({
        where: {
          startDate: { gte: tomorrow, lt: nextDay },
          status: { in: ['PLANNED', 'DRAFT'] },
        },
      }),
      this.prisma.marketingPublication.count({
        where: {
          scheduledAt: { gte: tomorrow, lt: nextDay },
          status: 'SCHEDULED',
        },
      }),
    ]);
    const alerts: Alert[] = [];
    for (const deal of deals)
      alerts.push({
        type: 'DEAL_EXPIRING',
        title: 'Offer expiring soon',
        message: `${deal.title} expires within 24 hours.`,
        severity: 'URGENT',
        relatedEntityType: 'MarketingDeal',
        relatedEntityId: deal.id,
      });
    const approvedReady = ready.filter((item) =>
      item.approvals.some(
        (approval) => approval.contentVersionId === item.currentVersionId,
      ),
    );
    if (approvedReady.length)
      alerts.push({
        type: 'READY_TO_PUBLISH',
        title: 'Approved creatives ready',
        message: `${approvedReady.length} approved creative${approvedReady.length === 1 ? ' is' : 's are'} ready to publish.`,
        severity: 'INFO',
        relatedEntityType: 'MarketingContent',
        relatedEntityId: null,
      });
    for (const item of overdue)
      alerts.push({
        type: 'CONTENT_OVERDUE',
        title: 'Content overdue',
        message: `${item.title} is past its creative deadline.`,
        severity: 'WARNING',
        relatedEntityType: 'MarketingContent',
        relatedEntityId: item.id,
      });
    for (const campaign of campaigns)
      alerts.push({
        type: 'CAMPAIGN_STARTING',
        title: 'Campaign starts tomorrow',
        message: `${campaign.name} starts tomorrow.`,
        severity: 'INFO',
        relatedEntityType: 'MarketingCampaign',
        relatedEntityId: campaign.id,
      });
    const requiredDays = (process.env.MARKETING_CONTENT_COVERAGE_DAYS ?? '')
      .split(',')
      .map(Number)
      .filter((x) => x >= 1 && x <= 7);
    const isoTomorrow = tomorrow.getUTCDay() === 0 ? 7 : tomorrow.getUTCDay();
    if (requiredDays.includes(isoTomorrow) && scheduled === 0)
      alerts.push({
        type: 'CONTENT_GAP',
        title: 'No content scheduled',
        message: `No content is scheduled for ${tomorrow.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}.`,
        severity: 'WARNING',
        relatedEntityType: null,
        relatedEntityId: null,
      });
    return alerts;
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'marketing-calendar-alerts' })
  async notify(now = new Date()) {
    const alerts = await this.getAlerts(now);
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const managers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              permissions: {
                some: { permission: { code: 'marketing.alert.view' } },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    let created = 0;
    for (const user of managers)
      for (const alert of alerts) {
        const type = this.notificationType(alert.type);
        const existing = await this.prisma.notification.findFirst({
          where: {
            userId: user.id,
            type,
            entityType: alert.relatedEntityType,
            entityId: alert.relatedEntityId,
            createdAt: { gte: since },
          },
        });
        if (existing) continue;
        await this.notifications.create({
          userId: user.id,
          type,
          title: alert.title,
          message: alert.message,
          entityType: alert.relatedEntityType ?? undefined,
          entityId: alert.relatedEntityId ?? undefined,
          metadata: { alertType: alert.type },
        });
        created++;
      }
    return { evaluated: alerts.length, notificationsCreated: created };
  }
  private notificationType(type: string) {
    if (type === 'DEAL_EXPIRING')
      return NotificationType.MARKETING_DEAL_EXPIRING;
    if (type === 'READY_TO_PUBLISH')
      return NotificationType.MARKETING_READY_TO_PUBLISH;
    if (type === 'CONTENT_OVERDUE')
      return NotificationType.MARKETING_CONTENT_OVERDUE;
    if (type === 'CAMPAIGN_STARTING')
      return NotificationType.MARKETING_CAMPAIGN_STARTING;
    return NotificationType.MARKETING_CONTENT_GAP;
  }
}
