import { Injectable } from '@nestjs/common';
import {
  AccountsStatus,
  BookingStatus,
  OperationsStatus,
  SaleSubmissionStatus,
  TravelStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { dashboardDateRange, todayUtc } from './dashboard-date-range';

@Injectable()
export class OperationsDashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async get(query: DashboardQueryDto, ownerId?: string) {
    dashboardDateRange(query);
    const today = todayUtc();
    const inThreeDays = new Date(today.start.getTime() + 4 * 86_400_000 - 1);
    const inSevenDays = new Date(today.start.getTime() + 8 * 86_400_000 - 1);
    const scope = ownerId ? { operationsOwnerId: ownerId } : {};
    const [
      newSalesWaitingForAdmin,
      bookingsInProgress,
      operationsPending,
      supplierPending,
      ticketingPending,
      actionRequired,
      travelStartingSoon,
      currentlyTravelling,
      travelComplete,
      travelCompleteAccountsPending,
      tasksDue,
      upcomingTravel,
    ] = await Promise.all([
      this.prisma.saleSubmission.count({
        where: { status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN },
      }),
      this.prisma.booking.count({
        where: { ...scope, status: BookingStatus.IN_PROGRESS },
      }),
      this.prisma.booking.count({
        where: { ...scope, operationsStatus: OperationsStatus.PENDING },
      }),
      this.prisma.booking.count({
        where: {
          ...scope,
          operationsStatus: OperationsStatus.SUPPLIER_PENDING,
        },
      }),
      this.prisma.booking.count({
        where: {
          ...scope,
          operationsStatus: OperationsStatus.TICKETING_PENDING,
        },
      }),
      this.prisma.booking.count({
        where: { ...scope, operationsStatus: OperationsStatus.ACTION_REQUIRED },
      }),
      this.prisma.booking.count({
        where: {
          ...scope,
          travelStartDate: { gte: today.start, lte: inSevenDays },
          travelStatus: TravelStatus.UPCOMING,
        },
      }),
      this.prisma.booking.count({
        where: { ...scope, travelStatus: TravelStatus.IN_TRAVEL },
      }),
      this.prisma.booking.count({
        where: { ...scope, travelStatus: TravelStatus.TRAVEL_COMPLETE },
      }),
      this.prisma.booking.count({
        where: {
          ...scope,
          travelStatus: TravelStatus.TRAVEL_COMPLETE,
          accountsStatus: { not: AccountsStatus.RECONCILED },
        },
      }),
      this.prisma.bookingTask.count({
        where: {
          ...(ownerId && { assignedUserId: ownerId }),
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { lte: today.end },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          ...scope,
          travelStartDate: { gte: today.start, lte: inSevenDays },
          travelStatus: TravelStatus.UPCOMING,
        },
        select: {
          id: true,
          folderNumber: true,
          destination: true,
          travelStartDate: true,
          operationsStatus: true,
          customer: { select: { firstName: true, lastName: true } },
          operationsOwner: { select: { firstName: true, lastName: true } },
        },
        orderBy: { travelStartDate: 'asc' },
        take: 20,
      }),
    ]);
    return {
      kpis: {
        newSalesWaitingForAdmin,
        bookingsInProgress,
        operationsPending,
        supplierPending,
        ticketingPending,
        actionRequired,
        travelStartingSoon,
        currentlyTravelling,
        travelComplete,
        travelCompleteAccountsPending,
        tasksDue,
      },
      upcomingTravel: upcomingTravel.map((booking) => ({
        ...booking,
        window:
          booking.travelStartDate <= today.end
            ? 'TODAY'
            : booking.travelStartDate <= inThreeDays
              ? 'WITHIN_3_DAYS'
              : 'WITHIN_7_DAYS',
      })),
    };
  }
}
