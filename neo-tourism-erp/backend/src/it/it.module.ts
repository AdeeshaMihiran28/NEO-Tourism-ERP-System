import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ItController } from './it.controller';
import { ItService } from './it.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ItController],
  providers: [ItService],
})
export class ItModule {}
