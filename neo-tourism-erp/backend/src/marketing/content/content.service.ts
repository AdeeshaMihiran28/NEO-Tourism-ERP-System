import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MarketingContentApprovalStatus,
  MarketingContentStage,
  NotificationType,
  Prisma,
} from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApprovalQueryDto,
  AssignContentDto,
  BoardQueryDto,
  CreateCommentDto,
  CreateContentDto,
  CreateVersionDto,
  PublishPublicationDto,
  ReviewCommentDto,
  SchedulePublicationDto,
  StageDto,
  UpdateContentDto,
} from './dto/content.dto';
import { validateCreativeFileMetadata } from './content-file-metadata';

const userSelect = { id: true, firstName: true, lastName: true } as const;
const cardInclude = {
  assignedUser: { select: userSelect },
  createdBy: { select: userSelect },
  campaign: { select: { id: true, campaignCode: true, name: true } },
  deal: { select: { id: true, dealCode: true, title: true } },
  currentVersion: { select: { id: true, versionNumber: true } },
} satisfies Prisma.MarketingContentInclude;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async options() {
    const [users, campaigns, deals] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: {
            some: {
              role: {
                permissions: {
                  some: { permission: { code: 'marketing.content.view' } },
                },
              },
            },
          },
        },
        select: userSelect,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.marketingCampaign.findMany({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        select: { id: true, campaignCode: true, name: true, dealId: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketingDeal.findMany({
        where: { status: { notIn: ['EXPIRED', 'SUSPENDED'] } },
        select: { id: true, dealCode: true, title: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    return { users, campaigns, deals };
  }

  async board(query: BoardQueryDto) {
    const items = await this.prisma.marketingContent.findMany({
      where: {
        stage: { in: ['IDEA', 'CREATING', 'REVIEW', 'READY', 'LIVE'] },
        ...(query.assignedUserId && { assignedUserId: query.assignedUserId }),
        ...(query.contentType && { contentType: query.contentType }),
        ...(query.campaignId && { campaignId: query.campaignId }),
        ...(query.dealId && { dealId: query.dealId }),
        ...(query.priority && { priority: query.priority }),
        ...(query.deadlineFrom || query.deadlineTo
          ? {
              deadline: {
                ...(query.deadlineFrom && {
                  gte: new Date(query.deadlineFrom),
                }),
                ...(query.deadlineTo && { lte: new Date(query.deadlineTo) }),
              },
            }
          : {}),
        ...(query.search && {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { contentCode: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: cardInclude,
      orderBy: [
        { priority: 'desc' },
        { deadline: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 500,
    });
    return Object.fromEntries(
      ['IDEA', 'CREATING', 'REVIEW', 'READY', 'LIVE'].map((stage) => [
        stage,
        items.filter((item) => item.stage === stage),
      ]),
    );
  }

  async create(dto: CreateContentDto, actorId: string, meta?: RequestMetadata) {
    const links = await this.validateLinks(
      dto.campaignId,
      dto.dealId,
      dto.assignedUserId,
    );
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const counter = await tx.marketingContentCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      const content = await tx.marketingContent.create({
        data: {
          contentCode: `CONTENT-${year}-${String(counter.nextNumber - 1).padStart(6, '0')}`,
          title: dto.title,
          description: dto.description,
          contentType: dto.contentType,
          campaignId: dto.campaignId,
          dealId: links.dealId,
          assignedUserId: dto.assignedUserId,
          ...(dto.deadline && { deadline: new Date(dto.deadline) }),
          priority: dto.priority,
          createdById: actorId,
          updatedById: actorId,
        },
        include: cardInclude,
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingContent',
          entityId: content.id,
          action: 'MARKETING_CONTENT_CREATED',
          newValues: {
            contentCode: content.contentCode,
            title: content.title,
            stage: content.stage,
            contentType: content.contentType,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return content;
    });
  }

  async get(id: string) {
    const content = await this.prisma.marketingContent.findUnique({
      where: { id },
      include: {
        ...cardInclude,
        versions: {
          include: {
            createdBy: { select: userSelect },
            approvals: { include: { reviewer: { select: userSelect } } },
          },
          orderBy: { versionNumber: 'desc' },
        },
        approvals: {
          include: {
            contentVersion: true,
            requestedBy: { select: userSelect },
            reviewer: { select: userSelect },
          },
          orderBy: { createdAt: 'desc' },
        },
        comments: {
          include: { user: { select: userSelect } },
          orderBy: { createdAt: 'asc' },
        },
        publications: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!content) throw new NotFoundException('Marketing content not found.');
    const auditSummary = await this.prisma.auditLog.findMany({
      where: { entityType: 'MarketingContent', entityId: id },
      select: {
        id: true,
        action: true,
        oldValues: true,
        newValues: true,
        metadata: true,
        createdAt: true,
        actor: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { ...content, auditSummary };
  }

  async update(
    id: string,
    dto: UpdateContentDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.requireContent(id);
    if (
      [
        MarketingContentStage.ARCHIVED,
        MarketingContentStage.CANCELLED,
      ].includes(current.stage as never)
    )
      throw new ConflictException(
        'Archived or cancelled content cannot be edited.',
      );
    const links = await this.validateLinks(
      dto.campaignId ?? current.campaign?.id,
      dto.dealId ?? current.deal?.id,
    );
    const updated = await this.prisma.marketingContent.update({
      where: { id },
      data: {
        ...dto,
        ...((dto.campaignId || dto.dealId) && { dealId: links.dealId }),
        ...(dto.deadline && { deadline: new Date(dto.deadline) }),
        updatedById: actorId,
      },
      include: cardInclude,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'MarketingContent',
      entityId: id,
      action: 'MARKETING_CONTENT_UPDATED',
      oldValues: metadataSnapshot(current),
      newValues: metadataSnapshot(updated),
      requestMetadata: meta,
    });
    return updated;
  }

  async stage(
    id: string,
    dto: StageDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const content = await this.requireContent(id);
    const allowed =
      (content.stage === 'IDEA' && dto.stage === 'CREATING') ||
      dto.stage === 'ARCHIVED' ||
      dto.stage === 'CANCELLED';
    if (!allowed) {
      if (dto.stage === 'READY')
        throw new ConflictException(
          'Only an approved version can move content to READY.',
        );
      if (dto.stage === 'LIVE')
        throw new ConflictException(
          'Use the controlled publish action for READY content.',
        );
      if (dto.stage === 'REVIEW')
        throw new ConflictException(
          'Use submit-review so approval remains version-specific.',
        );
      if (content.stage === 'REVIEW' && dto.stage === 'CREATING')
        throw new ConflictException(
          'Only a reviewer change request can return REVIEW content to CREATING.',
        );
      throw new ConflictException(
        `Invalid content transition: ${content.stage} → ${dto.stage}.`,
      );
    }
    return this.changeStage(
      content,
      dto.stage,
      actorId,
      'MARKETING_CONTENT_STAGE_CHANGED',
      meta,
    );
  }

  async assign(
    id: string,
    dto: AssignContentDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const content = await this.requireContent(id);
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, isActive: true },
    });
    if (!user) throw new NotFoundException('Active assignee not found.');
    const updated = await this.prisma.marketingContent.update({
      where: { id },
      data: { assignedUserId: dto.userId, updatedById: actorId },
      include: cardInclude,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'MarketingContent',
      entityId: id,
      action: 'MARKETING_CONTENT_ASSIGNED',
      oldValues: { assignedUserId: content.assignedUserId },
      newValues: { assignedUserId: dto.userId },
      requestMetadata: meta,
    });
    await this.notifications.create({
      userId: dto.userId,
      type: NotificationType.MARKETING_CONTENT_ASSIGNED,
      title: 'Creative content assigned',
      message: `${content.contentCode}: ${content.title}`,
      entityType: 'MarketingContent',
      entityId: id,
    });
    return updated;
  }

  async addVersion(
    id: string,
    dto: CreateVersionDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    validateCreativeFileMetadata(dto);
    if (
      ![dto.fileName, dto.storageKey, dto.caption, dto.copyText].some((value) =>
        value?.trim(),
      )
    )
      throw new BadRequestException(
        'Provide file metadata, caption, or copy text for the version.',
      );
    const content = await this.requireContent(id);
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.marketingContentVersion.findFirst({
        where: { contentId: id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const version = await tx.marketingContentVersion.create({
        data: {
          contentId: id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          ...dto,
          createdById: actorId,
        },
      });
      const wasApproved = content.stage === 'READY' || content.stage === 'LIVE';
      await tx.marketingContent.update({
        where: { id },
        data: {
          currentVersionId: version.id,
          updatedById: actorId,
          ...(wasApproved && { stage: 'CREATING', reviewRequired: true }),
        },
      });
      if (wasApproved)
        await tx.marketingPublication.updateMany({
          where: { contentId: id, status: 'SCHEDULED' },
          data: { status: 'REMOVED' },
        });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingContent',
          entityId: id,
          action: 'MARKETING_CONTENT_VERSION_CREATED',
          newValues: {
            versionId: version.id,
            versionNumber: version.versionNumber,
            fileName: version.fileName,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return version;
    });
  }

  versions(id: string) {
    return this.requireContent(id).then(() =>
      this.prisma.marketingContentVersion.findMany({
        where: { contentId: id },
        include: { createdBy: { select: userSelect }, approvals: true },
        orderBy: { versionNumber: 'desc' },
      }),
    );
  }

  async submitReview(id: string, actorId: string, meta?: RequestMetadata) {
    const content = await this.requireContent(id);
    if (content.stage !== MarketingContentStage.CREATING)
      throw new ConflictException(
        'Only CREATING content can be submitted for review.',
      );
    if (!content.currentVersionId)
      throw new ConflictException(
        'Create a content version before submitting for review.',
      );
    const pending = await this.prisma.marketingContentApproval.findFirst({
      where: { contentId: id, status: 'PENDING' },
    });
    if (pending)
      throw new ConflictException('This content already has a pending review.');
    const approval = await this.prisma.$transaction(async (tx) => {
      const created = await tx.marketingContentApproval.create({
        data: {
          contentId: id,
          contentVersionId: content.currentVersionId!,
          requestedById: actorId,
        },
      });
      await tx.marketingContent.update({
        where: { id },
        data: { stage: 'REVIEW', updatedById: actorId },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingContent',
          entityId: id,
          action: 'MARKETING_CONTENT_SUBMITTED_FOR_REVIEW',
          oldValues: { stage: content.stage },
          newValues: {
            stage: 'REVIEW',
            versionId: content.currentVersionId,
            approvalId: created.id,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return created;
    });
    await this.notifyPermission(
      'marketing.approval.approve',
      NotificationType.MARKETING_CONTENT_REVIEW_REQUIRED,
      'Creative review required',
      `${content.contentCode} is ready for Greenlight review.`,
      id,
    );
    return approval;
  }

  async approvals(query: ApprovalQueryDto) {
    const where: Prisma.MarketingContentApprovalWhereInput = {
      status: query.status,
      ...(query.reviewerUserId && { reviewerUserId: query.reviewerUserId }),
      ...(query.contentType && { content: { contentType: query.contentType } }),
      ...(query.campaignId && { content: { campaignId: query.campaignId } }),
      ...(query.dealId && { content: { dealId: query.dealId } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.marketingContentApproval.findMany({
        where,
        include: {
          content: { include: cardInclude },
          contentVersion: true,
          requestedBy: { select: userSelect },
          reviewer: { select: userSelect },
        },
        orderBy: { requestedAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.marketingContentApproval.count({ where }),
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

  async approve(approvalId: string, actorId: string, meta?: RequestMetadata) {
    const approval = await this.requireApproval(approvalId);
    if (approval.status !== 'PENDING')
      throw new ConflictException('Only pending approvals can be approved.');
    if (
      approval.content.stage !== 'REVIEW' ||
      approval.content.currentVersionId !== approval.contentVersionId
    )
      throw new ConflictException(
        'The submitted version is no longer the current REVIEW version.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.marketingContentApproval.update({
        where: { id: approvalId },
        data: {
          status: 'APPROVED',
          reviewerUserId: actorId,
          reviewedAt: new Date(),
        },
      });
      await tx.marketingContent.update({
        where: { id: approval.contentId },
        data: {
          stage: 'READY',
          currentVersionId: approval.contentVersionId,
          reviewRequired: false,
          dealReviewReason: null,
          updatedById: actorId,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingContent',
          entityId: approval.contentId,
          action: 'MARKETING_CONTENT_APPROVED',
          oldValues: { stage: 'REVIEW', approvalStatus: 'PENDING' },
          newValues: {
            stage: 'READY',
            approvalStatus: 'APPROVED',
            versionId: approval.contentVersionId,
            reviewerUserId: actorId,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return result;
    });
    await this.notifyParticipants(
      approval.content,
      NotificationType.MARKETING_CONTENT_APPROVED,
      'Creative approved',
      `${approval.content.contentCode} is READY.`,
    );
    await this.syncNeoTrioApproval(
      approval.contentId,
      'READY',
      actorId,
      NotificationType.NEOTRIO_PRODUCTION_APPROVED,
      'NeoTrio production approved',
      meta,
    );
    return updated;
  }

  requestChanges(
    approvalId: string,
    dto: ReviewCommentDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    return this.reviewNegative(
      approvalId,
      'CHANGES_REQUESTED',
      'CREATING',
      dto.comment,
      actorId,
      'MARKETING_CONTENT_CHANGES_REQUESTED',
      NotificationType.MARKETING_CONTENT_CHANGES_REQUESTED,
      meta,
    );
  }

  reject(
    approvalId: string,
    dto: ReviewCommentDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    return this.reviewNegative(
      approvalId,
      'REJECTED',
      'IDEA',
      dto.comment,
      actorId,
      'MARKETING_CONTENT_REJECTED',
      NotificationType.MARKETING_CONTENT_REJECTED,
      meta,
    );
  }

  async goLive(id: string, actorId: string, meta?: RequestMetadata) {
    const content = await this.requireContent(id);
    if (content.stage !== 'READY' || !content.currentVersionId)
      throw new ConflictException(
        'Only READY content with an approved version can be marked LIVE.',
      );
    const approved = await this.prisma.marketingContentApproval.findFirst({
      where: {
        contentId: id,
        contentVersionId: content.currentVersionId,
        status: 'APPROVED',
      },
    });
    if (!approved)
      throw new ConflictException('The current version is not approved.');
    return this.changeStage(
      content,
      'LIVE',
      actorId,
      'MARKETING_CONTENT_MARKED_LIVE',
      meta,
    );
  }

  async schedulePublication(
    id: string,
    dto: SchedulePublicationDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const content = await this.requireContent(id);
    if (
      content.stage !== 'READY' ||
      content.reviewRequired ||
      !content.currentVersionId
    )
      throw new ConflictException('Only approved READY content can be scheduled.');
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date())
      throw new BadRequestException('Publication time must be in the future.');
    const [approved, existing] = await Promise.all([
      this.prisma.marketingContentApproval.findFirst({
        where: {
          contentId: id,
          contentVersionId: content.currentVersionId,
          status: 'APPROVED',
        },
        select: { id: true },
      }),
      this.prisma.marketingPublication.findFirst({
        where: {
          contentId: id,
          contentVersionId: content.currentVersionId,
          channel: dto.channel,
          status: { in: ['DRAFT', 'SCHEDULED'] },
        },
        select: { id: true },
      }),
    ]);
    if (!approved)
      throw new ConflictException('The current content version is not approved.');
    if (existing)
      throw new ConflictException('This version is already scheduled for that channel.');
    return this.prisma.$transaction(async (tx) => {
      const publication = await tx.marketingPublication.create({
        data: {
          contentId: id,
          contentVersionId: content.currentVersionId!,
          channel: dto.channel,
          status: 'SCHEDULED',
          scheduledAt,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingPublication',
          entityId: publication.id,
          action: 'MARKETING_PUBLICATION_SCHEDULED',
          newValues: {
            contentId: id,
            contentVersionId: content.currentVersionId,
            channel: dto.channel,
            scheduledAt,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return publication;
    });
  }

  async publishPublication(
    id: string,
    dto: PublishPublicationDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const publication = await this.prisma.marketingPublication.findUnique({
      where: { id },
      include: { content: true },
    });
    if (!publication) throw new NotFoundException('Publication not found.');
    if (publication.status !== 'SCHEDULED')
      throw new ConflictException('Only scheduled publications can be confirmed published.');
    if (publication.content.reviewRequired)
      throw new ConflictException('This content requires approval again before publishing.');
    if (publication.content.currentVersionId !== publication.contentVersionId)
      throw new ConflictException('The scheduled version is no longer current.');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.marketingPublication.updateMany({
        where: { id, status: 'SCHEDULED' },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          externalReference: dto.externalReference,
        },
      });
      if (!claimed.count)
        throw new ConflictException('This publication has already been processed.');
      const updated = await tx.marketingPublication.findUniqueOrThrow({
        where: { id },
      });
      await tx.marketingContent.update({
        where: { id: publication.contentId },
        data: { stage: 'LIVE', updatedById: actorId },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingPublication',
          entityId: id,
          action: 'MARKETING_PUBLICATION_CONFIRMED',
          oldValues: { status: publication.status },
          newValues: {
            status: updated.status,
            publishedAt: updated.publishedAt,
            externalReference: updated.externalReference,
          },
          requestMetadata: meta,
        },
        tx,
      );
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingContent',
          entityId: publication.contentId,
          action: 'MARKETING_CONTENT_MARKED_LIVE',
          oldValues: { stage: publication.content.stage },
          newValues: { stage: 'LIVE', publicationId: id },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
  }

  async comment(id: string, dto: CreateCommentDto, actorId: string) {
    await this.requireContent(id);
    return this.prisma.marketingContentComment.create({
      data: { contentId: id, userId: actorId, comment: dto.comment },
      include: { user: { select: userSelect } },
    });
  }

  async workload() {
    const users = await this.prisma.user.findMany({
      where: {
        assignedMarketingContent: {
          some: { stage: { notIn: ['ARCHIVED', 'CANCELLED'] } },
        },
      },
      select: {
        ...userSelect,
        assignedMarketingContent: {
          where: { stage: { notIn: ['ARCHIVED', 'CANCELLED'] } },
          select: { stage: true, deadline: true },
        },
      },
    });
    const today = utcDay(new Date());
    const tomorrow = new Date(today.getTime() + 86400000);
    return users.map(({ assignedMarketingContent, ...user }) => ({
      ...user,
      assignedContentCount: assignedMarketingContent.length,
      dueToday: assignedMarketingContent.filter(
        (item) =>
          item.deadline && item.deadline >= today && item.deadline < tomorrow,
      ).length,
      overdue: assignedMarketingContent.filter(
        (item) => item.deadline && item.deadline < today,
      ).length,
      inReview: assignedMarketingContent.filter(
        (item) => item.stage === 'REVIEW',
      ).length,
    }));
  }

  private requireContent(id: string) {
    return this.prisma.marketingContent
      .findUnique({ where: { id }, include: cardInclude })
      .then((content) => {
        if (!content)
          throw new NotFoundException('Marketing content not found.');
        return content;
      });
  }

  private requireApproval(id: string) {
    return this.prisma.marketingContentApproval
      .findUnique({ where: { id }, include: { content: true } })
      .then((approval) => {
        if (!approval)
          throw new NotFoundException('Creative approval not found.');
        return approval;
      });
  }

  private async validateLinks(
    campaignId?: string,
    dealId?: string,
    assignedUserId?: string,
  ) {
    const [campaign, deal, assignee] = await Promise.all([
      campaignId
        ? this.prisma.marketingCampaign.findUnique({
            where: { id: campaignId },
            select: { dealId: true },
          })
        : null,
      dealId
        ? this.prisma.marketingDeal.findUnique({
            where: { id: dealId },
            select: { id: true },
          })
        : null,
      assignedUserId
        ? this.prisma.user.findFirst({
            where: { id: assignedUserId, isActive: true },
            select: { id: true },
          })
        : null,
    ]);
    if (campaignId && !campaign)
      throw new NotFoundException('Marketing campaign not found.');
    if (dealId && !deal) throw new NotFoundException('Marketing deal not found.');
    if (assignedUserId && !assignee)
      throw new NotFoundException('Active assignee not found.');
    if (campaign?.dealId && dealId && campaign.dealId !== dealId)
      throw new BadRequestException(
        'Content deal must match the deal linked to its campaign.',
      );
    return { dealId: dealId ?? campaign?.dealId ?? undefined };
  }

  private async changeStage(
    content: { id: string; stage: MarketingContentStage },
    stage: MarketingContentStage,
    actorId: string,
    action: string,
    meta?: RequestMetadata,
  ) {
    const updated = await this.prisma.marketingContent.update({
      where: { id: content.id },
      data: { stage, updatedById: actorId },
      include: cardInclude,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'MarketingContent',
      entityId: content.id,
      action,
      oldValues: { stage: content.stage },
      newValues: { stage },
      requestMetadata: meta,
    });
    return updated;
  }

  private async reviewNegative(
    approvalId: string,
    status: 'CHANGES_REQUESTED' | 'REJECTED',
    stage: 'CREATING' | 'IDEA',
    comment: string,
    actorId: string,
    action: string,
    type: NotificationType,
    meta?: RequestMetadata,
  ) {
    const approval = await this.requireApproval(approvalId);
    if (approval.status !== MarketingContentApprovalStatus.PENDING)
      throw new ConflictException('Only pending approvals can be reviewed.');
    const result = await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.marketingContentApproval.update({
        where: { id: approvalId },
        data: {
          status,
          comment,
          reviewerUserId: actorId,
          reviewedAt: new Date(),
        },
      });
      await tx.marketingContent.update({
        where: { id: approval.contentId },
        data: { stage, updatedById: actorId },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingContent',
          entityId: approval.contentId,
          action,
          oldValues: {
            stage: approval.content.stage,
            approvalStatus: approval.status,
          },
          newValues: {
            stage,
            approvalStatus: status,
            reviewerUserId: actorId,
            comment,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return reviewed;
    });
    await this.notifyParticipants(
      approval.content,
      type,
      status === 'REJECTED'
        ? 'Creative rejected'
        : 'Creative changes requested',
      comment,
    );
    if (status === 'CHANGES_REQUESTED')
      await this.syncNeoTrioApproval(
        approval.contentId,
        'PRODUCTION',
        actorId,
        NotificationType.NEOTRIO_PRODUCTION_CHANGES_REQUESTED,
        'NeoTrio production changes requested',
        meta,
      );
    return result;
  }

  private async syncNeoTrioApproval(
    contentId: string,
    stage: 'READY' | 'PRODUCTION',
    actorId: string,
    type: NotificationType,
    title: string,
    meta?: RequestMetadata,
  ) {
    const production = await this.prisma.neoTrioProduction.findUnique({
      where: { marketingContentId: contentId },
    });
    if (!production || production.stage !== 'REVIEW') return;
    await this.prisma.$transaction(async (tx) => {
      await tx.neoTrioProduction.update({
        where: { id: production.id },
        data: { stage, updatedById: actorId },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioProduction',
          entityId: production.id,
          action: 'NEOTRIO_PRODUCTION_STAGE_CHANGED',
          oldValues: { stage: 'REVIEW' },
          newValues: { stage, source: 'NEO_GREENLIGHT' },
          requestMetadata: meta,
        },
        tx,
      );
    });
    const recipients = new Set(
      [production.createdById, production.assignedUserId].filter(
        (id): id is string => Boolean(id),
      ),
    );
    await Promise.all(
      [...recipients].map(async (userId) => {
        const existing = await this.prisma.notification.findFirst({
          where: {
            userId,
            type,
            entityType: 'NeoTrioProduction',
            entityId: production.id,
            isRead: false,
          },
        });
        if (!existing)
          await this.notifications.create({
            userId,
            type,
            title,
            message: `${production.productionCode}: ${production.title}`,
            entityType: 'NeoTrioProduction',
            entityId: production.id,
          });
      }),
    );
  }

  private async notifyParticipants(
    content: { id: string; createdById: string; assignedUserId: string | null },
    type: NotificationType,
    title: string,
    message: string,
  ) {
    const recipients = new Set(
      [content.createdById, content.assignedUserId].filter((id): id is string =>
        Boolean(id),
      ),
    );
    await Promise.all(
      [...recipients].map((userId) =>
        this.notifications.create({
          userId,
          type,
          title,
          message,
          entityType: 'MarketingContent',
          entityId: content.id,
        }),
      ),
    );
  }

  private async notifyPermission(
    permission: string,
    type: NotificationType,
    title: string,
    message: string,
    entityId: string,
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
          type,
          title,
          message,
          entityType: 'MarketingContent',
          entityId,
        }),
      ),
    );
  }
}

function metadataSnapshot(content: {
  title: string;
  description: string | null;
  contentType: string;
  campaignId: string | null;
  dealId: string | null;
  deadline: Date | null;
  priority: string;
}) {
  return {
    title: content.title,
    description: content.description,
    contentType: content.contentType,
    campaignId: content.campaignId,
    dealId: content.dealId,
    deadline: content.deadline?.toISOString() ?? null,
    priority: content.priority,
  };
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
