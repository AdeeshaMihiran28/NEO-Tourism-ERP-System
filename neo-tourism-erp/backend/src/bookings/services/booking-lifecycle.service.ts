import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type {
  Booking,
  Prisma,
  TravelStatus,
} from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/auth.types';

interface EvaluationOptions {
  actorId?: string;
  now?: Date;
  requestMetadata?: RequestMetadata;
  auditReevaluation?: boolean;
  allowCloseAfterReopen?: boolean;
}

@Injectable()
export class BookingLifecycleService {
  private readonly logger = new Logger(BookingLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  evaluateTravelStatus(
    booking: Pick<
      Booking,
      'travelStatus' | 'travelStartDate' | 'travelEndDate' | 'finalServiceDate'
    >,
    now = new Date(),
  ): TravelStatus {
    if (booking.travelStatus === 'CANCELLED') return 'CANCELLED';
    const today = this.utcDay(now);
    const start = this.utcDay(booking.travelStartDate);
    const finalDate = this.utcDay(
      booking.finalServiceDate ??
        booking.travelEndDate ??
        booking.travelStartDate,
    );
    if (today < start) return 'UPCOMING';
    if (today <= finalDate) return 'IN_TRAVEL';
    return 'TRAVEL_COMPLETE';
  }

  evaluateFolderStatus(
    booking: Pick<
      Booking,
      'travelStatus' | 'operationsStatus' | 'accountsStatus'
    >,
  ) {
    return (
      booking.travelStatus === 'TRAVEL_COMPLETE' &&
      booking.operationsStatus === 'COMPLETE' &&
      booking.accountsStatus === 'RECONCILED'
    );
  }

  async getLifecycle(bookingId: string, user?: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        salesAdvisorId: true,
        operationsOwnerId: true,
        travelStatus: true,
        operationsStatus: true,
        accountsStatus: true,
        folderStatus: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (
      user &&
      !user.permissions.includes('booking.view_all') &&
      booking.salesAdvisorId !== user.id &&
      booking.operationsOwnerId !== user.id
    )
      throw new NotFoundException('Booking not found.');
    return {
      travelStatus: booking.travelStatus,
      operationsStatus: booking.operationsStatus,
      accountsStatus: booking.accountsStatus,
      folderStatus: booking.folderStatus,
      canCloseFolder: this.evaluateFolderStatus(booking),
    };
  }

  async evaluateBookingLifecycle(
    bookingId: string,
    options: EvaluationOptions = {},
  ) {
    const existing = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!existing) throw new NotFoundException('Booking not found.');
    const actorId = options.actorId ?? existing.createdById;
    const travelStatus = this.evaluateTravelStatus(existing, options.now);
    const predicted = { ...existing, travelStatus };
    const canCloseFolder = this.evaluateFolderStatus(predicted);
    const shouldClose =
      existing.folderStatus === 'OPEN' &&
      canCloseFolder &&
      (!existing.folderReopenedAt || options.allowCloseAfterReopen === true);
    const travelChanged = travelStatus !== existing.travelStatus;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated =
        travelChanged || shouldClose
          ? await tx.booking.update({
              where: { id: bookingId },
              data: {
                ...(travelChanged && { travelStatus }),
                ...(shouldClose && {
                  folderStatus: 'CLOSED',
                  folderReopenedAt: null,
                  folderReopenedById: null,
                  folderReopenReason: null,
                }),
              },
            })
          : existing;

      if (travelChanged) {
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'Booking',
            entityId: bookingId,
            action: 'TRAVEL_STATUS_CHANGED',
            oldValues: { travelStatus: existing.travelStatus },
            newValues: { travelStatus },
            metadata: { automated: !options.actorId },
            requestMetadata: options.requestMetadata,
          },
          tx,
        );
        if (travelStatus === 'TRAVEL_COMPLETE')
          await this.notifyBookingUsers(
            tx,
            updated,
            'TRAVEL_COMPLETE',
            'Travel Complete',
            `Folder ${updated.folderNumber} has reached its final travel/service date.`,
          );
      }
      if (shouldClose) {
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'Booking',
            entityId: bookingId,
            action: 'FOLDER_CLOSED',
            oldValues: { folderStatus: existing.folderStatus },
            newValues: { folderStatus: 'CLOSED' },
            metadata: { automated: !options.actorId },
            requestMetadata: options.requestMetadata,
          },
          tx,
        );
        await this.notifyBookingUsers(
          tx,
          updated,
          'FOLDER_CLOSED',
          'Folder Closed',
          `Folder ${updated.folderNumber} has completed Travel, Operations and Accounts reconciliation.`,
        );
        await tx.customer.updateMany({
          where: { id: updated.customerId, customerType: 'NEW' },
          data: { customerType: 'REPEAT' },
        });
      }
      if (options.auditReevaluation) {
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'Booking',
            entityId: bookingId,
            action: 'BOOKING_LIFECYCLE_REEVALUATED',
            oldValues: {
              travelStatus: existing.travelStatus,
              folderStatus: existing.folderStatus,
            },
            newValues: {
              travelStatus: updated.travelStatus,
              folderStatus: updated.folderStatus,
              canCloseFolder,
            },
            requestMetadata: options.requestMetadata,
          },
          tx,
        );
      }
      return updated;
    });
    return { ...result, canCloseFolder: this.evaluateFolderStatus(result) };
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'booking-lifecycle-evaluation' })
  async scheduledEvaluation() {
    const result = await this.evaluateAllActiveBookings();
    this.logger.log(
      `Booking lifecycle evaluated: ${result.evaluated} active folders, ${result.changed} changed.`,
    );
  }

  async evaluateAllActiveBookings(now = new Date()) {
    const bookings = await this.prisma.booking.findMany({
      where: { folderStatus: 'OPEN' },
      select: { id: true, travelStatus: true, folderStatus: true },
    });
    let changed = 0;
    for (const booking of bookings) {
      const result = await this.evaluateBookingLifecycle(booking.id, { now });
      if (
        result.travelStatus !== booking.travelStatus ||
        result.folderStatus !== booking.folderStatus
      )
        changed += 1;
    }
    return { evaluated: bookings.length, changed };
  }

  async completeOperations(
    bookingId: string,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const existing = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!existing) throw new NotFoundException('Booking not found.');
    if (existing.folderStatus === 'CLOSED')
      throw new ConflictException(
        'Reopen the folder before changing Operations.',
      );
    if (existing.operationsStatus !== 'COMPLETE') {
      await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: bookingId },
          data: { operationsStatus: 'COMPLETE' },
        });
        await this.audit.log(
          {
            actorUserId: actorId,
            entityType: 'Booking',
            entityId: bookingId,
            action: 'OPERATIONS_COMPLETED',
            oldValues: { operationsStatus: existing.operationsStatus },
            newValues: { operationsStatus: 'COMPLETE' },
            requestMetadata,
          },
          tx,
        );
      });
    }
    return this.evaluateBookingLifecycle(bookingId, {
      actorId,
      requestMetadata,
      allowCloseAfterReopen: true,
    });
  }

  async reopen(
    bookingId: string,
    reason: string,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const existing = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!existing) throw new NotFoundException('Booking not found.');
    if (existing.folderStatus !== 'CLOSED')
      throw new ConflictException('Only a closed folder can be reopened.');
    const cleanReason = reason.trim();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          folderStatus: 'OPEN',
          folderReopenedAt: new Date(),
          folderReopenedById: actorId,
          folderReopenReason: cleanReason,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'Booking',
          entityId: bookingId,
          action: 'FOLDER_REOPENED',
          oldValues: { folderStatus: 'CLOSED' },
          newValues: { folderStatus: 'OPEN', reason: cleanReason },
          requestMetadata,
        },
        tx,
      );
      await this.notifyBookingUsers(
        tx,
        updated,
        'FOLDER_REOPENED',
        'Folder Reopened',
        `Folder ${updated.folderNumber} was reopened: ${cleanReason}`,
      );
      return updated;
    });
  }

  async summary(now = new Date()) {
    const start = this.utcDay(now);
    const tomorrow = new Date(start);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const [
      travelToday,
      travelComplete,
      operationsPending,
      openFolders,
      closedFolders,
      travelCompleteAccountsPending,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: {
          travelStartDate: { gte: start, lt: tomorrow },
          travelStatus: { not: 'CANCELLED' },
        },
      }),
      this.prisma.booking.count({ where: { travelStatus: 'TRAVEL_COMPLETE' } }),
      this.prisma.booking.count({
        where: {
          operationsStatus: { notIn: ['COMPLETE'] },
          folderStatus: 'OPEN',
        },
      }),
      this.prisma.booking.count({ where: { folderStatus: 'OPEN' } }),
      this.prisma.booking.count({ where: { folderStatus: 'CLOSED' } }),
      this.prisma.booking.count({
        where: {
          travelStatus: 'TRAVEL_COMPLETE',
          accountsStatus: { not: 'RECONCILED' },
          folderStatus: 'OPEN',
        },
      }),
    ]);
    return {
      travelToday,
      travelComplete,
      operationsPending,
      openFolders,
      closedFolders,
      travelCompleteAccountsPending,
    };
  }

  private utcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private async notifyBookingUsers(
    client: Prisma.TransactionClient,
    booking: Pick<Booking, 'id' | 'salesAdvisorId' | 'operationsOwnerId'>,
    type: 'TRAVEL_COMPLETE' | 'FOLDER_CLOSED' | 'FOLDER_REOPENED',
    title: string,
    message: string,
  ) {
    const recipients = [
      ...new Set(
        [booking.salesAdvisorId, booking.operationsOwnerId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    for (const userId of recipients) {
      const exists = await client.notification.findFirst({
        where: { userId, type, entityType: 'Booking', entityId: booking.id },
        select: { id: true },
      });
      if (!exists)
        await this.notifications.create(
          {
            userId,
            type,
            title,
            message,
            entityType: 'Booking',
            entityId: booking.id,
          },
          client,
        );
    }
  }
}
