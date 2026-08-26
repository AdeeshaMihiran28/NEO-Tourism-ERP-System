import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MarketingDealStatus,
  NotificationType,
  WebsitePublicationStatus,
} from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { WebsiteDealPublisher } from '../../integrations/website/website-deal.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

const EXPIRING_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MarketingDealLifecycleService {
  private readonly logger = new Logger(MarketingDealLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly website: WebsiteDealPublisher,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'marketing-deal-lifecycle' })
  async runHourly() {
    try {
      const result = await this.evaluateAllActiveDeals();
      this.logger.log(
        `Marketing deal lifecycle: ${result.evaluated} evaluated, ${result.changed} changed.`,
      );
    } catch (error) {
      this.logger.error(
        'Marketing deal lifecycle failed; it will retry next hour.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async evaluateAllActiveDeals(now = new Date()) {
    const deals = await this.prisma.marketingDeal.findMany({
      where: {
        status: { in: ['SCHEDULED', 'LIVE', 'EXPIRING'] },
      },
    });
    let changed = 0;
    for (const deal of deals) {
      if (await this.evaluateDealStatus(deal.id, now)) changed += 1;
    }
    return { evaluated: deals.length, changed };
  }

  async evaluateDealStatus(id: string, now = new Date()) {
    const deal = await this.prisma.marketingDeal.findUnique({ where: { id } });
    if (
      !deal ||
      deal.status === MarketingDealStatus.SUSPENDED ||
      deal.status === MarketingDealStatus.EXPIRED
    )
      return false;

    if (now >= deal.expiryAt) {
      const claimed = await this.prisma.marketingDeal.updateMany({
        where: { id, status: { notIn: ['EXPIRED', 'SUSPENDED'] } },
        data: {
          status: 'EXPIRED',
          expiredNotificationAt: now,
          websitePublicationStatus: 'PENDING',
        },
      });
      if (claimed.count !== 1) return false;
      await this.audit.log({
        actorUserId: deal.updatedById,
        entityType: 'MarketingDeal',
        entityId: id,
        action: 'MARKETING_DEAL_EXPIRED',
        oldValues: { status: deal.status },
        newValues: { status: 'EXPIRED' },
        metadata: { automated: true },
      });
      const expired = await this.prisma.marketingDeal.findUniqueOrThrow({
        where: { id },
      });
      const result = await this.website.unpublishDeal(expired);
      await this.applyWebsiteResult(id, result, true);
      return true;
    }

    if (
      deal.status === MarketingDealStatus.SCHEDULED &&
      deal.scheduledFor &&
      deal.scheduledFor <= now &&
      deal.approvalStatus === 'APPROVED'
    ) {
      const status =
        deal.expiryAt.getTime() - now.getTime() <= EXPIRING_MS
          ? 'EXPIRING'
          : 'LIVE';
      const live = await this.prisma.marketingDeal.update({
        where: { id },
        data: { status, websitePublicationStatus: 'PENDING' },
      });
      await this.audit.log({
        actorUserId: deal.updatedById,
        entityType: 'MarketingDeal',
        entityId: id,
        action: 'MARKETING_DEAL_LIVE',
        oldValues: { status: deal.status },
        newValues: { status },
        metadata: { automated: true },
      });
      const result = await this.website.publishDeal(live);
      await this.applyWebsiteResult(id, result, false);
      if (status === 'EXPIRING') await this.markExpiring(id, now);
      return true;
    }

    if (
      (deal.status === MarketingDealStatus.LIVE ||
        deal.status === MarketingDealStatus.EXPIRING) &&
      !deal.expiringNotificationAt &&
      deal.expiryAt.getTime() - now.getTime() <= EXPIRING_MS
    ) {
      await this.markExpiring(id, now);
      return true;
    }
    return false;
  }

  private async markExpiring(id: string, now: Date) {
    const deal = await this.prisma.marketingDeal.findUniqueOrThrow({
      where: { id },
    });
    const claimed = await this.prisma.marketingDeal.updateMany({
      where: {
        id,
        expiringNotificationAt: null,
        status: { in: ['LIVE', 'EXPIRING'] },
      },
      data: { status: 'EXPIRING', expiringNotificationAt: now },
    });
    if (claimed.count !== 1) return;
    await this.audit.log({
      actorUserId: deal.updatedById,
      entityType: 'MarketingDeal',
      entityId: id,
      action: 'MARKETING_DEAL_EXPIRING',
      oldValues: { status: deal.status },
      newValues: { status: 'EXPIRING' },
      metadata: { automated: true, thresholdHours: 24 },
    });
    await this.notifications.create({
      userId: deal.createdById,
      type: NotificationType.MARKETING_DEAL_EXPIRING,
      title: 'Deal expiring soon',
      message: `${deal.dealCode} expires within 24 hours.`,
      entityType: 'MarketingDeal',
      entityId: id,
    });
  }

  private async applyWebsiteResult(
    id: string,
    result: { status: string; message?: string },
    unpublish: boolean,
  ) {
    const status =
      result.status === 'SUCCESS'
        ? unpublish
          ? WebsitePublicationStatus.UNPUBLISHED
          : WebsitePublicationStatus.PUBLISHED
        : result.status === 'NOT_CONFIGURED'
          ? WebsitePublicationStatus.NOT_CONFIGURED
          : WebsitePublicationStatus.FAILED;
    await this.prisma.marketingDeal.update({
      where: { id },
      data: {
        websitePublicationStatus: status,
        websiteActionMessage:
          result.status === 'FAILED'
            ? result.message
            : result.status === 'NOT_CONFIGURED'
              ? 'Website publishing API is not configured.'
              : null,
      },
    });
    if (result.status === 'FAILED') {
      const deal = await this.prisma.marketingDeal.findUniqueOrThrow({
        where: { id },
      });
      await this.notifications.create({
        userId: deal.createdById,
        type: NotificationType.MARKETING_DEAL_CHANNEL_FAILURE,
        title: 'Website removal failed',
        message: result.message ?? 'Website removal failed — action required.',
        entityType: 'MarketingDeal',
        entityId: id,
      });
    }
  }
}
