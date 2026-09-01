import type { PrismaService } from '../../prisma/prisma.service';

export type BusinessMetrics = {
  enquiries: number;
  quoting: number;
  sales: number;
  bookings: number;
  salesContribution: number;
  currency: string | null;
};

export const emptyMetrics = (): BusinessMetrics => ({
  enquiries: 0,
  quoting: 0,
  sales: 0,
  bookings: 0,
  salesContribution: 0,
  currency: null,
});

export async function contentBusinessMetrics(
  prisma: PrismaService,
  contentIds: string[],
  from?: Date,
  to?: Date,
) {
  if (!contentIds.length) return new Map<string, BusinessMetrics>();
  const rows = await prisma.marketingAttribution.findMany({
    where: {
      isActive: true,
      confidence: { not: 'UNATTRIBUTED' },
      contentId: { in: contentIds },
      ...(from || to
        ? {
            firstTouchAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    },
    select: {
      contentId: true,
      lead: {
        select: {
          id: true,
          status: true,
          activities: {
            where: { type: 'STATUS_CHANGED' },
            select: { description: true },
          },
          booking: { select: { id: true, sellingPrice: true, currency: true } },
        },
      },
    },
  });
  const result = new Map<string, BusinessMetrics>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.contentId) continue;
    const key = `${row.contentId}:${row.lead.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const metrics = result.get(row.contentId) ?? emptyMetrics();
    metrics.enquiries += 1;
    if (
      row.lead.status === 'QUOTING' ||
      row.lead.activities.some(({ description }) =>
        description.includes('to QUOTING'),
      )
    )
      metrics.quoting += 1;
    if (row.lead.status === 'SALE_MADE') metrics.sales += 1;
    if (row.lead.booking) {
      metrics.bookings += 1;
      metrics.salesContribution += Number(row.lead.booking.sellingPrice);
      metrics.currency = mergeCurrency(
        metrics.currency,
        row.lead.booking.currency,
      );
    }
    result.set(row.contentId, metrics);
  }
  return result;
}

export function addMetrics(target: BusinessMetrics, value: BusinessMetrics) {
  target.enquiries += value.enquiries;
  target.quoting += value.quoting;
  target.sales += value.sales;
  target.bookings += value.bookings;
  target.salesContribution += value.salesContribution;
  target.currency = mergeCurrency(target.currency, value.currency);
}

function mergeCurrency(current: string | null, next: string | null) {
  if (!next) return current;
  if (!current) return next;
  return current === next ? current : 'MIXED';
}
