import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  FollowUpStatus,
  FollowUpType,
  LeadActivityType,
  NotificationType,
} from '../../../generated/prisma/enums';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FollowUpsService } from './follow-ups.service';
import { LeadAttentionService } from './lead-attention.service';

const CALLBACK_DUE_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class FollowUpSchedulerService {
  private readonly logger = new Logger(FollowUpSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly followUpsService: FollowUpsService,
    private readonly attentionService: LeadAttentionService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'follow-up-attention-evaluation' })
  async runHourlyEvaluation() {
    const result = await this.processScheduledFollowUps();
    this.logger.log(
      `Follow-up evaluation completed: ${result.dueCount} due, ${result.missedCount} missed, ${result.evaluatedCount} leads evaluated.`,
    );
  }

  async processScheduledFollowUps(now = new Date()) {
    const dueCount = await this.sendDueCallbackNotifications(now);
    const missedCount = await this.markMissedFollowUps(now);
    const attention = await this.attentionService.evaluateAllActiveLeads(now);
    return { dueCount, missedCount, evaluatedCount: attention.evaluatedCount };
  }

  private async sendDueCallbackNotifications(now: Date) {
    const dueWindowEnd = new Date(now.getTime() + CALLBACK_DUE_WINDOW_MS);
    const callbacks = await this.prisma.followUp.findMany({
      where: {
        type: FollowUpType.CALLBACK,
        status: FollowUpStatus.SCHEDULED,
        scheduledAt: { gt: now, lte: dueWindowEnd },
        dueNotificationSentAt: null,
      },
      include: {
        lead: {
          include: {
            customer: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    let sent = 0;
    for (const callback of callbacks) {
      await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.followUp.updateMany({
          where: { id: callback.id, dueNotificationSentAt: null },
          data: { dueNotificationSentAt: now },
        });
        if (claimed.count !== 1) return;
        await this.notificationsService.create(
          {
            userId: callback.assignedUserId,
            type: NotificationType.CALLBACK_DUE,
            title: 'Callback Due',
            message: `Callback for ${callback.lead.customer.firstName} ${callback.lead.customer.lastName} is due soon.`,
            entityType: 'Lead',
            entityId: callback.leadId,
            metadata: {
              followUpId: callback.id,
              scheduledAt: callback.scheduledAt.toISOString(),
            },
          },
          transaction,
        );
        sent += 1;
      });
    }
    return sent;
  }

  private async markMissedFollowUps(now: Date) {
    const overdue = await this.prisma.followUp.findMany({
      where: {
        status: FollowUpStatus.SCHEDULED,
        scheduledAt: { lt: now },
      },
      include: {
        lead: {
          include: {
            customer: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    let missed = 0;
    for (const followUp of overdue) {
      await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.followUp.updateMany({
          where: { id: followUp.id, status: FollowUpStatus.SCHEDULED },
          data: {
            status: FollowUpStatus.MISSED,
            missedNotificationSentAt: now,
          },
        });
        if (claimed.count !== 1) return;

        await transaction.leadActivity.create({
          data: {
            leadId: followUp.leadId,
            userId: followUp.assignedUserId,
            type: LeadActivityType.FOLLOW_UP_MISSED,
            description: 'Scheduled follow-up was missed.',
            metadata: {
              followUpId: followUp.id,
              followUpType: followUp.type,
              scheduledAt: followUp.scheduledAt.toISOString(),
            },
          },
        });
        await this.auditService.log(
          {
            actorUserId: followUp.assignedUserId,
            entityType: 'FollowUp',
            entityId: followUp.id,
            action: 'FOLLOW_UP_MISSED',
            oldValues: { status: FollowUpStatus.SCHEDULED },
            newValues: { status: FollowUpStatus.MISSED },
            metadata: {
              leadId: followUp.leadId,
              source: 'SCHEDULED_JOB',
            },
          },
          transaction,
        );
        await this.notificationsService.create(
          {
            userId: followUp.assignedUserId,
            type: NotificationType.MISSED_CALLBACK,
            title:
              followUp.type === FollowUpType.CALLBACK
                ? 'Missed Callback'
                : 'Missed Follow-Up',
            message: `${followUp.type === FollowUpType.CALLBACK ? 'Callback' : 'Follow-up'} for ${followUp.lead.customer.firstName} ${followUp.lead.customer.lastName} is overdue.`,
            entityType: 'Lead',
            entityId: followUp.leadId,
            metadata: { followUpId: followUp.id },
          },
          transaction,
        );
        await this.followUpsService.refreshNextAction(
          followUp.leadId,
          now,
          transaction,
        );
        await this.attentionService.evaluateLeadAttention(
          followUp.leadId,
          now,
          transaction,
        );
        missed += 1;
      });
    }
    return missed;
  }
}
