import { Injectable } from '@nestjs/common';
import {
  FollowUpStatus,
  FollowUpType,
  LeadStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { dashboardDateRange, todayUtc } from './dashboard-date-range';

const ACTIVE_LEAD_STATUSES = [
  LeadStatus.NEW,
  LeadStatus.HANDLING,
  LeadStatus.QUOTING,
  LeadStatus.FOLLOW_UP,
  LeadStatus.CALLBACK,
  LeadStatus.GOING_TO_BOOK,
];
const ELIGIBLE_LEAD_STATUSES = [...ACTIVE_LEAD_STATUSES, LeadStatus.SALE_MADE];

@Injectable()
export class SalesDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: DashboardQueryDto, assignedUserId?: string) {
    const { from, to } = dashboardDateRange(query);
    const today = todayUtc();
    const scope: Prisma.LeadWhereInput = assignedUserId
      ? { assignedUserId }
      : {};
    const createdRange = { createdAt: { gte: from, lte: to } };
    const [
      liveNewLeads,
      activeLeads,
      attentionLeads,
      callbacksDueToday,
      missedCallbacks,
      quoting,
      goingToBook,
      salesMade,
      totalLeads,
      eligibleLeads,
      pipelineRows,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          ...scope,
          status: LeadStatus.NEW,
          ...(assignedUserId ? {} : { assignedUserId: null }),
        },
      }),
      this.prisma.lead.count({
        where: { ...scope, status: { in: ACTIVE_LEAD_STATUSES } },
      }),
      this.prisma.lead.count({
        where: {
          ...scope,
          status: { in: ACTIVE_LEAD_STATUSES },
          isAttentionRequired: true,
        },
      }),
      this.prisma.followUp.count({
        where: {
          ...(assignedUserId && { assignedUserId }),
          type: FollowUpType.CALLBACK,
          status: FollowUpStatus.SCHEDULED,
          scheduledAt: { gte: today.start, lte: today.end },
        },
      }),
      this.prisma.followUp.count({
        where: {
          ...(assignedUserId && { assignedUserId }),
          type: FollowUpType.CALLBACK,
          status: FollowUpStatus.MISSED,
        },
      }),
      this.prisma.lead.count({
        where: { ...scope, status: LeadStatus.QUOTING },
      }),
      this.prisma.lead.count({
        where: { ...scope, status: LeadStatus.GOING_TO_BOOK },
      }),
      this.prisma.lead.count({
        where: { ...scope, status: LeadStatus.SALE_MADE, ...createdRange },
      }),
      this.prisma.lead.count({ where: { ...scope, ...createdRange } }),
      this.prisma.lead.count({
        where: {
          ...scope,
          status: { in: ELIGIBLE_LEAD_STATUSES },
          ...createdRange,
        },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: {
          ...scope,
          status: { in: ELIGIBLE_LEAD_STATUSES },
          ...createdRange,
        },
        _count: { _all: true },
      }),
    ]);
    const now = Date.now();
    const ageing = await Promise.all([
      this.ageing(scope, new Date(now - 2 * 86_400_000), undefined),
      this.ageing(
        scope,
        new Date(now - 4 * 86_400_000),
        new Date(now - 2 * 86_400_000),
      ),
      this.ageing(
        scope,
        new Date(now - 8 * 86_400_000),
        new Date(now - 4 * 86_400_000),
      ),
      this.ageing(scope, undefined, new Date(now - 8 * 86_400_000)),
    ]);
    return {
      period: { from, to },
      kpis: {
        liveNewLeads,
        activeLeads,
        attentionLeads,
        callbacksDueToday,
        missedCallbacks,
        quoting,
        goingToBook,
        salesMade,
      },
      conversion: {
        totalLeads,
        eligibleLeads,
        saleMadeCount: salesMade,
        conversionRate: eligibleLeads
          ? Number(((salesMade / eligibleLeads) * 100).toFixed(2))
          : 0,
        definition:
          'SALE_MADE leads divided by eligible active-or-sold leads created in the selected period.',
      },
      ageing: {
        zeroToOneDays: ageing[0],
        twoToThreeDays: ageing[1],
        fourToSevenDays: ageing[2],
        eightPlusDays: ageing[3],
      },
      pipeline: Object.fromEntries(
        ELIGIBLE_LEAD_STATUSES.map((status) => [
          status,
          pipelineRows.find((row) => row.status === status)?._count._all ?? 0,
        ]),
      ),
    };
  }

  private ageing(scope: Prisma.LeadWhereInput, gte?: Date, lt?: Date) {
    return this.prisma.lead.count({
      where: {
        ...scope,
        status: { in: ACTIVE_LEAD_STATUSES },
        createdAt: { ...(gte && { gte }), ...(lt && { lt }) },
      },
    });
  }
}
