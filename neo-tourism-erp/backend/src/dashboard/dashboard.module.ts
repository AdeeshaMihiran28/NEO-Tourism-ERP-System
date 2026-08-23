import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AccountsDashboardService } from './services/accounts-dashboard.service';
import { HrDashboardService } from './services/hr-dashboard.service';
import { ItDashboardService } from './services/it-dashboard.service';
import { OperationsDashboardService } from './services/operations-dashboard.service';
import { SalesDashboardService } from './services/sales-dashboard.service';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    SalesDashboardService,
    OperationsDashboardService,
    AccountsDashboardService,
    HrDashboardService,
    ItDashboardService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
