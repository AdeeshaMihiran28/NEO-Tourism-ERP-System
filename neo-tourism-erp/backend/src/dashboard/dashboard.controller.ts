import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { AccountsDashboardService } from './services/accounts-dashboard.service';
import { HrDashboardService } from './services/hr-dashboard.service';
import { ItDashboardService } from './services/it-dashboard.service';
import { OperationsDashboardService } from './services/operations-dashboard.service';
import { SalesDashboardService } from './services/sales-dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly sales: SalesDashboardService,
    private readonly operations: OperationsDashboardService,
    private readonly accounts: AccountsDashboardService,
    private readonly hr: HrDashboardService,
    private readonly it: ItDashboardService,
  ) {}

  @Get()
  home(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dashboard.home(query, user);
  }

  @Get('management')
  @Permissions('dashboard.management.view')
  management(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dashboard.management(query, user);
  }

  @Get('sales') @Permissions('dashboard.sales.view') salesDashboard(
    @Query() query: DashboardQueryDto,
  ) {
    return this.sales.get(query);
  }
  @Get('operations')
  @Permissions('dashboard.operations.view')
  operationsDashboard(@Query() query: DashboardQueryDto) {
    return this.operations.get(query);
  }
  @Get('accounts') @Permissions('dashboard.accounts.view') accountsDashboard(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.get(query, user.permissions.includes('finance.view'));
  }
  @Get('hr') @Permissions('dashboard.hr.view') hrDashboard(
    @Query() query: DashboardQueryDto,
  ) {
    return this.hr.get(query);
  }
  @Get('it') @Permissions('dashboard.it.view') itDashboard(
    @Query() query: DashboardQueryDto,
  ) {
    return this.it.get(query);
  }
}
