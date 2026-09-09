import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FollowUpsController } from './follow-ups.controller';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { FollowUpSchedulerService } from './services/follow-up-scheduler.service';
import { FollowUpsService } from './services/follow-ups.service';
import { LeadAttentionService } from './services/lead-attention.service';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    NotificationsModule,
    SalesModule,
  ],
  controllers: [LeadsController, FollowUpsController],
  providers: [
    LeadsService,
    LeadAttentionService,
    FollowUpsService,
    FollowUpSchedulerService,
  ],
  exports: [LeadAttentionService, FollowUpsService, FollowUpSchedulerService],
})
export class LeadsModule {}
