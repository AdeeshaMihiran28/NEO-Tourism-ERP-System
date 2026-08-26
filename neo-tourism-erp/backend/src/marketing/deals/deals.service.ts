import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MarketingChannel,
  MarketingDealApprovalStatus,
  MarketingDealStatus,
  NotificationType,
  Prisma,
  WebsitePublicationStatus,
} from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { WebsiteDealPublisher } from '../../integrations/website/website-deal.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDealDto,
  DealQueryDto,
  DecisionDto,
  ScheduleDealDto,
  SuspendDealDto,
  UpdateDealChannelDto,
  UpdateDealDto,
} from './dto/deal.dto';

const dealInclude = {
  channels: { orderBy: { channel: 'asc' as const } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.MarketingDealInclude;

const materialFields = [
  'price',
  'travelStartDate',
  'travelEndDate',
  'departureLocation',
  'departureDate',
  'baggage',
  'expiryAt',
  'keyTerms',
] as const;

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly website: WebsiteDealPublisher,
  ) {}

  async list(query: DealQueryDto) {
    const where: Prisma.MarketingDealWhereInput = {
      ...(query.search && {
        OR: [
          { dealCode: { contains: query.search, mode: 'insensitive' } },
          { title: { contains: query.search, mode: 'insensitive' } },
          { destination: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.destination && {
        destination: { contains: query.destination, mode: 'insensitive' },
      }),
      ...(query.status && { status: query.status }),
      ...(query.approvalStatus && { approvalStatus: query.approvalStatus }),
      ...(query.channel && { channels: { some: { channel: query.channel } } }),
      ...(query.expiryFrom || query.expiryTo
        ? {
            expiryAt: {
              ...(query.expiryFrom && { gte: new Date(query.expiryFrom) }),
              ...(query.expiryTo && { lte: new Date(query.expiryTo) }),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.marketingDeal.findMany({
        where,
        include: dealInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.marketingDeal.count({ where }),
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
    const deal = await this.prisma.marketingDeal.findUnique({
      where: { id },
      include: dealInclude,
    });
    if (!deal) throw new NotFoundException('Marketing deal not found.');
    const auditHistory = await this.prisma.auditLog.findMany({
      where: { entityType: 'MarketingDeal', entityId: id },
      select: {
        id: true,
        action: true,
        oldValues: true,
        newValues: true,
        metadata: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { ...deal, auditHistory };
  }

  async create(dto: CreateDealDto, actorId: string, meta?: RequestMetadata) {
    this.validateDates(dto);
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const counter = await tx.marketingDealCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      const deal = await tx.marketingDeal.create({
        data: {
          dealCode: `DEAL-${year}-${String(counter.nextNumber - 1).padStart(6, '0')}`,
          ...this.toCreateData(dto),
          createdById: actorId,
          updatedById: actorId,
          channels: {
            create: Object.values(MarketingChannel).map((channel) => ({
              channel,
            })),
          },
        },
        include: dealInclude,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingDeal',
          entityId: deal.id,
          action: 'MARKETING_DEAL_CREATED',
          newValues: {
            dealCode: deal.dealCode,
            title: deal.title,
            destination: deal.destination,
            price: deal.price.toString(),
            status: deal.status,
            approvalStatus: deal.approvalStatus,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return deal;
    });
  }

  async update(
    id: string,
    dto: UpdateDealDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.requireDeal(id);
    if (
      current.status === MarketingDealStatus.EXPIRED ||
      current.status === MarketingDealStatus.SUSPENDED
    )
      throw new ConflictException(
        'Expired or suspended deals cannot be edited.',
      );
    this.validateDates({
      travelStartDate:
        dto.travelStartDate ?? current.travelStartDate.toISOString(),
      travelEndDate: dto.travelEndDate ?? current.travelEndDate.toISOString(),
      expiryAt: dto.expiryAt ?? current.expiryAt.toISOString(),
    });
    const materialChanges = materialFields.filter((field) => {
      const next = dto[field as keyof UpdateDealDto];
      if (next === undefined) return false;
      const old = current[field as keyof typeof current];
      return normalize(old) !== normalize(next);
    });
    const controlled =
      current.approvalStatus === MarketingDealApprovalStatus.APPROVED ||
      current.status === MarketingDealStatus.LIVE ||
      current.status === MarketingDealStatus.EXPIRING;
    if (controlled && materialChanges.length && !dto.changeReason?.trim())
      throw new BadRequestException(
        'A change reason is required for material changes to an approved or live deal.',
      );
    const editable = { ...dto };
    delete editable.changeReason;
    const data: Prisma.MarketingDealUpdateInput = {
      ...editable,
      ...(dto.departureDate && { departureDate: new Date(dto.departureDate) }),
      ...(dto.travelStartDate && {
        travelStartDate: new Date(dto.travelStartDate),
      }),
      ...(dto.travelEndDate && { travelEndDate: new Date(dto.travelEndDate) }),
      ...(dto.expiryAt && { expiryAt: new Date(dto.expiryAt) }),
      ...(dto.currency && { currency: dto.currency.toUpperCase() }),
      updatedBy: { connect: { id: actorId } },
      ...(controlled &&
        materialChanges.length && { contentReviewRequired: true }),
    };
    const updated = await this.prisma.marketingDeal.update({
      where: { id },
      data,
      include: dealInclude,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'MarketingDeal',
      entityId: id,
      action: materialChanges.length
        ? 'MARKETING_DEAL_MATERIAL_CHANGE'
        : 'MARKETING_DEAL_UPDATED',
      oldValues: snapshot(current, Object.keys(editable)),
      newValues: snapshot(updated, Object.keys(editable)),
      metadata: {
        materialFields: materialChanges,
        changeReason: dto.changeReason ?? null,
        connectedContentWarning:
          controlled && materialChanges.length
            ? 'Connected marketing content may require review.'
            : null,
      },
      requestMetadata: meta,
    });
    if (controlled && materialChanges.length)
      await this.flagConnectedCreative(
        id,
        actorId,
        materialChanges,
        dto.changeReason!,
        meta,
      );
    return updated;
  }

  async submit(id: string, actorId: string, meta?: RequestMetadata) {
    const deal = await this.requireDeal(id);
    if (
      deal.approvalStatus !== MarketingDealApprovalStatus.DRAFT &&
      deal.approvalStatus !== MarketingDealApprovalStatus.REJECTED
    )
      throw new ConflictException(
        'This deal cannot be submitted for approval.',
      );
    const updated = await this.prisma.marketingDeal.update({
      where: { id },
      data: { approvalStatus: 'PENDING_APPROVAL', updatedById: actorId },
      include: dealInclude,
    });
    await this.auditAction(
      deal,
      updated,
      actorId,
      'MARKETING_DEAL_SUBMITTED_FOR_APPROVAL',
      meta,
    );
    await this.notifyPermission('marketing.deal.approve', {
      type: NotificationType.MARKETING_DEAL_APPROVAL_REQUIRED,
      title: 'Deal approval required',
      message: `${deal.dealCode} is ready for approval.`,
      entityId: id,
    });
    return updated;
  }

  async approve(
    id: string,
    dto: DecisionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const deal = await this.requireDeal(id);
    if (deal.approvalStatus !== MarketingDealApprovalStatus.PENDING_APPROVAL)
      throw new ConflictException('Only pending deals can be approved.');
    const updated = await this.prisma.marketingDeal.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedById: actorId,
        approvedAt: new Date(),
        updatedById: actorId,
        contentReviewRequired: false,
      },
      include: dealInclude,
    });
    await this.auditAction(
      deal,
      updated,
      actorId,
      'MARKETING_DEAL_APPROVED',
      meta,
      dto.comment,
    );
    await this.notifyUser(
      deal.createdById,
      NotificationType.MARKETING_DEAL_APPROVED,
      'Deal approved',
      `${deal.dealCode} was approved.`,
      id,
    );
    return updated;
  }

  async reject(
    id: string,
    dto: DecisionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const deal = await this.requireDeal(id);
    if (deal.approvalStatus !== MarketingDealApprovalStatus.PENDING_APPROVAL)
      throw new ConflictException('Only pending deals can be rejected.');
    const updated = await this.prisma.marketingDeal.update({
      where: { id },
      data: { approvalStatus: 'REJECTED', updatedById: actorId },
      include: dealInclude,
    });
    await this.auditAction(
      deal,
      updated,
      actorId,
      'MARKETING_DEAL_REJECTED',
      meta,
      dto.comment,
    );
    await this.notifyUser(
      deal.createdById,
      NotificationType.MARKETING_DEAL_REJECTED,
      'Deal rejected',
      `${deal.dealCode} was rejected.`,
      id,
    );
    return updated;
  }

  async schedule(
    id: string,
    dto: ScheduleDealDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const deal = await this.requireDeal(id);
    const scheduledFor = new Date(dto.scheduledFor);
    if (deal.approvalStatus !== MarketingDealApprovalStatus.APPROVED)
      throw new ConflictException('Only approved deals can be scheduled.');
    if (scheduledFor <= new Date() || scheduledFor >= deal.expiryAt)
      throw new BadRequestException(
        'Schedule time must be in the future and before expiry.',
      );
    const updated = await this.prisma.marketingDeal.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledFor, updatedById: actorId },
      include: dealInclude,
    });
    await this.auditAction(
      deal,
      updated,
      actorId,
      'MARKETING_DEAL_SCHEDULED',
      meta,
    );
    return updated;
  }

  async goLive(id: string, actorId: string, meta?: RequestMetadata) {
    const deal = await this.requireDeal(id);
    if (deal.approvalStatus !== MarketingDealApprovalStatus.APPROVED)
      throw new ConflictException(
        'A deal must be approved before it can go live.',
      );
    if (deal.expiryAt <= new Date())
      throw new ConflictException('Expired deals cannot go live.');
    if (
      deal.status === MarketingDealStatus.SUSPENDED ||
      deal.status === MarketingDealStatus.EXPIRED
    )
      throw new ConflictException('This deal cannot go live.');
    const status = withinExpiryThreshold(deal.expiryAt) ? 'EXPIRING' : 'LIVE';
    let updated = await this.prisma.marketingDeal.update({
      where: { id },
      data: {
        status,
        scheduledFor: null,
        updatedById: actorId,
        websitePublicationStatus: WebsitePublicationStatus.PENDING,
      },
      include: dealInclude,
    });
    await this.auditAction(deal, updated, actorId, 'MARKETING_DEAL_LIVE', meta);
    const result = await this.website.publishDeal(updated);
    updated = await this.applyWebsiteResult(updated.id, result, false);
    return updated;
  }

  async suspend(
    id: string,
    dto: SuspendDealDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const deal = await this.requireDeal(id);
    if (deal.status === MarketingDealStatus.SUSPENDED)
      throw new ConflictException('This deal is already suspended.');
    if (deal.status === MarketingDealStatus.EXPIRED)
      throw new ConflictException('Expired deals cannot be suspended.');
    let updated = await this.prisma.marketingDeal.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedById: actorId,
        suspensionReason: dto.reason.trim(),
        updatedById: actorId,
        websitePublicationStatus: WebsitePublicationStatus.PENDING,
        channels: {
          updateMany: {
            where: { status: { in: ['LIVE', 'SCHEDULED'] } },
            data: { status: 'FAILED' },
          },
        },
      },
      include: dealInclude,
    });
    await this.auditAction(
      deal,
      updated,
      actorId,
      'MARKETING_DEAL_SUSPENDED',
      meta,
      dto.reason,
    );
    await this.notifyUser(
      deal.createdById,
      NotificationType.MARKETING_DEAL_SUSPENDED,
      'Deal suspended',
      `${deal.dealCode} was suspended: ${dto.reason}`,
      id,
    );
    const result = await this.website.unpublishDeal(updated);
    updated = await this.applyWebsiteResult(updated.id, result, true);
    return updated;
  }

  async updateChannel(
    id: string,
    dto: UpdateDealChannelDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    await this.requireDeal(id);
    const channel = await this.prisma.marketingDealChannel.upsert({
      where: { dealId_channel: { dealId: id, channel: dto.channel } },
      create: {
        dealId: id,
        channel: dto.channel,
        status: dto.status,
        externalReference: dto.externalReference,
        ...(dto.publishedAt && { publishedAt: new Date(dto.publishedAt) }),
      },
      update: {
        status: dto.status,
        externalReference: dto.externalReference,
        ...(dto.publishedAt && { publishedAt: new Date(dto.publishedAt) }),
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'MarketingDeal',
      entityId: id,
      action: 'MARKETING_DEAL_CHANNEL_UPDATED',
      newValues: {
        channel: dto.channel,
        status: dto.status,
        externalReference: dto.externalReference ?? null,
      },
      requestMetadata: meta,
    });
    return channel;
  }

  salesAvailable() {
    return this.prisma.marketingDeal.findMany({
      where: {
        approvalStatus: 'APPROVED',
        status: { in: ['LIVE', 'EXPIRING'] },
        expiryAt: { gt: new Date() },
      },
      select: {
        id: true,
        dealCode: true,
        title: true,
        shortDescription: true,
        destination: true,
        departureLocation: true,
        departureDate: true,
        travelStartDate: true,
        travelEndDate: true,
        price: true,
        currency: true,
        baggage: true,
        keyTerms: true,
        expiryAt: true,
        status: true,
      },
      orderBy: [{ expiryAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async salesAvailableOne(id: string) {
    const deals = await this.prisma.marketingDeal.findMany({
      where: {
        id,
        approvalStatus: 'APPROVED',
        status: { in: ['LIVE', 'EXPIRING'] },
        expiryAt: { gt: new Date() },
      },
      select: {
        id: true,
        dealCode: true,
        title: true,
        shortDescription: true,
        destination: true,
        departureLocation: true,
        departureDate: true,
        travelStartDate: true,
        travelEndDate: true,
        price: true,
        currency: true,
        baggage: true,
        keyTerms: true,
        expiryAt: true,
        status: true,
      },
      take: 1,
    });
    if (!deals[0]) throw new NotFoundException('Approved offer not found.');
    return deals[0];
  }

  async summary() {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrow = new Date(today.getTime() + 86400000);
    const [
      live,
      scheduled,
      expiring,
      expired,
      expiredToday,
      suspended,
      pendingApproval,
    ] = await Promise.all([
      this.prisma.marketingDeal.count({ where: { status: 'LIVE' } }),
      this.prisma.marketingDeal.count({ where: { status: 'SCHEDULED' } }),
      this.prisma.marketingDeal.count({ where: { status: 'EXPIRING' } }),
      this.prisma.marketingDeal.count({ where: { status: 'EXPIRED' } }),
      this.prisma.marketingDeal.count({
        where: { status: 'EXPIRED', expiryAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.marketingDeal.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.marketingDeal.count({
        where: { approvalStatus: 'PENDING_APPROVAL' },
      }),
    ]);
    return {
      live,
      scheduled,
      expiring,
      expired,
      expiredToday,
      suspended,
      pendingApproval,
    };
  }

  private requireDeal(id: string) {
    return this.prisma.marketingDeal
      .findUnique({ where: { id }, include: dealInclude })
      .then((deal) => {
        if (!deal) throw new NotFoundException('Marketing deal not found.');
        return deal;
      });
  }

  private validateDates(dto: {
    travelStartDate: string;
    travelEndDate: string;
    expiryAt: string;
  }) {
    if (new Date(dto.travelEndDate) < new Date(dto.travelStartDate))
      throw new BadRequestException(
        'Travel end date must be on or after the start date.',
      );
    if (new Date(dto.expiryAt) <= new Date())
      throw new BadRequestException(
        'Expiry must be in the future when creating or editing a deal.',
      );
  }

  private toCreateData(dto: CreateDealDto) {
    return {
      title: dto.title.trim(),
      shortDescription: dto.shortDescription?.trim(),
      destination: dto.destination.trim(),
      departureLocation: dto.departureLocation.trim(),
      ...(dto.departureDate && { departureDate: new Date(dto.departureDate) }),
      travelStartDate: new Date(dto.travelStartDate),
      travelEndDate: new Date(dto.travelEndDate),
      price: new Prisma.Decimal(dto.price),
      currency: dto.currency.toUpperCase(),
      baggage: dto.baggage?.trim(),
      keyTerms: dto.keyTerms.trim(),
      expiryAt: new Date(dto.expiryAt),
    };
  }

  private async auditAction(
    oldDeal: object,
    newDeal: { id: string },
    actorId: string,
    action: string,
    meta?: RequestMetadata,
    reason?: string,
  ) {
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'MarketingDeal',
      entityId: newDeal.id,
      action,
      oldValues: oldDeal,
      newValues: newDeal,
      metadata: { reason: reason ?? null },
      requestMetadata: meta,
    });
  }

  private async notifyPermission(
    permission: string,
    event: {
      type: NotificationType;
      title: string;
      message: string;
      entityId: string;
    },
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
        this.notifications.create({
          userId: id,
          ...event,
          entityType: 'MarketingDeal',
        }),
      ),
    );
  }

  private notifyUser(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    entityId: string,
  ) {
    return this.notifications.create({
      userId,
      type,
      title,
      message,
      entityType: 'MarketingDeal',
      entityId,
    });
  }

  private async applyWebsiteResult(
    id: string,
    result: { status: string; message?: string },
    unpublish: boolean,
  ) {
    const status =
      result.status === 'SUCCESS'
        ? unpublish
          ? WebsitePublicationStatus.UNPUBLISHED
          : WebsitePublicationStatus.PUBLISHED
        : result.status === 'NOT_CONFIGURED'
          ? WebsitePublicationStatus.NOT_CONFIGURED
          : WebsitePublicationStatus.FAILED;
    if (result.status === 'FAILED')
      await this.notifyPermission('marketing.deal.channel.manage', {
        type: NotificationType.MARKETING_DEAL_CHANNEL_FAILURE,
        title: 'Website deal action failed',
        message: result.message ?? 'Website action failed — action required.',
        entityId: id,
      });
    return this.prisma.marketingDeal.update({
      where: { id },
      data: {
        websitePublicationStatus: status,
        websiteActionMessage:
          result.status === 'FAILED'
            ? result.message
            : result.status === 'NOT_CONFIGURED'
              ? 'Website publishing API is not configured.'
              : null,
      },
      include: dealInclude,
    });
  }

  private async flagConnectedCreative(
    dealId: string,
    actorId: string,
    fields: string[],
    reason: string,
    meta?: RequestMetadata,
  ) {
    const connected = await this.prisma.marketingContent.findMany({
      where: {
        dealId,
        stage: { in: ['READY', 'LIVE'] },
        reviewRequired: false,
      },
    });
    for (const content of connected) {
      await this.prisma.$transaction(async (tx) => {
        await tx.marketingContent.update({
          where: { id: content.id },
          data: {
            reviewRequired: true,
            dealReviewReason: `Connected Deal changed: ${fields.join(', ')}.`,
          },
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'MarketingContent',
            entityId: content.id,
            action: 'MARKETING_CONTENT_DEAL_REVIEW_REQUIRED',
            oldValues: { reviewRequired: false },
            newValues: { reviewRequired: true, changedFields: fields },
            metadata: { dealId, reason },
            requestMetadata: meta,
          },
          tx,
        );
      });
      const recipients = new Set(
        [content.assignedUserId, content.createdById].filter(
          (userId): userId is string => Boolean(userId),
        ),
      );
      await Promise.all(
        [...recipients].map((userId) =>
          this.notifications.create({
            userId,
            type: NotificationType.CONNECTED_DEAL_CHANGED,
            title: 'Connected deal updated',
            message: `${content.contentCode} requires creative review because its Deal Card changed.`,
            entityType: 'MarketingContent',
            entityId: content.id,
          }),
        ),
      );
    }
  }
}

function withinExpiryThreshold(expiryAt: Date, now = new Date()) {
  return expiryAt.getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
}

function normalize(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  return '';
}

function snapshot(source: object, keys: string[]): Prisma.InputJsonObject {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      normalize((source as Record<string, unknown>)[key]),
    ]),
  );
}
