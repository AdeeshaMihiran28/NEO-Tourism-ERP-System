import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { MarketingAlertsService } from '../calendar/services/marketing-alerts.service';
import { MarketingCalendarService } from '../calendar/services/marketing-calendar.service';
import { PulsePeriod } from './dto/pulse.dto';
import { PulseCrmService } from './services/pulse-crm.service';
import { PulseWorkloadService } from './services/pulse-workload.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PulseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: MarketingAlertsService,
    private readonly calendar: MarketingCalendarService,
    private readonly crm: PulseCrmService,
    private readonly workload: PulseWorkloadService,
  ) {}
  async get(period: PulsePeriod, user: AuthenticatedUser, now = new Date()) {
    const can = (permission: string) => user.permissions.includes(permission);
    const result: Record<string, unknown> = { generatedAt: now, period };
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrow = new Date(today.getTime() + 86400000);
    const next7 = new Date(today.getTime() + 7 * 86400000);
    const jobs: Promise<void>[] = [];
    if (can('marketing.deal.view'))
      jobs.push(
        this.deals(now, today).then((x) => {
          result.deals = x;
        }),
      );
    if (can('marketing.content.view')) {
      jobs.push(
        this.campaigns(now).then((x) => {
          result.campaigns = x;
        }),
      );
      jobs.push(
        this.content(today, tomorrow).then((x) => {
          result.content = x;
        }),
      );
    }
    if (can('marketing.approval.view'))
      jobs.push(
        this.approvals(now).then((x) => {
          result.approvals = x;
        }),
      );
    if (can('marketing.calendar.view'))
      jobs.push(
        this.calendar
          .findAll({
            dateFrom: today.toISOString(),
            dateTo: next7.toISOString(),
          })
          .then((events) => {
            result.calendar = {
              today: events.filter(
                (x) => x.startAt >= today && x.startAt < tomorrow,
              ),
              tomorrow: events.filter(
                (x) =>
                  x.startAt >= tomorrow &&
                  x.startAt < new Date(tomorrow.getTime() + 86400000),
              ),
              next7Days: events.slice(0, 20),
              total: events.length,
            };
          }),
      );
    if (can('marketing.alert.view'))
      jobs.push(
        this.alerts.getAlerts(now).then((x) => {
          result.alerts = x
            .sort((a, b) => severity(b.severity) - severity(a.severity))
            .slice(0, 8);
        }),
      );
    if (can('lead.view'))
      jobs.push(
        this.crm.get(period, now).then((x) => {
          result.crm = x;
        }),
      );
    if (can('marketing.workload.view'))
      jobs.push(
        this.workload.get(now).then((x) => {
          result.workload = x;
        }),
      );
    if (can('marketing.sales_signal.view'))
      jobs.push(
        this.salesSignals().then((x) => {
          result.salesSignals = x;
        }),
      );
    await Promise.all(jobs);
    return result;
  }
  private async deals(now: Date, today: Date) {
    const in24 = new Date(now.getTime() + 86400000),
      in3 = new Date(now.getTime() + 3 * 86400000),
      recent = new Date(today.getTime() - 3 * 86400000),
      suspendedSince = new Date(now.getTime() - 7 * 86400000);
    const [
      groups,
      live,
      within24,
      within3,
      recentlyExpired,
      suspended,
      websites,
    ] = await Promise.all([
      this.prisma.marketingDeal.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.marketingDeal.findMany({
        where: { status: 'LIVE' },
        select: {
          id: true,
          dealCode: true,
          title: true,
          destination: true,
          price: true,
          currency: true,
          expiryAt: true,
          websitePublicationStatus: true,
          channels: { select: { channel: true, status: true } },
        },
        orderBy: { expiryAt: 'asc' },
        take: 8,
      }),
      this.prisma.marketingDeal.findMany({
        where: {
          expiryAt: { gt: now, lte: in24 },
          status: { in: ['LIVE', 'SCHEDULED', 'EXPIRING'] },
        },
        select: {
          id: true,
          dealCode: true,
          title: true,
          destination: true,
          expiryAt: true,
        },
        orderBy: { expiryAt: 'asc' },
      }),
      this.prisma.marketingDeal.findMany({
        where: {
          expiryAt: { gt: in24, lte: in3 },
          status: { in: ['LIVE', 'SCHEDULED', 'EXPIRING'] },
        },
        select: {
          id: true,
          dealCode: true,
          title: true,
          destination: true,
          expiryAt: true,
        },
        orderBy: { expiryAt: 'asc' },
      }),
      this.prisma.marketingDeal.findMany({
        where: { expiryAt: { gte: recent, lte: now }, status: 'EXPIRED' },
        select: {
          id: true,
          dealCode: true,
          title: true,
          destination: true,
          expiryAt: true,
        },
        orderBy: { expiryAt: 'desc' },
        take: 10,
      }),
      this.prisma.marketingDeal.findMany({
        where: { status: 'SUSPENDED', suspendedAt: { gte: suspendedSince } },
        select: {
          id: true,
          dealCode: true,
          title: true,
          destination: true,
          suspensionReason: true,
          suspendedAt: true,
          suspendedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { suspendedAt: 'desc' },
        take: 10,
      }),
      this.prisma.marketingDeal.groupBy({
        by: ['websitePublicationStatus'],
        where: { status: { in: ['LIVE', 'SCHEDULED', 'EXPIRING'] } },
        _count: { _all: true },
      }),
    ]);
    const counts = Object.fromEntries(
      ['DRAFT', 'SCHEDULED', 'LIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED'].map(
        (k) => [k, groups.find((x) => x.status === k)?._count._all ?? 0],
      ),
    );
    return {
      counts,
      liveDeals: live,
      attention: {
        within24Hours: within24,
        within3Days: within3,
        recentlyExpired,
        suspended,
      },
      websiteStatus: Object.fromEntries(
        websites.map((x) => [x.websitePublicationStatus, x._count._all]),
      ),
    };
  }
  private async campaigns(now: Date) {
    const soon = new Date(now.getTime() + 7 * 86400000);
    const [groups, endingSoon] = await Promise.all([
      this.prisma.marketingCampaign.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.marketingCampaign.findMany({
        where: {
          endDate: { gt: now, lte: soon },
          status: { in: ['ACTIVE', 'PLANNED'] },
        },
        select: {
          id: true,
          campaignCode: true,
          name: true,
          endDate: true,
          status: true,
        },
        orderBy: { endDate: 'asc' },
        take: 10,
      }),
    ]);
    const count = (s: string) =>
      groups.find((x) => x.status === s)?._count._all ?? 0;
    return {
      planned: count('PLANNED'),
      active: count('ACTIVE'),
      paused: count('PAUSED'),
      endingSoon,
    };
  }
  private async content(today: Date, tomorrow: Date) {
    const nextDay = new Date(tomorrow.getTime() + 86400000);
    const [groups, attention, ready] = await Promise.all([
      this.prisma.marketingContent.groupBy({
        by: ['stage'],
        _count: { _all: true },
      }),
      this.prisma.marketingContent.findMany({
        where: {
          stage: { notIn: ['LIVE', 'CANCELLED', 'ARCHIVED'] },
          OR: [{ deadline: { lt: nextDay } }, { priority: 'URGENT' }],
        },
        select: {
          id: true,
          contentCode: true,
          title: true,
          stage: true,
          deadline: true,
          priority: true,
          assignedUser: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: [{ deadline: 'asc' }, { priority: 'desc' }],
        take: 30,
      }),
      this.prisma.marketingContent.findMany({
        where: {
          stage: 'READY',
          currentVersionId: { not: null },
          approvals: { some: { status: 'APPROVED' } },
        },
        include: {
          approvals: {
            where: { status: 'APPROVED' },
            select: { contentVersionId: true },
          },
          campaign: { select: { id: true, name: true } },
          deal: { select: { id: true, dealCode: true, title: true } },
          assignedUser: {
            select: { id: true, firstName: true, lastName: true },
          },
          publications: {
            where: { status: { in: ['DRAFT', 'SCHEDULED'] } },
            select: { channel: true, status: true, scheduledAt: true },
          },
        },
        orderBy: { deadline: 'asc' },
        take: 20,
      }),
    ]);
    const validReady = ready.filter((x) =>
      x.approvals.some((a) => a.contentVersionId === x.currentVersionId),
    );
    const count = (s: string) =>
      groups.find((x) => x.stage === s)?._count._all ?? 0;
    return {
      counts: {
        IDEA: count('IDEA'),
        CREATING: count('CREATING'),
        REVIEW: count('REVIEW'),
        READY: count('READY'),
        LIVE: count('LIVE'),
      },
      inProduction: count('CREATING') + count('REVIEW'),
      overdue: attention.filter((x) => x.deadline && x.deadline < today),
      dueToday: attention.filter(
        (x) => x.deadline && x.deadline >= today && x.deadline < tomorrow,
      ),
      dueTomorrow: attention.filter(
        (x) => x.deadline && x.deadline >= tomorrow && x.deadline < nextDay,
      ),
      urgent: attention.filter((x) => x.priority === 'URGENT'),
      readyToPublish: validReady,
    };
  }
  private async approvals(now: Date) {
    const [creative, deals] = await Promise.all([
      this.prisma.marketingContentApproval.findMany({
        where: { status: 'PENDING' },
        select: {
          id: true,
          requestedAt: true,
          content: { select: { id: true, contentCode: true, title: true } },
          requestedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { requestedAt: 'asc' },
        take: 20,
      }),
      this.prisma.marketingDeal.findMany({
        where: { approvalStatus: 'PENDING_APPROVAL' },
        select: { id: true, dealCode: true, title: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
        take: 20,
      }),
    ]);
    const items = [
      ...creative.map((x) => ({
        type: 'CREATIVE',
        id: x.id,
        title: x.content.title,
        entityId: x.content.id,
        waitingSince: x.requestedAt,
        ...age(x.requestedAt, now),
      })),
      ...deals.map((x) => ({
        type: 'DEAL',
        id: x.id,
        title: x.title,
        entityId: x.id,
        waitingSince: x.updatedAt,
        ...age(x.updatedAt, now),
      })),
    ].sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime());
    return {
      pendingCreative: creative.length,
      pendingDeals: deals.length,
      ageing: {
        under24Hours: items.filter((x) => x.ageBucket === 'UNDER_24_HOURS')
          .length,
        oneToTwoDays: items.filter((x) => x.ageBucket === 'ONE_TO_TWO_DAYS')
          .length,
        threePlusDays: items.filter((x) => x.ageBucket === 'THREE_PLUS_DAYS')
          .length,
      },
      items,
    };
  }
  private async salesSignals() {
    const [groups, priority, recent, destinations] = await Promise.all([
      this.prisma.marketingSalesSignal.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.marketingSalesSignal.count({
        where: { status: 'NEW', priority: { in: ['HIGH', 'URGENT'] } },
      }),
      this.prisma.marketingSalesSignal.findMany({
        where: { status: { in: ['NEW', 'REVIEWED'] } },
        select: {
          id: true,
          title: true,
          signalType: true,
          priority: true,
          status: true,
          destination: true,
          createdAt: true,
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 8,
      }),
      this.prisma.marketingSalesSignal.groupBy({
        by: ['destination'],
        where: {
          destination: { not: null },
          status: { in: ['NEW', 'REVIEWED'] },
        },
        _count: { _all: true },
        orderBy: { _count: { destination: 'desc' } },
        take: 5,
      }),
    ]);
    return {
      new: groups.find((x) => x.status === 'NEW')?._count._all ?? 0,
      highPriority: priority,
      recent,
      topDestinations: destinations.map((x) => ({
        destination: x.destination,
        count: x._count._all,
      })),
    };
  }
}
function age(value: Date, now: Date) {
  const hours = Math.floor((now.getTime() - value.getTime()) / 3600000);
  return {
    waitingHours: Math.max(0, hours),
    ageBucket:
      hours >= 72
        ? 'THREE_PLUS_DAYS'
        : hours >= 24
          ? 'ONE_TO_TWO_DAYS'
          : 'UNDER_24_HOURS',
    needsAttention: hours >= 72,
  };
}
function severity(value: string) {
  return value === 'URGENT' ? 3 : value === 'WARNING' ? 2 : 1;
}
