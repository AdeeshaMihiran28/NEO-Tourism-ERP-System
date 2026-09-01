import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContentService } from '../content/content.service';
import { PulsePeriod } from '../pulse/dto/pulse.dto';
import { PulseCrmService } from '../pulse/services/pulse-crm.service';
import type {
  CreateOpportunityDto,
  OpportunityDealDto,
  OpportunityStatusDto,
} from './dto/radar.dto';

@Injectable()
export class RadarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trends: PulseCrmService,
    private readonly audit: AuditService,
    private readonly content: ContentService,
    private readonly campaigns: CampaignsService,
  ) {}
  async get(now = new Date()) {
    const currentStart = new Date(now.getTime() - 7 * 86400000),
      previousStart = new Date(currentStart.getTime() - 7 * 86400000);
    const [
      trend,
      attributions,
      signals,
      opportunities,
      travelDates,
      dealOptions,
    ] = await Promise.all([
      this.trends.get(PulsePeriod.SEVEN_DAYS, now),
      this.prisma.marketingAttribution.findMany({
        where: {
          isActive: true,
          dealId: { not: null },
          firstTouchAt: { gte: previousStart, lte: now },
        },
        select: {
          dealId: true,
          firstTouchAt: true,
          deal: { select: { id: true, dealCode: true, title: true } },
        },
      }),
      this.prisma.marketingSalesSignal.findMany({
        where: { status: { in: ['NEW', 'REVIEWED'] } },
        select: {
          id: true,
          signalType: true,
          title: true,
          description: true,
          destination: true,
          priority: true,
          status: true,
          createdAt: true,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      this.prisma.marketingOpportunity.findMany({
        include: {
          campaign: { select: { id: true, campaignCode: true, name: true } },
          content: { select: { id: true, contentCode: true, title: true } },
          deal: { select: { id: true, dealCode: true, title: true } },
          assignedUser: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 50,
      }),
      this.prisma.lead.findMany({
        where: {
          travelDate: { not: null },
          createdAt: { gte: previousStart, lte: now },
        },
        select: { travelDate: true },
      }),
      this.prisma.marketingDeal.findMany({
        where: { status: { not: 'EXPIRED' } },
        select: { id: true, dealCode: true, title: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    ]);
    const dealMap = new Map<
      string,
      {
        id: string;
        dealCode: string;
        title: string;
        current: number;
        previous: number;
      }
    >();
    for (const x of attributions) {
      if (!x.deal) continue;
      const row = dealMap.get(x.deal.id) ?? {
        ...x.deal,
        current: 0,
        previous: 0,
      };
      if (x.firstTouchAt >= currentStart) row.current++;
      else row.previous++;
      dealMap.set(x.deal.id, row);
    }
    const highInterestDeals = [...dealMap.values()]
      .map((x) => ({
        ...x,
        growthPercent: x.previous
          ? Math.round(((x.current - x.previous) / x.previous) * 100)
          : x.current
            ? 100
            : 0,
      }))
      .filter((x) => x.current > 0)
      .sort(
        (a, b) => b.growthPercent - a.growthPercent || b.current - a.current,
      );
    const minimum = Math.max(
        1,
        Number(process.env.MARKETING_OPPORTUNITY_MIN_ENQUIRIES ?? 10),
      ),
      growth = Math.max(
        1,
        Number(process.env.MARKETING_OPPORTUNITY_MIN_GROWTH_PERCENT ?? 25),
      );
    const suggestions = trend.destinations
      .filter(
        (x) =>
          x.currentPeriodEnquiries >= minimum &&
          x.growthPercent !== null &&
          x.growthPercent >= growth,
      )
      .map((x) => ({
        sourceType: 'CRM_TREND',
        sourceReferenceId: `destination:${x.destination.toLowerCase()}`,
        title: `Respond to rising ${x.destination} demand`,
        description: `${x.currentPeriodEnquiries} enquiries in the current seven days, ${x.growthPercent}% growth versus the previous period.`,
        destination: x.destination,
        priority: x.growthPercent! >= 75 ? 'HIGH' : 'NORMAL',
        deterministic: true,
      }));
    return {
      risingDestinations: trend.destinations.filter((x) => x.trending),
      travelPeriodTrends: travelBuckets(
        travelDates.map((x) => x.travelDate!),
        now,
      ),
      highInterestDeals,
      dealOptions,
      salesSignals: {
        new: signals.filter((x) => x.status === 'NEW').length,
        highPriority: signals.filter(
          (x) => x.priority === 'HIGH' || x.priority === 'URGENT',
        ).length,
        contentRequests: signals.filter(
          (x) => x.signalType === 'CONTENT_REQUEST',
        ).length,
        offerRequests: signals.filter((x) => x.signalType === 'OFFER_REQUEST')
          .length,
        customerQuestions: signals.filter(
          (x) => x.signalType === 'CUSTOMER_QUESTION',
        ).length,
        destinationInterest: signals.filter(
          (x) => x.signalType === 'DESTINATION_INTEREST',
        ).length,
        items: signals,
      },
      opportunityThresholds: {
        minimumEnquiries: minimum,
        minimumGrowthPercent: growth,
      },
      suggestedOpportunities: suggestions,
      opportunities,
    };
  }
  async create(
    dto: CreateOpportunityDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    if (dto.sourceReferenceId) {
      const existing = await this.prisma.marketingOpportunity.findFirst({
        where: {
          sourceType: dto.sourceType,
          sourceReferenceId: dto.sourceReferenceId,
          status: { not: 'DISMISSED' },
        },
      });
      if (existing)
        throw new ConflictException(
          'An active opportunity already exists for this source.',
        );
    }
    const created = await this.prisma.marketingOpportunity.create({
      data: { ...dto, createdByUserId: actorId },
    });
    await this.log(
      'MARKETING_OPPORTUNITY_CREATED',
      created.id,
      actorId,
      undefined,
      {
        sourceType: created.sourceType,
        title: created.title,
        destination: created.destination,
      },
      requestMetadata,
    );
    return created;
  }
  async status(
    id: string,
    dto: OpportunityStatusDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const current = await this.find(id);
    const updated = await this.prisma.marketingOpportunity.update({
      where: { id },
      data: { status: dto.status },
    });
    const action =
      dto.status === 'ACCEPTED'
        ? 'MARKETING_OPPORTUNITY_ACCEPTED'
        : dto.status === 'ACTIONED'
          ? 'MARKETING_OPPORTUNITY_ACTIONED'
          : dto.status === 'DISMISSED'
            ? 'MARKETING_OPPORTUNITY_DISMISSED'
            : 'MARKETING_OPPORTUNITY_UPDATED';
    await this.log(
      action,
      id,
      actorId,
      { status: current.status },
      { status: updated.status },
      requestMetadata,
    );
    return updated;
  }
  async createContent(
    id: string,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const opportunity = await this.find(id);
    if (opportunity.status === 'DISMISSED')
      throw new ConflictException(
        'Dismissed opportunities cannot create content.',
      );
    const created = await this.content.create(
      {
        title: opportunity.title,
        description: `Opportunity context: ${opportunity.description}${opportunity.destination ? ` Destination: ${opportunity.destination}.` : ''}`,
        contentType: 'OTHER',
        campaignId: opportunity.campaignId ?? undefined,
        dealId: opportunity.dealId ?? undefined,
        assignedUserId: opportunity.assignedUserId ?? actorId,
        priority: opportunity.priority,
      },
      actorId,
    );
    await this.prisma.marketingOpportunity.update({
      where: { id },
      data: { contentId: created.id, status: 'ACTIONED' },
    });
    await this.log(
      'MARKETING_OPPORTUNITY_ACTIONED',
      id,
      actorId,
      { contentId: opportunity.contentId },
      { contentId: created.id, status: 'ACTIONED' },
      requestMetadata,
    );
    return created;
  }
  async createCampaign(
    id: string,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const opportunity = await this.find(id);
    if (opportunity.status === 'DISMISSED')
      throw new ConflictException(
        'Dismissed opportunities cannot create a campaign.',
      );
    const created = await this.campaigns.create(
      {
        name: opportunity.title,
        description: `Opportunity context: ${opportunity.description}`,
        objective: opportunity.destination
          ? `Respond to measured demand for ${opportunity.destination}`
          : 'Respond to measured customer demand',
        status: 'PLANNED',
        ownerUserId: opportunity.assignedUserId ?? actorId,
        dealId: opportunity.dealId ?? undefined,
      },
      actorId,
    );
    await this.prisma.marketingOpportunity.update({
      where: { id },
      data: { campaignId: created.id, status: 'ACTIONED' },
    });
    await this.log(
      'MARKETING_OPPORTUNITY_ACTIONED',
      id,
      actorId,
      { campaignId: opportunity.campaignId },
      { campaignId: created.id, status: 'ACTIONED' },
      requestMetadata,
    );
    return created;
  }
  async linkDeal(
    id: string,
    dto: OpportunityDealDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const [opportunity, deal] = await Promise.all([
      this.find(id),
      this.prisma.marketingDeal.findUnique({ where: { id: dto.dealId } }),
    ]);
    if (!deal) throw new NotFoundException('Marketing Deal not found.');
    const updated = await this.prisma.marketingOpportunity.update({
      where: { id },
      data: { dealId: deal.id, status: 'ACTIONED' },
    });
    await this.log(
      'MARKETING_OPPORTUNITY_ACTIONED',
      id,
      actorId,
      { dealId: opportunity.dealId },
      { dealId: deal.id, status: 'ACTIONED' },
      requestMetadata,
    );
    return updated;
  }
  private async find(id: string) {
    const result = await this.prisma.marketingOpportunity.findUnique({
      where: { id },
    });
    if (!result)
      throw new NotFoundException('Marketing opportunity not found.');
    return result;
  }
  private log(
    action: string,
    entityId: string,
    actorUserId: string,
    oldValues: Record<string, unknown> | undefined,
    newValues: Record<string, unknown>,
    requestMetadata?: RequestMetadata,
  ) {
    return this.audit.log({
      action,
      entityType: 'MarketingOpportunity',
      entityId,
      actorUserId,
      oldValues: oldValues as never,
      newValues: newValues as never,
      requestMetadata,
    });
  }
}
function travelBuckets(dates: Date[], now: Date) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const buckets = { upcoming30Days: 0, days31To60: 0, days61To90: 0, later: 0 };
  for (const date of dates) {
    const days = Math.floor((date.getTime() - start.getTime()) / 86400000);
    if (days >= 0 && days <= 30) buckets.upcoming30Days++;
    else if (days <= 60 && days > 30) buckets.days31To60++;
    else if (days <= 90 && days > 60) buckets.days61To90++;
    else if (days > 90) buckets.later++;
  }
  return buckets;
}
