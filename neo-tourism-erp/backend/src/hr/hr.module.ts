import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountProvisioningModule } from '../account-provisioning/account-provisioning.module';
import { PositionsModule } from '../positions/positions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HrController } from './hr.controller';
import { HrLaunchController } from './hr-launch.controller';
import { HrLaunchService } from './hr-launch.service';
import { HrSchedulerService } from './hr-scheduler.service';
import { HrService } from './hr.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    PositionsModule,
    AccountProvisioningModule,
  ],
  controllers: [HrController, HrLaunchController],
  providers: [HrService, HrLaunchService, HrSchedulerService],
  exports: [HrService, HrLaunchService],
})
export class HrModule {}
