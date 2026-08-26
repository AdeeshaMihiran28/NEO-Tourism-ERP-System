import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MarketingCalendarEntryType as EntryType,
  MarketingCalendarSource as Source,
  MarketingCalendarStatus as Status,
  MarketingContentStage,
  MarketingDealStatus,
  MarketingPublicationStatus,
} from '../../../../generated/prisma/client';
import type { Prisma } from '../../../../generated/prisma/client';
import { AuditService } from '../../../audit/audit.service';
import type { RequestMetadata } from '../../../common/request-metadata';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  CalendarQueryDto,
  CreateCalendarEntryDto,
  RescheduleCalendarEntryDto,
  UpdateCalendarEntryDto,
} from '../dto/calendar.dto';
import type { NormalizedCalendarEvent } from '../calendar.types';

@Injectable()
export class MarketingCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: CalendarQueryDto) {
    const from = new Date(query.dateFrom);
    const to = new Date(query.dateTo);
    if (from > to)
      throw new ConflictException('dateFrom must be before dateTo.');
    const overlap = { lte: to };
    const [manual, campaigns, deals, content, publications, external] =
      await Promise.all([
        this.prisma.marketingCalendarEntry.findMany({
          where: {
            startAt: overlap,
            OR: [{ endAt: null }, { endAt: { gte: from } }],
          },
        }),
        this.prisma.marketingCampaign.findMany({
          where: {
            startDate: { not: null, lte: to },
            OR: [{ endDate: null }, { endDate: { gte: from } }],
          },
        }),
        this.prisma.marketingDeal.findMany({
          where: {
            expiryAt: { gte: from, lte: to },
            status: {
              notIn: [
                MarketingDealStatus.EXPIRED,
                MarketingDealStatus.SUSPENDED,
              ],
            },
          },
        }),
        this.prisma.marketingContent.findMany({
          where: {
            deadline: { gte: from, lte: to },
            stage: {
              notIn: [
                MarketingContentStage.ARCHIVED,
                MarketingContentStage.CANCELLED,
              ],
            },
          },
        }),
        this.prisma.marketingPublication.findMany({
          where: { scheduledAt: { gte: from, lte: to } },
          include: { content: true },
        }),
        this.prisma.externalMarketingEvent.findMany({
          where: {
            OR: [
              { scheduledAt: { gte: from, lte: to } },
              { publishedAt: { gte: from, lte: to } },
            ],
          },
        }),
      ]);

