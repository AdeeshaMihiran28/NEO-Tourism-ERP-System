import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  NotificationType,
  Prisma,
  type NeoTrioProductionStage,
} from '../../../../generated/prisma/client';
import { AuditService } from '../../../audit/audit.service';
import type { RequestMetadata } from '../../../common/request-metadata';
import { NotificationsService } from '../../../notifications/notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentService } from '../../content/content.service';
import type {
  AssignProductionDto,
  CreateProductionAssetDto,
  CreateProductionDto,
  CreateScriptDto,
  LinkContentDto,
  ProductionQueryDto,
  ProductionStageDto,
  PublishProductionDto,
  UpdateProductionDto,
} from '../dto/neotrio.dto';
import { validateNeoTrioFileMetadata } from '../file-metadata';
import { LibraryService } from '../library/library.service';

const person = { id: true, firstName: true, lastName: true } as const;
const include = {
  characters: { include: { character: true } },
  assignedUser: { select: person },
  createdBy: { select: person },
  campaign: { select: { id: true, campaignCode: true, name: true } },
  deal: { select: { id: true, dealCode: true, title: true } },
  series: true,
  idea: { select: { id: true, ideaCode: true, marketingOpportunityId: true } },
  marketingContent: {
    select: {
      id: true,
      contentCode: true,
      stage: true,
      currentVersionId: true,
    },
  },
  scripts: { orderBy: { versionNumber: 'desc' as const } },
  assets: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.NeoTrioProductionInclude;

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly content: ContentService,
    private readonly library: LibraryService,
  ) {}

  async board(query: ProductionQueryDto) {
    const items = await this.prisma.neoTrioProduction.findMany({
      where: {
        stage: query.stage,
        assignedUserId: query.assignedUserId,
        campaignId: query.campaignId,
        dealId: query.dealId,
        ...(query.characterId && {
          characters: { some: { characterId: query.characterId } },
        }),
      },
      include,
      orderBy: [
        { priority: 'desc' },
        { deadline: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 500,
    });
    return Object.fromEntries(
      ['IDEA', 'SCRIPT', 'PRODUCTION', 'REVIEW', 'READY', 'PUBLISHED'].map(
        (stage) => [stage, items.filter((item) => item.stage === stage)],
      ),
    );
  }
  async get(id: string) {
    const value = await this.prisma.neoTrioProduction.findUnique({
      where: { id },
      include,
    });
    if (!value) throw new NotFoundException('NeoTrio production not found.');
    return value;
  }
  async create(
    dto: CreateProductionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    await this.validateCharacters(dto.characterIds);
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const counter = await tx.neoTrioProductionCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      const value = await tx.neoTrioProduction.create({
        data: {
          productionCode: `NEOTRIO-${year}-${String(counter.nextNumber - 1).padStart(6, '0')}`,
          title: dto.title,
          description: dto.description,
          productionType: dto.productionType,
          ideaId: dto.ideaId,
          campaignId: dto.campaignId,
          dealId: dto.dealId,
          seriesId: dto.seriesId,
          assignedUserId: dto.assignedUserId,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          plannedPublishAt: dto.plannedPublishAt
            ? new Date(dto.plannedPublishAt)
            : undefined,
          priority: dto.priority,
          createdById: actorId,
          updatedById: actorId,
          ...(dto.characterIds?.length && {
            characters: {
              create: dto.characterIds.map((characterId) => ({ characterId })),
            },
          }),
        },
        include,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioProduction',
          entityId: value.id,
          action: 'NEOTRIO_PRODUCTION_CREATED',
          newValues: {
            productionCode: value.productionCode,
            stage: value.stage,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
  }
  async update(
    id: string,
    dto: UpdateProductionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.get(id);
    if (['PUBLISHED', 'ARCHIVED', 'CANCELLED'].includes(current.stage))
      throw new ConflictException('Completed production cannot be edited.');
    await this.validateCharacters(dto.characterIds);
    return this.prisma.$transaction(async (tx) => {
      if (dto.characterIds) {
        await tx.neoTrioProductionCharacter.deleteMany({
          where: { productionId: id },
        });
        if (dto.characterIds.length)
          await tx.neoTrioProductionCharacter.createMany({
            data: dto.characterIds.map((characterId) => ({
              productionId: id,
              characterId,
            })),
          });
      }
      const value = await tx.neoTrioProduction.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          productionType: dto.productionType,
          campaignId: dto.campaignId,
          dealId: dto.dealId,
          seriesId: dto.seriesId,
          assignedUserId: dto.assignedUserId,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          plannedPublishAt: dto.plannedPublishAt
            ? new Date(dto.plannedPublishAt)
            : undefined,
          priority: dto.priority,
          updatedById: actorId,
        },
        include,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioProduction',
          entityId: id,
          action: 'NEOTRIO_PRODUCTION_UPDATED',
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
  }
  async assign(
    id: string,
    dto: AssignProductionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.get(id);
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, isActive: true },
    });
    if (!user) throw new NotFoundException('Active assignee not found.');
    const value = await this.prisma.neoTrioProduction.update({
      where: { id },
      data: { assignedUserId: dto.userId, updatedById: actorId },
      include,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioProduction',
      entityId: id,
      action: 'NEOTRIO_PRODUCTION_ASSIGNED',
      oldValues: { assignedUserId: current.assignedUserId },
      newValues: { assignedUserId: dto.userId },
      requestMetadata: meta,
    });
    await this.notifyOnce(
      dto.userId,
      NotificationType.NEOTRIO_PRODUCTION_ASSIGNED,
      id,
      'NeoTrio production assigned',
      `${value.productionCode}: ${value.title}`,
    );
    return value;
  }
  async stage(
    id: string,
    dto: ProductionStageDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.get(id);
    const next = dto.stage;
    const valid =
      (current.stage === 'IDEA' && next === 'SCRIPT') ||
      (current.stage === 'SCRIPT' && next === 'PRODUCTION') ||
      (current.stage === 'PRODUCTION' && next === 'REVIEW') ||
      next === 'CANCELLED' ||
      next === 'ARCHIVED';
    if (!valid)
      throw new ConflictException(
        next === 'READY'
          ? 'REVIEW to READY is controlled by NEO GREENLIGHT approval.'
          : next === 'PUBLISHED'
            ? 'Use the controlled publication action.'
            : `Invalid NeoTrio transition: ${current.stage} -> ${next}.`,
      );
    if (next === 'PRODUCTION' && !current.scripts.length)
      throw new ConflictException(
        'Create a script version before starting production.',
      );
    if (next === 'REVIEW') {
      if (!current.marketingContentId)
        throw new ConflictException('Link NEO FLOW content before review.');
      if (!current.marketingContent?.currentVersionId)
        throw new ConflictException(
          'Create a final NEO FLOW content version before review.',
        );
    }
    const value = await this.prisma.neoTrioProduction.update({
      where: { id },
      data: { stage: next, updatedById: actorId },
      include,
    });
    await this.auditStage(current, next, actorId, meta);
    if (next === 'REVIEW')
      await this.notifyPermission(
        'marketing.approval.approve',
        NotificationType.NEOTRIO_PRODUCTION_REVIEW_REQUIRED,
        id,
        'NeoTrio review required',
        `${value.productionCode} requires Greenlight review.`,
      );
    return value;
  }
  async addScript(
    id: string,
    dto: CreateScriptDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.get(id);
    if (!['SCRIPT', 'PRODUCTION'].includes(current.stage))
      throw new ConflictException(
        'Scripts can only be versioned during SCRIPT or PRODUCTION.',
      );
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.neoTrioScript.findFirst({
        where: { productionId: id },
        orderBy: { versionNumber: 'desc' },
      });
      const value = await tx.neoTrioScript.create({
        data: {
          productionId: id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          title: dto.title,
          scriptText: dto.scriptText,
          notes: dto.notes,
          createdById: actorId,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioProduction',
          entityId: id,
          action: 'NEOTRIO_SCRIPT_VERSION_CREATED',
          newValues: { scriptId: value.id, version: value.versionNumber },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
  }
  async addAsset(
    id: string,
    dto: CreateProductionAssetDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    await this.get(id);
    validateNeoTrioFileMetadata(dto);
    return this.prisma.$transaction(async (tx) => {
      const prior = dto.previousAssetId
        ? await tx.neoTrioProductionAsset.findFirst({
            where: { id: dto.previousAssetId, productionId: id },
          })
        : null;
      if (dto.previousAssetId && !prior)
        throw new NotFoundException('Previous production asset not found.');
      const value = await tx.neoTrioProductionAsset.create({
        data: {
          productionId: id,
          versionGroupKey: prior?.versionGroupKey ?? randomUUID(),
          version: (prior?.version ?? 0) + 1,
          assetType: dto.assetType,
          title: dto.title,
          fileName: dto.fileName,
          storageKey: dto.storageKey,
          mimeType: dto.mimeType,
          fileSize: dto.fileSize,
          createdById: actorId,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioProduction',
          entityId: id,
          action: 'NEOTRIO_PRODUCTION_ASSET_CREATED',
          newValues: {
            assetId: value.id,
            assetType: value.assetType,
            version: value.version,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return value;
    });
  }
  async approvedReferences(id: string) {
    const value = await this.get(id);
    return this.prisma.neoTrioCharacter.findMany({
      where: {
        id: { in: value.characters.map(({ characterId }) => characterId) },
      },
      select: {
        id: true,
        code: true,
        name: true,
        assets: {
          where: { status: 'APPROVED' },
          orderBy: [{ isMasterAsset: 'desc' }, { updatedAt: 'desc' }],
        },
      },
    });
  }
  async linkContent(
    id: string,
    dto: LinkContentDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const production = await this.get(id);
    let contentId = dto.marketingContentId;
    if (contentId) {
      const target = await this.prisma.marketingContent.findUnique({
        where: { id: contentId },
      });
      if (!target || target.contentType !== 'NEOTRIO')
        throw new ConflictException(
          'Linked content must be an existing NEOTRIO content item.',
        );
    } else {
      const created = await this.content.create(
        {
          title: production.title,
          description: production.description ?? undefined,
          contentType: 'NEOTRIO',
          campaignId: production.campaignId ?? undefined,
          dealId: production.dealId ?? undefined,
          assignedUserId: production.assignedUserId ?? undefined,
          deadline: production.deadline?.toISOString(),
          priority: production.priority,
        },
        actorId,
        meta,
      );
      contentId = created.id;
      await this.content.stage(contentId, { stage: 'CREATING' }, actorId, meta);
    }
    const value = await this.prisma.neoTrioProduction.update({
      where: { id },
      data: { marketingContentId: contentId, updatedById: actorId },
      include,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioProduction',
      entityId: id,
      action: 'NEOTRIO_FLOW_CONTENT_LINKED',
      newValues: { marketingContentId: contentId },
      requestMetadata: meta,
    });
    return value;
  }
  async publish(
    id: string,
    dto: PublishProductionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const production = await this.get(id);
    if (production.stage === 'PUBLISHED')
      return {
        ...production,
        externalPublicationVerification: 'ALREADY_PROCESSED',
      };
    if (
      production.stage !== 'READY' ||
      !production.marketingContentId ||
      !production.marketingContent?.currentVersionId
    )
      throw new ConflictException(
        'Only READY production with approved NEO FLOW content can be published.',
      );
    const approved = await this.prisma.marketingContentApproval.findFirst({
      where: {
        contentId: production.marketingContentId,
        contentVersionId: production.marketingContent.currentVersionId,
        status: 'APPROVED',
      },
    });
    if (!approved)
      throw new ConflictException(
        'The linked final content version is not approved.',
      );
    if (production.marketingContent.stage === 'READY')
      await this.content.goLive(production.marketingContentId, actorId, meta);
    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt)
      : new Date();
    const publication = dto.publicationId
      ? await this.prisma.marketingPublication.update({
          where: { id: dto.publicationId },
          data: {
            status: 'PUBLISHED',
            publishedAt,
            externalReference: dto.externalReference,
          },
        })
      : await this.prisma.marketingPublication.create({
          data: {
            contentId: production.marketingContentId,
            contentVersionId: production.marketingContent.currentVersionId,
            channel: dto.channel,
            status: 'PUBLISHED',
            publishedAt,
            externalReference: dto.externalReference,
          },
        });
    const value = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.neoTrioProduction.update({
        where: { id },
        data: { stage: 'PUBLISHED', publishedAt, updatedById: actorId },
      });
      await this.library.upsertForPublished(id, publication.id, actorId, tx);
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioProduction',
          entityId: id,
          action: 'NEOTRIO_PRODUCTION_PUBLISHED',
          oldValues: { stage: 'READY' },
          newValues: {
            stage: 'PUBLISHED',
            publicationId: publication.id,
            externalPublicationVerified: Boolean(dto.externalReference),
          },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
    return {
      ...(await this.get(value.id)),
      publication,
      externalPublicationVerification: dto.externalReference
        ? 'VERIFIED_REFERENCE_RECORDED'
        : 'NOT_VERIFIED',
    };
  }
  private async validateCharacters(ids?: string[]) {
    if (!ids?.length) return;
    if (new Set(ids).size !== ids.length)
      throw new ConflictException('Character tags must be unique.');
    if (
      (await this.prisma.neoTrioCharacter.count({
        where: { id: { in: ids }, isActive: true },
      })) !== ids.length
    )
      throw new NotFoundException(
        'One or more active characters were not found.',
      );
  }
  private async auditStage(
    current: { id: string; stage: string },
    stage: NeoTrioProductionStage,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioProduction',
      entityId: current.id,
      action: 'NEOTRIO_PRODUCTION_STAGE_CHANGED',
      oldValues: { stage: current.stage },
      newValues: { stage },
      requestMetadata: meta,
    });
  }
  private async notifyOnce(
    userId: string,
    type: NotificationType,
    entityId: string,
    title: string,
    message: string,
  ) {
    const exists = await this.prisma.notification.findFirst({
      where: {
        userId,
        type,
        entityId,
        entityType: 'NeoTrioProduction',
        isRead: false,
      },
    });
    if (!exists)
      await this.notifications.create({
        userId,
        type,
        entityId,
        entityType: 'NeoTrioProduction',
        title,
        message,
      });
  }
  private async notifyPermission(
    permission: string,
    type: NotificationType,
    entityId: string,
    title: string,
    message: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              permissions: { some: { permission: { code: permission } } },
            },
          },
        },
      },
      select: { id: true },
    });
    await Promise.all(
      users.map(({ id }) =>
        this.notifyOnce(id, type, entityId, title, message),
      ),
    );
  }
}
