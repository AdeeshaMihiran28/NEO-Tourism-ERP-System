import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  AttentionReason,
  FollowUpStatus,
  FollowUpType,
  LeadActivityType,
  LeadStatus,
  NotificationType,
} from '../../../generated/prisma/enums';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

export const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.HANDLING,
  LeadStatus.QUOTING,
  LeadStatus.FOLLOW_UP,
  LeadStatus.CALLBACK,
  LeadStatus.GOING_TO_BOOK,
];

export const ATTENTION_INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000;

type DatabaseClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LeadAttentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async evaluateLeadAttention(
    leadId: string,
    now = new Date(),
    client: DatabaseClient = this.prisma,
  ) {
    const lead = await client.lead.findUnique({
      where: { id: leadId },
      include: {
        customer: { select: { firstName: true, lastName: true } },
      },
    });
    if (!lead) return null;

    const isActive = ACTIVE_LEAD_STATUSES.includes(lead.status);
    const activityAt =
      lead.lastMeaningfulActivityAt ?? lead.assignedAt ?? lead.createdAt;
    const stale =
      now.getTime() - activityAt.getTime() >= ATTENTION_INACTIVITY_MS;

    let hasFutureAction = false;
    let hasUnresolvedMissedCallback = false;
    if (isActive && lead.assignedUserId) {
      hasFutureAction =
        (await client.followUp.count({
          where: {
            leadId,
            status: FollowUpStatus.SCHEDULED,
            scheduledAt: { gt: now },
          },
        })) > 0;
      hasUnresolvedMissedCallback =
        (await client.followUp.count({
          where: {
            leadId,
            type: FollowUpType.CALLBACK,
            status: FollowUpStatus.MISSED,
            scheduledAt: { gt: activityAt },
          },
        })) > 0;
    }

    const required =
      Boolean(isActive && lead.assignedUserId) &&
      (hasUnresolvedMissedCallback || (stale && !hasFutureAction));
    const reason = required
      ? hasUnresolvedMissedCallback
        ? AttentionReason.MISSED_CALLBACK
        : AttentionReason.NO_ACTIVITY_3_DAYS
      : null;

    if (!lead.isAttentionRequired && required && lead.assignedUserId) {
      const flagged = await client.lead.updateMany({
        where: { id: leadId, isAttentionRequired: false },
        data: {
          isAttentionRequired: true,
          attentionReason: reason,
          attentionSince: now,
        },
      });
      if (flagged.count === 1) {
        await client.leadActivity.create({
          data: {
            leadId,
            userId: lead.assignedUserId,
            type: LeadActivityType.ATTENTION_FLAGGED,
            description: 'Lead flagged for attention.',
            metadata: { reason },
          },
        });
        await this.auditService.log(
          {
            actorUserId: lead.assignedUserId,
            entityType: 'Lead',
            entityId: leadId,
            action: 'LEAD_ATTENTION_FLAGGED',
            oldValues: { isAttentionRequired: false, attentionReason: null },
            newValues: {
              isAttentionRequired: true,
              attentionReason: reason,
              attentionSince: now.toISOString(),
            },
            metadata: { source: 'ATTENTION_EVALUATION' },
          },
          client,
        );
        await this.notificationsService.create(
          {
            userId: lead.assignedUserId,
            type: NotificationType.ATTENTION_LEAD,
            title: 'Lead Requires Attention',
            message: hasUnresolvedMissedCallback
              ? `${lead.customer.firstName} ${lead.customer.lastName} has a missed callback.`
              : `${lead.customer.firstName} ${lead.customer.lastName} has had no meaningful follow-up for 3 days.`,
            entityType: 'Lead',
            entityId: leadId,
            metadata: { reason },
          },
          client,
        );
      }
    } else if (lead.isAttentionRequired && !required && lead.assignedUserId) {
      const cleared = await client.lead.updateMany({
        where: { id: leadId, isAttentionRequired: true },
        data: {
          isAttentionRequired: false,
          attentionReason: null,
          attentionSince: null,
        },
      });
      if (cleared.count === 1) {
        await client.leadActivity.create({
          data: {
            leadId,
            userId: lead.assignedUserId,
            type: LeadActivityType.ATTENTION_CLEARED,
            description: 'Lead attention requirement cleared.',
          },
        });
        await this.auditService.log(
          {
            actorUserId: lead.assignedUserId,
            entityType: 'Lead',
            entityId: leadId,
            action: 'LEAD_ATTENTION_CLEARED',
            oldValues: {
              isAttentionRequired: true,
              attentionReason: lead.attentionReason,
            },
            newValues: {
              isAttentionRequired: false,
              attentionReason: null,
              attentionSince: null,
            },
            metadata: { source: 'ATTENTION_EVALUATION' },
          },
          client,
        );
      }
    } else if (
      lead.isAttentionRequired &&
      required &&
      lead.attentionReason !== reason
    ) {
      await client.lead.update({
        where: { id: leadId },
        data: { attentionReason: reason },
      });
    }

    return client.lead.findUnique({ where: { id: leadId } });
  }

  async evaluateAllActiveLeads(now = new Date()) {
    const leads = await this.prisma.lead.findMany({
      where: {
        OR: [
          { status: { in: ACTIVE_LEAD_STATUSES } },
          { isAttentionRequired: true },
        ],
      },
      select: { id: true },
    });

    for (const lead of leads) {
      await this.evaluateLeadAttention(lead.id, now);
    }
    return { evaluatedCount: leads.length };
  }

  clearAttentionWhenResolved(
    leadId: string,
    now = new Date(),
    client: DatabaseClient = this.prisma,
  ) {
    return this.evaluateLeadAttention(leadId, now, client);
  }
}
