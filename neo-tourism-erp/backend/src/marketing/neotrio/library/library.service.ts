import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  NeoTrioLibraryType,
  Prisma,
} from '../../../../generated/prisma/client';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { LibraryQueryDto } from '../dto/neotrio.dto';
import { contentBusinessMetrics, emptyMetrics } from '../performance-metrics';

const itemInclude = {
  production: {
    include: {
      characters: { include: { character: true } },
      series: true,
      assets: {
        where: { assetType: 'THUMBNAIL' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  },
  campaign: { select: { id: true, campaignCode: true, name: true } },
  deal: {
    select: { id: true, dealCode: true, title: true, destination: true },
  },
  publication: {
    select: { id: true, channel: true, status: true, externalReference: true },
  },
} satisfies Prisma.NeoTrioLibraryItemInclude;

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: LibraryQueryDto) {
    const where: Prisma.NeoTrioLibraryItemWhereInput = {
      libraryType: query.libraryType,
      campaignId: query.campaignId,
      dealId: query.dealId,
      ...(query.characterId && {
        production: {
          characters: { some: { characterId: query.characterId } },
        },
      }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          {
            production: {
              productionCode: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      }),
      ...(query.destination && {
        OR: [
          {
            production: {
              idea: {
                destination: {
                  contains: query.destination,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            deal: {
              destination: { contains: query.destination, mode: 'insensitive' },
            },
          },
        ],
      }),
      ...(query.dateFrom || query.dateTo
        ? {
            publishedAt: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };
    const candidates = await this.prisma.neoTrioLibraryItem.findMany({
      where,
      include: itemInclude,
      orderBy: { publishedAt: 'desc' },
      take: query.characterIds?.length ? 500 : query.limit,
      skip: query.characterIds?.length ? 0 : (query.page - 1) * query.limit,
    });
    const exact = query.characterIds?.length
      ? candidates.filter(({ production }) =>
          sameIds(
            production.characters.map(({ characterId }) => characterId),
            query.characterIds!,
          ),
        )
      : candidates;
    const data = query.characterIds?.length
      ? exact.slice((query.page - 1) * query.limit, query.page * query.limit)
      : exact;
    const total = query.characterIds?.length
      ? exact.length
      : await this.prisma.neoTrioLibraryItem.count({ where });
    const metrics = await contentBusinessMetrics(
      this.prisma,
      data.flatMap(({ marketingContentId }) =>
        marketingContentId ? [marketingContentId] : [],
      ),
    );
    return {
      data: data.map((item) => ({
        ...item,
        performance: item.marketingContentId
          ? (metrics.get(item.marketingContentId) ?? emptyMetrics())
          : emptyMetrics(),
        externalPublicationVerified: Boolean(
          item.publication?.externalReference,
        ),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async get(id: string) {
    const item = await this.prisma.neoTrioLibraryItem.findUnique({
      where: { id },
      include: itemInclude,
    });
    if (!item) throw new NotFoundException('NeoTrio library item not found.');
    return item;
  }

  async upsertForPublished(
    productionId: string,
    publicationId: string | null,
    actorId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const production = await tx.neoTrioProduction.findUnique({
      where: { id: productionId },
    });
    if (!production)
      throw new NotFoundException('NeoTrio production not found.');
    const existing = await tx.neoTrioLibraryItem.findUnique({
      where: { productionId },
    });
    const item = await tx.neoTrioLibraryItem.upsert({
      where: { productionId },
      create: {
        productionId,
        marketingContentId: production.marketingContentId,
        publicationId,
        title: production.title,
        libraryType: libraryType(production.productionType),
        publishedAt: production.publishedAt ?? new Date(),
        campaignId: production.campaignId,
        dealId: production.dealId,
      },
      update: {
        marketingContentId: production.marketingContentId,
        publicationId: publicationId ?? existing?.publicationId,
        title: production.title,
        libraryType: libraryType(production.productionType),
        publishedAt:
          production.publishedAt ?? existing?.publishedAt ?? new Date(),
        campaignId: production.campaignId,
        dealId: production.dealId,
      },
    });
    if (!existing)
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioLibraryItem',
          entityId: item.id,
          action: 'NEOTRIO_LIBRARY_ITEM_CREATED',
          newValues: {
            productionId,
            marketingContentId: item.marketingContentId,
            publicationId: item.publicationId,
            libraryType: item.libraryType,
          },
        },
        tx,
      );
    return item;
  }
}

function libraryType(type: string): NeoTrioLibraryType {
  return type === 'EPISODE'
    ? 'EPISODE'
    : type === 'REEL'
      ? 'REEL'
      : type === 'MEME'
        ? 'MEME'
        : type === 'CAMPAIGN_APPEARANCE'
          ? 'CAMPAIGN_APPEARANCE'
          : type === 'SOCIAL_POST' || type === 'STORY'
            ? 'SOCIAL_POST'
            : type === 'IMAGE'
              ? 'IMAGE'
              : type === 'SHORT_VIDEO'
                ? 'VIDEO'
                : type === 'SCRIPT_ONLY'
                  ? 'SCRIPT'
                  : 'OTHER';
}
function sameIds(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}
