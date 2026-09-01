import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { PulseCrmService } from '../pulse/services/pulse-crm.service';
import { PulsePeriod } from '../pulse/dto/pulse.dto';
import type { SignalQueryDto } from './dto/signal.dto';
import { CampaignPerformanceService } from './services/campaign-performance.service';

@Injectable()
export class SignalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: CampaignPerformanceService,
    private readonly trends: PulseCrmService,
  ) {}
  async get(query: SignalQueryDto, user: AuthenticatedUser) {
    const to = query.dateTo ? new Date(query.dateTo) : new Date(),
      from = query.dateFrom
        ? new Date(query.dateFrom)
        : new Date(to.getTime() - 30 * 86400000);
    const [performance, totalLeads, destinations, trend, meta] =
      await Promise.all([
        this.performance.calculate({
          from,
          to,
          campaignId: query.campaignId,
          dealId: query.dealId,
          channel: query.channel,
        }),
        this.prisma.lead.count({
          where: { createdAt: { gte: from, lte: to } },
        }),
        this.prisma.lead.groupBy({
          by: ['destination'],
          where: {
            createdAt: { gte: from, lte: to },
            destination: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { destination: 'desc' } },
          take: 10,
        }),
        this.trends.get(PulsePeriod.SEVEN_DAYS, to),
        this.prisma.integrationProvider.findUnique({
          where: { type_name: { type: 'META', name: 'Meta Business Suite' } },
          select: { status: true },
        }),
      ]);
    const attributed = performance.attributedLeadIds.length;
    const campaigns = performance.campaigns;
    const content = performance.content;
    const deals = performance.deals;
    const bySales = [...campaigns].sort(
      (a, b) => b.salesMade - a.salesMade || b.enquiries - a.enquiries,
    );
    const byContribution = [...campaigns].sort(
      (a, b) => b.salesContribution - a.salesContribution,
    );
    const contentBySales = [...content].sort(
      (a, b) => b.salesMade - a.salesMade || b.enquiries - a.enquiries,
    );
    return {
      period: { from, to },
      summary: {
        mostEnquiries: destinations[0] ?? null,
        trendingDestination: trend.destinations.find((x) => x.trending) ?? null,
        bestCampaignBySales: bySales[0] ?? null,
        bestContentBySales: contentBySales[0] ?? null,
        highestSalesContribution: byContribution[0] ?? null,
      },
      dataQuality: {
        totalLeads,
        attributedLeads: attributed,
        unattributedLeads: Math.max(0, totalLeads - attributed),
        attributionCoveragePercent: totalLeads
          ? Math.round((attributed / totalLeads) * 10000) / 100
          : 0,
      },
      allCrmEnquiries: destinations.map((x) => ({
        destination: x.destination,
        count: x._count._all,
      })),
      campaignRankings: {
        mostEnquiries: [...campaigns].sort((a, b) => b.enquiries - a.enquiries),
        mostSales: bySales,
        highestSalesContribution: byContribution,
        bestEnquiryToSaleConversion: [...campaigns].sort(
          (a, b) => b.rates.enquiryToSale - a.rates.enquiryToSale,
        ),
      },
      campaigns,
      content,
      deals,
      externalEngagement:
        meta?.status === 'CONNECTED'
          ? {
              status: 'AVAILABLE_FROM_PROVIDER_WHEN_METRICS_SYNCED',
              platformMetrics: [],
            }
          : {
              status: 'UNAVAILABLE',
              message: 'External engagement metrics unavailable.',
            },
      salesContributionVisibility: {
        sellingValue: true,
        supplierCost: user.permissions.includes('finance.view'),
        profit: false,
      },
    };
  }
  async management(query: SignalQueryDto, user: AuthenticatedUser) {
    const base = await this.get(query, user);
    const channels = await this.prisma.marketingAttribution.groupBy({
      by: ['publicationId'],
      where: {
        isActive: true,
        publicationId: { not: null },
        firstTouchAt: { gte: base.period.from, lte: base.period.to },
      },
      _count: { _all: true },
    });
    return {
      ...base,
      management: {
        trackedPublicationCount: channels.length,
        comparisonNote:
          'Business outcomes are grouped by explicit attribution only.',
      },
    };
  }
}