    const events: NormalizedCalendarEvent[] = [
      ...manual.map((x) => ({
        id: `manual:${x.id}`,
        title: x.title,
        description: x.description,
        entryType: x.entryType,
        startAt: x.startAt,
        endAt: x.endAt,
        allDay: x.allDay,
        status: x.status,
        source: x.source,
        channel: x.channel,
        campaignId: x.campaignId,
        dealId: x.dealId,
        contentId: x.contentId,
        publicationId: x.publicationId,
        assignedUserId: x.assignedUserId,
        editable: x.source === Source.INTERNAL,
        reschedulable:
          x.source === Source.INTERNAL &&
          x.status !== Status.PUBLISHED &&
          x.status !== Status.COMPLETED &&
          x.status !== Status.CANCELLED,
        href: null,
      })),
      ...campaigns.map((x) => ({
        id: `campaign:${x.id}`,
        title: x.name,
        description: x.description,
        entryType: EntryType.CAMPAIGN,
        startAt: x.startDate!,
        endAt: x.endDate,
        allDay: true,
        status: this.campaignStatus(x.status),
        source: Source.INTERNAL,
        channel: null,
        campaignId: x.id,
        dealId: x.dealId,
        contentId: null,
        publicationId: null,
        assignedUserId: x.ownerUserId,
        editable: false,
        reschedulable: false,
        href: `/marketing/campaigns/${x.id}`,
      })),
      ...deals.map((x) => ({
        id: `deal-expiry:${x.id}`,
        title: `${x.title} expires`,
        description: x.shortDescription,
        entryType: EntryType.DEAL_EXPIRY,
        startAt: x.expiryAt,
        endAt: null,
        allDay: false,
        status:
          x.status === MarketingDealStatus.LIVE
            ? Status.PUBLISHED
            : Status.SCHEDULED,
        source: Source.INTERNAL,
        channel: null,
        campaignId: null,
        dealId: x.id,
        contentId: null,
        publicationId: null,
        assignedUserId: null,
        editable: false,
        reschedulable: false,
        href: `/marketing/deals/${x.id}`,
      })),
      ...content.map((x) => ({
        id: `content-deadline:${x.id}`,
        title: `${x.title} — Creative deadline`,
        description: x.description,
        entryType:
          x.contentType === 'NEOTRIO' ? EntryType.NEOTRIO : EntryType.CONTENT,
        startAt: x.deadline!,
        endAt: null,
        allDay: true,
        status:
          x.stage === MarketingContentStage.READY
            ? Status.READY
            : Status.PLANNED,
        source: Source.INTERNAL,
        channel: null,
        campaignId: x.campaignId,
        dealId: x.dealId,
        contentId: x.id,
        publicationId: null,
        assignedUserId: x.assignedUserId,
        editable: false,
        reschedulable: false,
        href: `/marketing/content/${x.id}`,
      })),
      ...publications.map((x) => ({
        id: `publication:${x.id}`,
        title: x.content.title,
        description: x.content.description,
        entryType: this.channelType(x.channel),
        startAt: x.scheduledAt!,
        endAt: null,
        allDay: false,
        status: this.publicationStatus(x.status),
        source: Source.INTERNAL,
        channel: x.channel,
        campaignId: x.content.campaignId,
        dealId: x.content.dealId,
        contentId: x.contentId,
        publicationId: x.id,
        assignedUserId: x.content.assignedUserId,
        editable: false,
        reschedulable:
          x.status !== MarketingPublicationStatus.PUBLISHED &&
          x.status !== MarketingPublicationStatus.REMOVED,
        href: `/marketing/content/${x.contentId}`,
        externalPublishStatus:
          x.status === MarketingPublicationStatus.PUBLISHED &&
          Boolean(x.externalReference)
            ? ('VERIFIED' as const)
            : ('NOT_VERIFIED' as const),
      })),
      ...external.map((x) => ({
        id: `external:${x.id}`,
        title: x.title,
        description: null,
        entryType: x.externalType,
        startAt: x.scheduledAt ?? x.publishedAt!,
        endAt: null,
        allDay: false,
        status: x.status,
        source: Source.META,
        channel: x.channel,
        campaignId: x.campaignId,
        dealId: x.dealId,
        contentId: x.contentId,
        publicationId: null,
        assignedUserId: null,
        editable: false,
        reschedulable: false,
        href: x.contentId ? `/marketing/content/${x.contentId}` : null,
        externalPublishStatus:
          x.status === Status.PUBLISHED
            ? ('VERIFIED' as const)
            : ('NOT_VERIFIED' as const),
      })),
    ];
    return events
      .filter((event) => this.matches(event, query))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  async create(
    dto: CreateCalendarEntryDto,
    actorId: string,
    metadata?: RequestMetadata,
  ) {
    if (
      dto.entryType !== EntryType.SEASONAL &&
      dto.entryType !== EntryType.INTERNAL_EVENT &&
      dto.entryType !== EntryType.OTHER
    )
      throw new ConflictException(
        'Manual events are only for internal planning activities. Create content, campaigns, or deals in their authoritative module.',
      );
    const entry = await this.prisma.marketingCalendarEntry.create({
      data: {
        ...dto,
        startAt: new Date(dto.startAt),
        ...(dto.endAt && { endAt: new Date(dto.endAt) }),
        source: Source.INTERNAL,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await this.log(
      'MARKETING_CALENDAR_EVENT_CREATED',
      entry.id,
      actorId,
      undefined,
      entry,
      metadata,
    );
    return entry;
  }

  async update(
    id: string,
    dto: UpdateCalendarEntryDto,
    actorId: string,
    metadata?: RequestMetadata,
  ) {
    const current = await this.editable(id);
    if (
      dto.entryType &&
      dto.entryType !== EntryType.SEASONAL &&
      dto.entryType !== EntryType.INTERNAL_EVENT &&
      dto.entryType !== EntryType.OTHER
    )
      throw new ConflictException(
        'Manual events cannot duplicate authoritative Marketing records.',
      );
    const updated = await this.prisma.marketingCalendarEntry.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startAt && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt && { endAt: new Date(dto.endAt) }),
        updatedById: actorId,
      },
    });
    await this.log(
      'MARKETING_CALENDAR_EVENT_UPDATED',
      id,
      actorId,
      current,
      updated,
      metadata,
    );
    return updated;
  }

  async cancel(id: string, actorId: string, metadata?: RequestMetadata) {
    const current = await this.editable(id);
    if (current.status === Status.CANCELLED) return current;
    const updated = await this.prisma.marketingCalendarEntry.update({
      where: { id },
      data: { status: Status.CANCELLED, updatedById: actorId },
    });
    await this.log(
      'MARKETING_CALENDAR_EVENT_CANCELLED',
      id,
      actorId,
      current,
      updated,
      metadata,
    );
    return updated;
  }

  async reschedule(
    calendarId: string,
    dto: RescheduleCalendarEntryDto,
    actorId: string,
    metadata?: RequestMetadata,
  ) {
    const [kind, id] = calendarId.split(':');
    const startAt = new Date(dto.startAt);
    if (kind === 'publication') {
      const current = await this.prisma.marketingPublication.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Publication not found.');
      if (
        current.status === MarketingPublicationStatus.PUBLISHED ||
        current.status === MarketingPublicationStatus.REMOVED
      )
        throw new ConflictException(
          'Published or completed publications cannot be rescheduled.',
        );
      const updated = await this.prisma.marketingPublication.update({
        where: { id },
        data: {
          scheduledAt: startAt,
          status: MarketingPublicationStatus.SCHEDULED,
        },
      });
      await this.log(
        'MARKETING_CALENDAR_EVENT_RESCHEDULED',
        id,
        actorId,
        { scheduledAt: current.scheduledAt?.toISOString() ?? null },
        { scheduledAt: updated.scheduledAt?.toISOString() ?? null },
        metadata,
        'MarketingPublication',
      );
      return updated;
    }
    if (kind === 'manual') {
      const current = await this.editable(id);
      if (
        current.status === Status.PUBLISHED ||
        current.status === Status.COMPLETED ||
        current.status === Status.CANCELLED
      )
        throw new ConflictException('This event can no longer be rescheduled.');
      const updated = await this.prisma.marketingCalendarEntry.update({
        where: { id },
        data: {
          startAt,
          ...(dto.endAt && { endAt: new Date(dto.endAt) }),
          updatedById: actorId,
        },
      });
      await this.log(
        'MARKETING_CALENDAR_EVENT_RESCHEDULED',
        id,
        actorId,
        {
          startAt: current.startAt.toISOString(),
          endAt: current.endAt?.toISOString() ?? null,
        },
        {
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt?.toISOString() ?? null,
        },
        metadata,
      );
      return updated;
    }
    if (kind === 'deal-expiry')
      throw new ConflictException(
        'Deal expiry cannot be moved in NEO PLAN. Open the Deal and edit its expiry date.',
      );
    throw new ConflictException(
      'This projected calendar item must be changed in its authoritative module.',
    );
  }

  private async editable(id: string) {
    const entry = await this.prisma.marketingCalendarEntry.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException('Calendar event not found.');
    if (entry.source !== Source.INTERNAL)
      throw new ConflictException('External calendar events are read-only.');
    return entry;
  }
  private matches(e: NormalizedCalendarEvent, q: CalendarQueryDto) {
    return (
      (!q.entryType || e.entryType === q.entryType) &&
      (!q.channel || e.channel === q.channel) &&
      (!q.campaignId || e.campaignId === q.campaignId) &&
      (!q.dealId || e.dealId === q.dealId) &&
      (!q.assignedUserId || e.assignedUserId === q.assignedUserId) &&
      (!q.status || e.status === q.status) &&
      (!q.source || e.source === q.source)
    );
  }
  private publicationStatus(status: MarketingPublicationStatus) {
    return status === 'PUBLISHED'
      ? Status.PUBLISHED
      : status === 'FAILED'
        ? Status.FAILED
        : status === 'SCHEDULED'
          ? Status.SCHEDULED
          : Status.DRAFT;
  }
  private campaignStatus(status: string) {
    return status === 'COMPLETED'
      ? Status.COMPLETED
      : status === 'CANCELLED'
        ? Status.CANCELLED
        : status === 'ACTIVE'
          ? Status.PUBLISHED
          : status === 'DRAFT'
            ? Status.DRAFT
            : Status.PLANNED;
  }
  private channelType(channel: string) {
    return channel === 'FACEBOOK'
      ? EntryType.FACEBOOK
      : channel === 'INSTAGRAM'
        ? EntryType.INSTAGRAM
        : channel === 'WEBSITE'
          ? EntryType.WEBSITE
          : channel === 'PAID_ADS'
            ? EntryType.PAID_AD
            : channel === 'EMAIL'
              ? EntryType.EMAIL
              : channel === 'NEOTRIO'
                ? EntryType.NEOTRIO
                : EntryType.CONTENT;
  }
  private log(
    action: string,
    entityId: string,
    actorUserId: string,
    oldValues?: unknown,
    newValues?: unknown,
    requestMetadata?: RequestMetadata,
    entityType = 'MarketingCalendarEntry',
  ) {
    return this.audit.log({
      action,
      entityType,
      entityId,
      actorUserId,
      oldValues: oldValues as Prisma.InputJsonValue | undefined,
      newValues: newValues as Prisma.InputJsonValue | undefined,
      requestMetadata,
    });
  }
}
