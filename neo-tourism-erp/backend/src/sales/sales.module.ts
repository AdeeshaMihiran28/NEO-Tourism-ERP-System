import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AdminSalesController,
  SalesSubmissionsController,
} from './sales-submissions.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, NotificationsModule],
  controllers: [SalesSubmissionsController, AdminSalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
