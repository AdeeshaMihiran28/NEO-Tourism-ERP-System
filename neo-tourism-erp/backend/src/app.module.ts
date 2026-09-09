import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CustomersModule } from './customers/customers.module';
import { DepartmentsModule } from './departments/departments.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { LeadsModule } from './leads/leads.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { SalesModule } from './sales/sales.module';
import { BookingsModule } from './bookings/bookings.module';
import { AccountsModule } from './accounts/accounts.module';
import { HrModule } from './hr/hr.module';
import { ItModule } from './it/it.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MarketingModule } from './marketing/marketing.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    RolesModule,
    PermissionsModule,
    CustomersModule,
    LeadsModule,
    NotificationsModule,
    SalesModule,
    BookingsModule,
    AccountsModule,
    HrModule,
    ItModule,
    DashboardModule,
    IntegrationsModule,
    MarketingModule,
  ],
  controllers: [HealthController],
  providers: [HealthService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
