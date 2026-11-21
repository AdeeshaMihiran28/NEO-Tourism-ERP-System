import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PositionAccessService } from './position-access.service';
import { PositionsController } from './positions.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [PositionsController],
  providers: [PositionAccessService],
  exports: [PositionAccessService],
})
export class PositionsModule {}
