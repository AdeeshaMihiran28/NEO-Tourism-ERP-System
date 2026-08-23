import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { DashboardQueryDto } from './dto/dashboard-query.dto';
import { AccountsDashboardService } from './services/accounts-dashboard.service';
import { HrDashboardService } from './services/hr-dashboard.service';
import { ItDashboardService } from './services/it-dashboard.service';
import { OperationsDashboardService } from './services/operations-dashboard.service';
import { SalesDashboardService } from './services/sales-dashboard.service';

const SAFE_ACTIVITY_ACTIONS = [
  'LEAD_ASSIGNED',
  'SALE_ACCEPTED_BY_ADMIN',
  'BOOKING_CREATED',
  'RECONCILIATION_COMPLETED',
  'EMPLOYEE_CREATED',
  'IT_TICKET_RESOLVED',
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesDashboardService,
    private readonly operations: OperationsDashboardService,
    private readonly accounts: AccountsDashboardService,
    private readonly hr: HrDashboardService,
    private readonly it: ItDashboardService,
  ) {}

  async management(query: DashboardQueryDto, user: AuthenticatedUser) {
    const [sales, operations, accounts, hr, it, recentActivity] =
      await Promise.all([
        this.sales.get(query),
        this.operations.get(query),
        this.accounts.get(query, user.permissions.includes('finance.view')),
        this.hr.get(query),
        this.it.get(query),
        this.recentActivity(),
      ]);
    return { sales, operations, accounts, hr, it, recentActivity };
  }

  async home(query: DashboardQueryDto, user: AuthenticatedUser) {
    const result: Record<string, unknown> = {};
    const tasks: Promise<void>[] = [];
    if (user.permissions.includes('dashboard.sales.view'))
      tasks.push(
        this.sales
          .get(
            query,
            user.permissions.includes('lead.view_all') ? undefined : user.id,
          )
          .then((value) => {
            result.sales = value;
          }),
      );
    if (user.permissions.includes('dashboard.operations.view'))
      tasks.push(
        this.operations
          .get(
            query,
            user.permissions.includes('booking.view_all') ? undefined : user.id,
          )
          .then((value) => {
            result.operations = value;
          }),
      );
    if (user.permissions.includes('dashboard.accounts.view'))
      tasks.push(
        this.accounts
          .get(query, user.permissions.includes('finance.view'))
          .then((value) => {
            result.accounts = value;
          }),
      );
    if (user.permissions.includes('dashboard.hr.view'))
      tasks.push(
        this.hr.get(query).then((value) => {
          result.hr = value;
        }),
      );
    if (user.permissions.includes('dashboard.it.view'))
      tasks.push(
        this.it.get(query).then((value) => {
          result.it = value;
        }),
      );
    await Promise.all(tasks);
    result.recentActivity = await this.recentActivity(
      user.permissions.includes('audit.view') ? undefined : user.id,
    );
    result.recentNotifications = await this.prisma.notification.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        message: true,
        isRead: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return result;
  }

  private async recentActivity(actorId?: string) {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        ...(actorId && { actorId }),
        action: { in: SAFE_ACTIVITY_ACTIONS },
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      actorName: `${entry.actor.firstName} ${entry.actor.lastName}`,
      createdAt: entry.createdAt,
    }));
  }
}
