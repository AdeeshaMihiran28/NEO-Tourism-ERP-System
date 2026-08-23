import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  EmploymentStatus,
  LeaveRequestStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { dashboardDateRange, todayUtc } from './dashboard-date-range';

@Injectable()
export class HrDashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async get(query: DashboardQueryDto) {
    dashboardDateRange(query);
    const today = todayUtc();
    const [
      activeEmployees,
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      pendingLeaveRequests,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { employmentStatus: EmploymentStatus.ACTIVE },
      }),
      this.prisma.attendance.count({
        where: {
          date: today.start,
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.REMOTE] },
        },
      }),
      this.prisma.attendance.count({
        where: { date: today.start, status: AttendanceStatus.ABSENT },
      }),
      this.prisma.attendance.count({
        where: { date: today.start, status: AttendanceStatus.LATE },
      }),
      this.prisma.leaveRequest.count({
        where: {
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: today.end },
          endDate: { gte: today.start },
        },
      }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveRequestStatus.PENDING },
      }),
    ]);
    return {
      kpis: {
        activeEmployees,
        presentToday,
        absentToday,
        lateToday,
        onLeaveToday,
        pendingLeaveRequests,
      },
    };
  }
}
