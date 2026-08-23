import { Injectable } from '@nestjs/common';
import {
  AccessRequestStatus,
  ITAssetStatus,
  ITTicketPriority,
  ITTicketStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { dashboardDateRange } from './dashboard-date-range';

@Injectable()
export class ItDashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async get(query: DashboardQueryDto) {
    dashboardDateRange(query);
    const openStatuses = [
      ITTicketStatus.OPEN,
      ITTicketStatus.ASSIGNED,
      ITTicketStatus.IN_PROGRESS,
      ITTicketStatus.WAITING_USER,
    ];
    const [
      openTickets,
      urgentTickets,
      ticketsInProgress,
      availableAssets,
      assignedAssets,
      assetsInRepair,
      pendingAccessRequests,
    ] = await Promise.all([
      this.prisma.iTTicket.count({ where: { status: { in: openStatuses } } }),
      this.prisma.iTTicket.count({
        where: {
          priority: ITTicketPriority.URGENT,
          status: { in: openStatuses },
        },
      }),
      this.prisma.iTTicket.count({
        where: { status: ITTicketStatus.IN_PROGRESS },
      }),
      this.prisma.iTAsset.count({ where: { status: ITAssetStatus.AVAILABLE } }),
      this.prisma.iTAsset.count({ where: { status: ITAssetStatus.ASSIGNED } }),
      this.prisma.iTAsset.count({ where: { status: ITAssetStatus.IN_REPAIR } }),
      this.prisma.accessRequest.count({
        where: { status: AccessRequestStatus.PENDING },
      }),
    ]);
    return {
      kpis: {
        openTickets,
        urgentTickets,
        ticketsInProgress,
        availableAssets,
        assignedAssets,
        assetsInRepair,
        pendingAccessRequests,
      },
    };
  }
}
