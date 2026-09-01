import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type MarketingChannel,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type PerformanceFilter = {
  from: Date;
  to: Date;
  campaignId?: string;
  dealId?: string;
  channel?: MarketingChannel;
};
@Injectable()
export class CampaignPerformanceService {
  constructor(private readonly prisma: PrismaService) {}
  async calculate(filter: PerformanceFilter) {
    const attributions = await this.prisma.marketingAttribution.findMany({
      where: {
        isActive: true,
        confidence: { not: 'UNATTRIBUTED' },
        firstTouchAt: { gte: filter.from, lte: filter.to },
        ...(filter.campaignId && { campaignId: filter.campaignId }),
        ...(filter.dealId && { dealId: filter.dealId }),
        ...(filter.channel && { publication: { channel: filter.channel } }),
      },
      select: {
        campaignId: true,
        dealId: true,
        contentId: true,
        publication: { select: { channel: true } },
        lead: {
          select: {
            id: true,
            status: true,
            destination: true,
            activities: {
              where: { type: 'STATUS_CHANGED' },
              select: { description: true },
            },
            booking: {
              select: { id: true, sellingPrice: true, currency: true },
            },
          },
        },
        campaign: { select: { id: true, campaignCode: true, name: true } },
        deal: { select: { id: true, dealCode: true, title: true } },
        content: {
          select: {
            id: true,
            contentCode: true,
            title: true,
            contentType: true,
          },
        },
      },
    });
    const campaigns = new Map<string, ReturnType<typeof base>>(),
      contents = new Map<string, ReturnType<typeof contentBase>>(),
      deals = new Map<string, ReturnType<typeof dealBase>>();
    const seenCampaigns = new Set<string>(),
      seenContent = new Set<string>(),
      seenDeals = new Set<string>();
    for (const item of attributions) {
      const reached = (stage: string) =>
        item.lead.status === stage ||
        item.lead.activities.some((a) => a.description.includes(`to ${stage}`));
      const sale = item.lead.status === 'SALE_MADE';
      const booking = Boolean(item.lead.booking);
      const value = item.lead.booking?.sellingPrice ?? new Prisma.Decimal(0);
      if (
        item.campaign &&
        !seenCampaigns.has(`${item.campaign.id}:${item.lead.id}`)
      ) {
        seenCampaigns.add(`${item.campaign.id}:${item.lead.id}`);
        const row = campaigns.get(item.campaign.id) ?? base(item.campaign);
        add(
          row,
          reached('QUOTING'),
          reached('GOING_TO_BOOK'),
          sale,
          booking,
          value,
          item.lead.booking?.currency,
        );
        campaigns.set(item.campaign.id, row);
      }
      if (
        item.content &&
        !seenContent.has(`${item.content.id}:${item.lead.id}`)
      ) {
        seenContent.add(`${item.content.id}:${item.lead.id}`);
        const row =
          contents.get(item.content.id) ??
          contentBase(item.content, item.publication?.channel ?? null);
        add(
          row,
          reached('QUOTING'),
          reached('GOING_TO_BOOK'),
          sale,
          booking,
          value,
          item.lead.booking?.currency,
        );
        contents.set(item.content.id, row);
      }
      if (item.deal && !seenDeals.has(`${item.deal.id}:${item.lead.id}`)) {
        seenDeals.add(`${item.deal.id}:${item.lead.id}`);
        const row = deals.get(item.deal.id) ?? dealBase(item.deal);
        add(
          row,
          reached('QUOTING'),
          reached('GOING_TO_BOOK'),
          sale,
          booking,
          value,
          item.lead.booking?.currency,
        );
        deals.set(item.deal.id, row);
      }
    }
    const finalize = <T extends Metrics>(x: T) => ({
      ...x,
      salesContribution: x.salesContribution.toNumber(),
      rates: {
        enquiryToQuote: rate(x.quoting, x.enquiries),
        quoteToSale: rate(x.salesMade, x.quoting),
        enquiryToSale: rate(x.salesMade, x.enquiries),
        saleToBooking: rate(x.bookings, x.salesMade),
      },
    });
    return {
      campaigns: [...campaigns.values()].map(finalize),
      content: [...contents.values()].map(finalize),
      deals: [...deals.values()].map(finalize),
      attributedLeadIds: [...new Set(attributions.map((x) => x.lead.id))],
    };
  }
}
type Metrics = {
  enquiries: number;
  quoting: number;
  goingToBook: number;
  salesMade: number;
  bookings: number;
  salesContribution: Prisma.Decimal;
  currency: string | null;
};
function metrics(): Metrics {
  return {
    enquiries: 0,
    quoting: 0,
    goingToBook: 0,
    salesMade: 0,
    bookings: 0,
    salesContribution: new Prisma.Decimal(0),
    currency: null,
  };
}
function base(c: { id: string; campaignCode: string; name: string }) {
  return { ...c, ...metrics() };
}
function contentBase(
  c: { id: string; contentCode: string; title: string; contentType: string },
  channel: string | null,
) {
  return { ...c, channel, ...metrics() };
}
function dealBase(d: { id: string; dealCode: string; title: string }) {
  return { ...d, ...metrics() };
}
function add(
  row: Metrics,
  quote: boolean,
  going: boolean,
  sale: boolean,
  booking: boolean,
  value: Prisma.Decimal,
  currency?: string,
) {
  row.enquiries++;
  if (quote) row.quoting++;
  if (going) row.goingToBook++;
  if (sale) row.salesMade++;
  if (booking) {
    row.bookings++;
    row.salesContribution = row.salesContribution.add(value);
    row.currency ??= currency ?? null;
  }
}
function rate(a: number, b: number) {
  return b ? Math.round((a / b) * 10000) / 100 : 0;
}
