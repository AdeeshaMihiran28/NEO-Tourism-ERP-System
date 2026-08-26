import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PulsePeriod } from '../dto/pulse.dto';

@Injectable()
export class PulseCrmService {
  constructor(private readonly prisma: PrismaService) {}
  async get(period: PulsePeriod, now = new Date()) {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const currentStart = new Date(today.getTime() - 6 * 86400000);
    const previousStart = new Date(currentStart.getTime() - 7 * 86400000);
    const periodStart =
      period === PulsePeriod.TODAY
        ? today
        : period === PulsePeriod.THIRTY_DAYS
          ? new Date(today.getTime() - 29 * 86400000)
          : currentStart;
    const [todayCount, periodCount, current, previous] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: { gte: today } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: periodStart } } }),
      this.prisma.lead.groupBy({
        by: ['destination'],
        where: { createdAt: { gte: currentStart }, destination: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['destination'],
        where: {
          createdAt: { gte: previousStart, lt: currentStart },
          destination: { not: null },
        },
        _count: { _all: true },
      }),
    ]);
    const minimum = Math.max(
      1,
      Number(process.env.MARKETING_TREND_MIN_CURRENT_ENQUIRIES ?? 5),
    );
    const previousMap = new Map(
      previous.map((x) => [x.destination?.trim().toLowerCase(), x._count._all]),
    );
    const destinations = current
      .map((x) => {
        const previousCount =
          previousMap.get(x.destination?.trim().toLowerCase()) ?? 0;
        const growthPercent =
          previousCount === 0
            ? x._count._all > 0
              ? 100
              : null
            : Math.round(
                ((x._count._all - previousCount) / previousCount) * 100,
              );
        return {
          destination: x.destination!,
          currentPeriodEnquiries: x._count._all,
          previousPeriodEnquiries: previousCount,
          growthPercent,
          trending:
            x._count._all >= minimum &&
            growthPercent !== null &&
            growthPercent >= 20,
        };
      })
      .sort(
        (a, b) =>
          Number(b.trending) - Number(a.trending) ||
          b.currentPeriodEnquiries - a.currentPeriodEnquiries,
      )
      .slice(0, 10);
    return {
      newEnquiriesToday: todayCount,
      newEnquiriesPeriod: periodCount,
      period,
      trendWindow: 'CURRENT_7_DAYS_VS_PREVIOUS_7_DAYS',
      minimumCurrentPeriodEnquiries: minimum,
      destinations,
      campaignEnquiries: {
        status: 'NOT_YET_AVAILABLE',
        message: 'Reliable Lead-to-campaign attribution is not yet available.',
      },
    };
  }
}
