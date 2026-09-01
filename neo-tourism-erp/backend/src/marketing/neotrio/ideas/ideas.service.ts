import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '../../../../generated/prisma/client';
import { AuditService } from '../../../audit/audit.service';
import type { RequestMetadata } from '../../../common/request-metadata';
import { NotificationsService } from '../../../notifications/notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  CreateIdeaDto,
  CreateIdeaFromOpportunityDto,
  IdeaQueryDto,
  UpdateIdeaDto,
} from '../dto/neotrio.dto';

const person = { id: true, firstName: true, lastName: true } as const;
const ideaInclude = {
  submittedBy: { select: person },
  assignedUser: { select: person },
  campaign: { select: { id: true, campaignCode: true, name: true } },
  deal: { select: { id: true, dealCode: true, title: true } },
  marketingOpportunity: { select: { id: true, title: true, sourceType: true } },
  characters: { include: { character: true } },
  production: { select: { id: true, productionCode: true, stage: true } },
} satisfies Prisma.NeoTrioIdeaInclude;

@Injectable()
export class IdeasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: IdeaQueryDto) {
    const where: Prisma.NeoTrioIdeaWhereInput = {
      ideaType: query.ideaType,
      status: query.status,
      assignedUserId: query.assignedUserId,
      campaignId: query.campaignId,
      priority: query.priority,
      ...(query.characterId && {
        characters: { some: { characterId: query.characterId } },
      }),
      ...(query.destination && {
        destination: { contains: query.destination, mode: 'insensitive' },
      }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { ideaCode: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.neoTrioIdea.findMany({
        where,
        include: ideaInclude,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.neoTrioIdea.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async get(id: string) {
    const idea = await this.prisma.neoTrioIdea.findUnique({
      where: { id },
      include: ideaInclude,
    });
    if (!idea) throw new NotFoundException('NeoTrio idea not found.');
    return idea;
  }

  async create(dto: CreateIdeaDto, actorId: string, meta?: RequestMetadata) {
    await this.validateCharacters(dto.characterIds);
    const created = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const counter = await tx.neoTrioIdeaCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      const idea = await tx.neoTrioIdea.create({
        data: {
          ideaCode: `NEO-IDEA-${year}-${String(counter.nextNumber - 1).padStart(6, '0')}`,
          title: dto.title,
          description: dto.description,
          ideaType: dto.ideaType,
          destination: dto.destination,
          trendReference: dto.trendReference,
          priority: dto.priority,
          assignedUserId: dto.assignedUserId,
          campaignId: dto.campaignId,
          dealId: dto.dealId,
          marketingOpportunityId: dto.marketingOpportunityId,
          submittedById: actorId,
          ...(dto.characterIds?.length && {
            characters: {
              create: dto.characterIds.map((characterId) => ({ characterId })),
            },
          }),
        },
        include: ideaInclude,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioIdea',
          entityId: idea.id,
          action: 'NEOTRIO_IDEA_CREATED',
          newValues: ideaSnapshot(idea),
          requestMetadata: meta,
        },
        tx,
      );
      return idea;
    });
    if (created.assignedUserId)
      await this.notifyAssigned(
        created.assignedUserId,
        created.id,
        `${created.ideaCode}: ${created.title}`,
      );
    return created;
  }

  async createFromOpportunity(
    opportunityId: string,
    dto: CreateIdeaFromOpportunityDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const existing = await this.prisma.neoTrioIdea.findUnique({
      where: { marketingOpportunityId: opportunityId },
      include: ideaInclude,
    });
    if (existing) return { ...existing, duplicate: true };
    const opportunity = await this.prisma.marketingOpportunity.findUnique({
      where: { id: opportunityId },
    });
    if (!opportunity)
      throw new NotFoundException('Marketing opportunity not found.');
    const idea = await this.create(
      {
        title: dto.title ?? opportunity.title,
        description:
          dto.description ??
          `NeoTrio concept created from Radar opportunity: ${opportunity.description}`,
        ideaType: dto.ideaType ?? 'TRAVEL_IDEA',
        destination: opportunity.destination ?? undefined,
        priority: opportunity.priority,
        assignedUserId:
          dto.assignedUserId ?? opportunity.assignedUserId ?? undefined,
        campaignId: opportunity.campaignId ?? undefined,
        dealId: opportunity.dealId ?? undefined,
        marketingOpportunityId: opportunity.id,
        characterIds: dto.characterIds,
      },
      actorId,
      meta,
    );
    await this.prisma.marketingOpportunity.update({
      where: { id: opportunity.id },
      data: { status: 'ACTIONED' },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'MarketingOpportunity',
      entityId: opportunity.id,
      action: 'MARKETING_OPPORTUNITY_ACTIONED',
      oldValues: { status: opportunity.status },
      newValues: { status: 'ACTIONED', neoTrioIdeaId: idea.id },
      requestMetadata: meta,
    });
    return { ...idea, duplicate: false };
  }

  async update(
    id: string,
    dto: UpdateIdeaDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.get(id);
    if (!['NEW', 'SHORTLISTED'].includes(current.status))
      throw new ConflictException(
        'Only NEW or SHORTLISTED ideas can be edited.',
      );
    await this.validateCharacters(dto.characterIds);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.characterIds) {
        await tx.neoTrioIdeaCharacter.deleteMany({ where: { ideaId: id } });
        if (dto.characterIds.length)
          await tx.neoTrioIdeaCharacter.createMany({
            data: dto.characterIds.map((characterId) => ({
              ideaId: id,
              characterId,
            })),
          });
      }
      const result = await tx.neoTrioIdea.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          ideaType: dto.ideaType,
          destination: dto.destination,
          trendReference: dto.trendReference,
          priority: dto.priority,
          assignedUserId: dto.assignedUserId,
          campaignId: dto.campaignId,
          dealId: dto.dealId,
        },
        include: ideaInclude,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioIdea',
          entityId: id,
          action: 'NEOTRIO_IDEA_UPDATED',
          oldValues: ideaSnapshot(current),
          newValues: ideaSnapshot(result),
          requestMetadata: meta,
        },
        tx,
      );
      return result;
    });
    if (
      updated.assignedUserId &&
      updated.assignedUserId !== current.assignedUserId
    )
      await this.notifyAssigned(
        updated.assignedUserId,
        id,
        `${updated.ideaCode}: ${updated.title}`,
      );
    return updated;
  }

  shortlist(id: string, actorId: string, meta?: RequestMetadata) {
    return this.transition(
      id,
      'SHORTLISTED',
      ['NEW'],
      actorId,
      'NEOTRIO_IDEA_SHORTLISTED',
      meta,
    );
  }
  accept(id: string, actorId: string, meta?: RequestMetadata) {
    return this.transition(
      id,
      'ACCEPTED',
      ['NEW', 'SHORTLISTED'],
      actorId,
      'NEOTRIO_IDEA_ACCEPTED',
      meta,
    );
  }
  archive(id: string, actorId: string, meta?: RequestMetadata) {
    return this.transition(
      id,
      'ARCHIVED',
      ['NEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'],
      actorId,
      'NEOTRIO_IDEA_ARCHIVED',
      meta,
    );
  }

  async convert(id: string, actorId: string, meta?: RequestMetadata) {
    const idea = await this.get(id);
    if (idea.production)
      return {
        ...(await this.prisma.neoTrioProduction.findUniqueOrThrow({
          where: { id: idea.production.id },
          include: productionInclude,
        })),
        duplicate: true,
      };
    if (idea.status !== 'ACCEPTED')
      throw new ConflictException(
        'Only an ACCEPTED idea can be converted to production.',
      );
    try {
      const production = await this.prisma.$transaction(async (tx) => {
        const year = new Date().getUTCFullYear();
        const counter = await tx.neoTrioProductionCounter.upsert({
          where: { year },
          create: { year, nextNumber: 2 },
          update: { nextNumber: { increment: 1 } },
        });
        const created = await tx.neoTrioProduction.create({
          data: {
            productionCode: `NEOTRIO-${year}-${String(counter.nextNumber - 1).padStart(6, '0')}`,
            title: idea.title,
            description: idea.description,
            productionType: productionType(idea.ideaType),
            ideaId: idea.id,
            campaignId: idea.campaignId,
            dealId: idea.dealId,
            assignedUserId: idea.assignedUserId,
            priority: idea.priority,
            createdById: actorId,
            updatedById: actorId,
            characters: {
              create: idea.characters.map(({ characterId }) => ({
                characterId,
              })),
            },
          },
          include: productionInclude,
        });
        await tx.neoTrioIdea.update({
          where: { id },
          data: { status: 'CONVERTED' },
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'NeoTrioIdea',
            entityId: id,
            action: 'NEOTRIO_IDEA_CONVERTED',
            oldValues: { status: idea.status },
            newValues: {
              status: 'CONVERTED',
              productionId: created.id,
              productionCode: created.productionCode,
            },
            requestMetadata: meta,
          },
          tx,
        );
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'NeoTrioProduction',
            entityId: created.id,
            action: 'NEOTRIO_PRODUCTION_CREATED',
            newValues: {
              productionCode: created.productionCode,
              ideaId: idea.id,
              stage: created.stage,
            },
            requestMetadata: meta,
          },
          tx,
        );
        return created;
      });
      return { ...production, duplicate: false };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.neoTrioProduction.findUnique({
          where: { ideaId: id },
          include: productionInclude,
        });
        if (concurrent) return { ...concurrent, duplicate: true };
      }
      throw error;
    }
  }

  private async transition(
    id: string,
    status: 'SHORTLISTED' | 'ACCEPTED' | 'ARCHIVED',
    from: string[],
    actorId: string,
    action: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.get(id);
    if (!from.includes(current.status))
      throw new ConflictException(
        `Invalid idea transition: ${current.status} → ${status}.`,
      );
    const updated = await this.prisma.neoTrioIdea.update({
      where: { id },
      data: { status },
      include: ideaInclude,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioIdea',
      entityId: id,
      action,
      oldValues: { status: current.status },
      newValues: { status },
      requestMetadata: meta,
    });
    return updated;
  }
  private async validateCharacters(ids?: string[]) {
    if (!ids?.length) return;
    if (new Set(ids).size !== ids.length)
      throw new ConflictException('Character tags must be unique.');
    const count = await this.prisma.neoTrioCharacter.count({
      where: { id: { in: ids }, isActive: true },
    });
    if (count !== ids.length)
      throw new NotFoundException(
        'One or more active NeoTrio characters were not found.',
      );
  }
  private async notifyAssigned(
    userId: string,
    entityId: string,
    message: string,
  ) {
    const exists = await this.prisma.notification.findFirst({
      where: {
        userId,
        type: NotificationType.NEOTRIO_IDEA_ASSIGNED,
        entityType: 'NeoTrioIdea',
        entityId,
        isRead: false,
      },
    });
    if (!exists)
      await this.notifications.create({
        userId,
        type: NotificationType.NEOTRIO_IDEA_ASSIGNED,
        title: 'NeoTrio idea assigned',
        message,
        entityType: 'NeoTrioIdea',
        entityId,
      });
  }
}

const productionInclude = {
  characters: { include: { character: true } },
  assignedUser: { select: person },
  campaign: { select: { id: true, campaignCode: true, name: true } },
  deal: { select: { id: true, dealCode: true, title: true } },
} satisfies Prisma.NeoTrioProductionInclude;
function ideaSnapshot(value: {
  ideaCode: string;
  title: string;
  description: string;
  ideaType: string;
  destination: string | null;
  priority: string;
  status: string;
  assignedUserId: string | null;
  campaignId: string | null;
  dealId: string | null;
  characters: { characterId: string }[];
}): Prisma.InputJsonObject {
  return {
    ideaCode: value.ideaCode,
    title: value.title,
    description: value.description,
    ideaType: value.ideaType,
    destination: value.destination,
    priority: value.priority,
    status: value.status,
    assignedUserId: value.assignedUserId,
    campaignId: value.campaignId,
    dealId: value.dealId,
    characterIds: value.characters.map(({ characterId }) => characterId),
  };
}
function productionType(ideaType: string) {
  return ideaType === 'REEL'
    ? ('REEL' as const)
    : ideaType === 'EPISODE'
      ? ('EPISODE' as const)
      : ideaType === 'MEME'
        ? ('MEME' as const)
        : ('OTHER' as const);
}
