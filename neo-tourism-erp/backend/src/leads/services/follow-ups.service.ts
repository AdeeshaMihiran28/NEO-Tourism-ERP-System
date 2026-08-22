import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import {
  FollowUpStatus,
  LeadActivityType,
} from '../../../generated/prisma/enums';
import type { CancelFollowUpDto } from '../dto/cancel-follow-up.dto';
import type { CreateFollowUpDto } from '../dto/create-follow-up.dto';
import type { UpdateFollowUpDto } from '../dto/update-follow-up.dto';
import {
  ACTIVE_LEAD_STATUSES,
  LeadAttentionService,
} from './lead-attention.service';

const followUpInclude = {
  assignedUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  completedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.FollowUpInclude;

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly attentionService: LeadAttentionService,
  ) {}

  async create(
    leadId: string,
    dto: CreateFollowUpDto,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    const scheduledAt = this.requireFutureDate(dto.scheduledAt);
    return this.prisma.$transaction(async (transaction) => {
      const lead = await transaction.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new NotFoundException('Lead not found.');
      this.assertLeadAccess(lead, user);
      if (!lead.assignedUserId) {
        throw new ConflictException(
          'Lead must be assigned before scheduling a follow-up.',
        );
      }
      if (!ACTIVE_LEAD_STATUSES.includes(lead.status)) {
        throw new ConflictException(
          'Follow-ups can only be scheduled for active leads.',
        );
      }

      const followUp = await transaction.followUp.create({
        data: {
          leadId,
          assignedUserId: lead.assignedUserId,
          type: dto.type,
          scheduledAt,
          note: dto.note.trim(),
          createdById: user.id,
        },
        include: followUpInclude,
      });
      await transaction.leadActivity.create({
        data: {
          leadId,
          userId: user.id,
          type: LeadActivityType.FOLLOW_UP_CREATED,
          description: `${dto.type.replaceAll('_', ' ')} scheduled.`,
          metadata: {
            followUpId: followUp.id,
            scheduledAt: scheduledAt.toISOString(),
          },
        },
      });
      await this.refreshNextAction(leadId, new Date(), transaction);
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'FollowUp',
          entityId: followUp.id,
          action: 'FOLLOW_UP_CREATED',
          newValues: this.snapshot(followUp),
          metadata: { leadId },
          requestMetadata,
        },
        transaction,
      );
      await this.attentionService.evaluateLeadAttention(
        leadId,
        new Date(),
        transaction,
      );
      return followUp;
    });
  }

  async findForLead(leadId: string, user: AuthenticatedUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found.');
    this.assertLeadAccess(lead, user);
    return this.prisma.followUp.findMany({
      where: { leadId },
      include: followUpInclude,
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
    });
  }

  async update(
    id: string,
    dto: UpdateFollowUpDto,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    if (
      dto.type === undefined &&
      dto.scheduledAt === undefined &&
      dto.note === undefined
    ) {
      throw new BadRequestException(
        'At least one follow-up field is required.',
      );
    }
    const scheduledAt = dto.scheduledAt
      ? this.requireFutureDate(dto.scheduledAt)
      : undefined;

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.followUp.findUnique({
        where: { id },
        include: { lead: true },
      });
      if (!existing) throw new NotFoundException('Follow-up not found.');
      this.assertLeadAccess(existing.lead, user);
      if (existing.status !== FollowUpStatus.SCHEDULED) {
        throw new ConflictException('Only scheduled follow-ups can be edited.');
      }

      const followUp = await transaction.followUp.update({
        where: { id },
        data: {
          ...(dto.type !== undefined && { type: dto.type }),
          ...(scheduledAt !== undefined && {
            scheduledAt,
            dueNotificationSentAt: null,
          }),
          ...(dto.note !== undefined && { note: dto.note.trim() }),
        },
        include: followUpInclude,
      });
      await transaction.leadActivity.create({
        data: {
          leadId: existing.leadId,
          userId: user.id,
          type: LeadActivityType.FOLLOW_UP_UPDATED,
          description: 'Follow-up updated.',
          metadata: { followUpId: id },
        },
      });
      await this.refreshNextAction(existing.leadId, new Date(), transaction);
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'FollowUp',
          entityId: id,
          action: 'FOLLOW_UP_UPDATED',
          oldValues: this.snapshot(existing),
          newValues: this.snapshot(followUp),
          metadata: { leadId: existing.leadId },
          requestMetadata,
        },
        transaction,
      );
      await this.attentionService.evaluateLeadAttention(
        existing.leadId,
        new Date(),
        transaction,
      );
      return followUp;
    });
  }

  async complete(
    id: string,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.followUp.findUnique({
        where: { id },
        include: { lead: true },
      });
      if (!existing) throw new NotFoundException('Follow-up not found.');
      this.assertLeadAccess(existing.lead, user);
      if (
        existing.status !== FollowUpStatus.SCHEDULED &&
        existing.status !== FollowUpStatus.MISSED
      ) {
        throw new ConflictException(
          'Follow-up cannot be completed from its current status.',
        );
      }

      const now = new Date();
      const followUp = await transaction.followUp.update({
        where: { id },
        data: {
          status: FollowUpStatus.COMPLETED,
          completedAt: now,
          completedById: user.id,
        },
        include: followUpInclude,
      });
      await transaction.lead.update({
        where: { id: existing.leadId },
        data: { lastMeaningfulActivityAt: now },
      });
      await transaction.leadActivity.create({
        data: {
          leadId: existing.leadId,
          userId: user.id,
          type: LeadActivityType.FOLLOW_UP_COMPLETED,
          description: 'Follow-up completed.',
          metadata: { followUpId: id, followUpType: existing.type },
        },
      });
      await this.refreshNextAction(existing.leadId, now, transaction);
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'FollowUp',
          entityId: id,
          action: 'FOLLOW_UP_COMPLETED',
          oldValues: { status: existing.status, completedAt: null },
          newValues: {
            status: FollowUpStatus.COMPLETED,
            completedAt: now.toISOString(),
            completedById: user.id,
          },
          metadata: { leadId: existing.leadId },
          requestMetadata,
        },
        transaction,
      );
      await this.attentionService.clearAttentionWhenResolved(
        existing.leadId,
        now,
        transaction,
      );
      return followUp;
    });
  }

  async cancel(
    id: string,
    dto: CancelFollowUpDto,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.followUp.findUnique({
        where: { id },
        include: { lead: true },
      });
      if (!existing) throw new NotFoundException('Follow-up not found.');
      this.assertLeadAccess(existing.lead, user);
      if (existing.status !== FollowUpStatus.SCHEDULED) {
        throw new ConflictException(
          'Only scheduled follow-ups can be cancelled.',
        );
      }

      const followUp = await transaction.followUp.update({
        where: { id },
        data: { status: FollowUpStatus.CANCELLED },
        include: followUpInclude,
      });
      await transaction.leadActivity.create({
        data: {
          leadId: existing.leadId,
          userId: user.id,
          type: LeadActivityType.FOLLOW_UP_CANCELLED,
          description: 'Follow-up cancelled.',
          metadata: { followUpId: id, reason: dto.reason?.trim() ?? null },
        },
      });
      const now = new Date();
      await this.refreshNextAction(existing.leadId, now, transaction);
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'FollowUp',
          entityId: id,
          action: 'FOLLOW_UP_CANCELLED',
          oldValues: { status: existing.status },
          newValues: { status: FollowUpStatus.CANCELLED },
          metadata: {
            leadId: existing.leadId,
            reason: dto.reason?.trim() ?? null,
          },
          requestMetadata,
        },
        transaction,
      );
      await this.attentionService.evaluateLeadAttention(
        existing.leadId,
        now,
        transaction,
      );
      return followUp;
    });
  }

  async getSummary(user: AuthenticatedUser, now = new Date()) {
    const ownerWhere = user.permissions.includes('lead.view_all')
      ? {}
      : { assignedUserId: user.id };
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const callbacksToday = await this.prisma.followUp.count({
      where: {
        ...ownerWhere,
        type: 'CALLBACK',
        status: FollowUpStatus.SCHEDULED,
        scheduledAt: { gte: startOfDay, lte: endOfDay },
      },
    });
    const missedCallbacks = await this.prisma.followUp.count({
      where: {
        ...ownerWhere,
        type: 'CALLBACK',
        status: FollowUpStatus.MISSED,
      },
    });
    const upcomingFollowUps = await this.prisma.followUp.count({
      where: {
        ...ownerWhere,
        status: FollowUpStatus.SCHEDULED,
        scheduledAt: { gt: now },
      },
    });
    const attentionLeads = await this.prisma.lead.count({
      where: {
        isAttentionRequired: true,
        ...(user.permissions.includes('lead.attention.manage') ||
        user.permissions.includes('lead.view_all')
          ? {}
          : { assignedUserId: user.id }),
      },
    });
    return {
      callbacksToday,
      missedCallbacks,
      attentionLeads,
      upcomingFollowUps,
    };
  }

  async refreshNextAction(
    leadId: string,
    now = new Date(),
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const next = await client.followUp.findFirst({
      where: {
        leadId,
        status: FollowUpStatus.SCHEDULED,
        scheduledAt: { gt: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      select: { scheduledAt: true },
    });
    await client.lead.update({
      where: { id: leadId },
      data: { nextActionAt: next?.scheduledAt ?? null },
    });
    return next?.scheduledAt ?? null;
  }

  private requireFutureDate(value: string): Date {
    const scheduledAt = new Date(value);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Scheduled date and time must be in the future.',
      );
    }
    return scheduledAt;
  }

  private assertLeadAccess(
    lead: { assignedUserId: string | null },
    user: AuthenticatedUser,
  ) {
    if (user.permissions.includes('lead.view_all')) return;
    if (lead.assignedUserId === user.id) return;
    throw new ForbiddenException('You cannot access follow-ups for this lead.');
  }

  private snapshot(followUp: {
    id: string;
    leadId: string;
    assignedUserId: string;
    type: string;
    scheduledAt: Date;
    note: string;
    status: string;
    completedAt: Date | null;
    completedById: string | null;
  }): Prisma.InputJsonObject {
    return {
      id: followUp.id,
      leadId: followUp.leadId,
      assignedUserId: followUp.assignedUserId,
      type: followUp.type,
      scheduledAt: followUp.scheduledAt.toISOString(),
      note: followUp.note,
      status: followUp.status,
      completedAt: followUp.completedAt?.toISOString() ?? null,
      completedById: followUp.completedById,
    };
  }
}
