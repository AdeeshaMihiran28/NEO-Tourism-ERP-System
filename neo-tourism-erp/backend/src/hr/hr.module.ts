import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
