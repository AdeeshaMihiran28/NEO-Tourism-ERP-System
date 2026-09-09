import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HrController } from './hr.controller';
import { HrLaunchController } from './hr-launch.controller';
import { HrLaunchService } from './hr-launch.service';
import { HrSchedulerService } from './hr-scheduler.service';
import { HrService } from './hr.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [HrController, HrLaunchController],
  providers: [HrService, HrLaunchService, HrSchedulerService],
  exports: [HrService, HrLaunchService],
})
export class HrModule {}
