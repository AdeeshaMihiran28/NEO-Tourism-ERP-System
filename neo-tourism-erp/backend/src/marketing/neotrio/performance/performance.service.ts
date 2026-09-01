import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../auth/auth.types';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PerformanceQueryDto } from '../dto/neotrio.dto';
import {
  addMetrics,
  contentBusinessMetrics,
  emptyMetrics,
  type BusinessMetrics,
} from '../performance-metrics';

type Aggregate = BusinessMetrics & {
  id: string;
  label: string;
  publishedContent: number;
};

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}
  async get(query: PerformanceQueryDto, user: AuthenticatedUser) {
    const from = query.dateFrom ? new Date(query.dateFrom) : undefined,
      to = query.dateTo ? new Date(query.dateTo) : undefined;
    const [productions, meta] = await Promise.all([
      this.prisma.neoTrioProduction.findMany({
        where: {
          stage: 'PUBLISHED',
          ...(from || to
            ? {
                publishedAt: {
                  ...(from && { gte: from }),
                  ...(to && { lte: to }),
                },
              }
            : {}),
        },
        include: { characters: { include: { character: true } }, series: true },
      }),
      this.prisma.integrationProvider.findUnique({
        where: { type_name: { type: 'META', name: 'Meta Business Suite' } },
        select: { status: true },
      }),
    ]);
    const metricMap = await contentBusinessMetrics(
      this.prisma,
      productions.flatMap(({ marketingContentId }) =>
        marketingContentId ? [marketingContentId] : [],
      ),
      from,
      to,
    );
    const characters = new Map<string, Aggregate>(),
      combinations = new Map<string, Aggregate>(),
      series = new Map<string, Aggregate>(),
      formats = new Map<string, Aggregate>();
    for (const production of productions) {
      const metrics = production.marketingContentId
        ? (metricMap.get(production.marketingContentId) ?? emptyMetrics())
        : emptyMetrics();
      for (const tag of production.characters)
        accumulate(characters, tag.character.id, tag.character.name, metrics);
      const sorted = [...production.characters].sort((a, b) =>
        a.character.code.localeCompare(b.character.code),
      );
      if (sorted.length)
        accumulate(
          combinations,
          sorted.map(({ characterId }) => characterId).join('+'),
          sorted.map(({ character }) => character.name).join(' + '),
          metrics,
        );
      if (production.series)
        accumulate(
          series,
          production.series.id,
          production.series.name,
          metrics,
        );
      const format = formatName(production.productionType);
      accumulate(formats, format, format, metrics);
    }
    const characterRows = [...characters.values()],
      combinationRows = [...combinations.values()],
      seriesRows = [...series.values()],
      formatRows = [...formats.values()];
    return {
      period: { from: from ?? null, to: to ?? null },
      summary: {
        mostPublishedCharacter: top(characterRows, 'publishedContent'),
        topCharacterCombinationBySales: top(combinationRows, 'sales'),
        topSeriesBySales: top(seriesRows, 'sales'),
        topContentFormatByEnquiries: top(formatRows, 'enquiries'),
      },
      characterPerformance: {
        aggregation: 'CONTENT_FEATURING_CHARACTER_NON_ADDITIVE',
        note: 'A multi-character production appears under each featured character. Character rows must not be added together.',
        rows: characterRows,
      },
      combinationPerformance: {
        aggregation: 'EXACT_CHARACTER_SET',
        note: 'Each production contributes once to its exact relational character combination.',
        rows: combinationRows,
      },
      seriesPerformance: seriesRows,
      formatPerformance: formatRows,
      financeVisibility: {
        sellingValue: true,
        supplierCost: user.permissions.includes('finance.view'),
        profit: false,
      },
      externalEngagement:
        meta?.status === 'CONNECTED'
          ? {
              status: 'AVAILABLE_FROM_PROVIDER_WHEN_METRICS_SYNCED',
              platformMetrics: [],
            }
          : {
              status: 'UNAVAILABLE',
              message: 'External engagement data unavailable.',
            },
    };
  }
}

function accumulate(
  map: Map<string, Aggregate>,
  id: string,
  label: string,
  value: BusinessMetrics,
) {
  const row = map.get(id) ?? {
    id,
    label,
    publishedContent: 0,
    ...emptyMetrics(),
  };
  row.publishedContent += 1;
  addMetrics(row, value);
  map.set(id, row);
}
function top(rows: Aggregate[], metric: keyof Aggregate) {
  return (
    [...rows].sort((a, b) => Number(b[metric]) - Number(a[metric]))[0] ?? null
  );
}
function formatName(type: string) {
  return type === 'SHORT_VIDEO'
    ? 'VIDEO'
    : type === 'STORY'
      ? 'SOCIAL_POST'
      : type;
}
