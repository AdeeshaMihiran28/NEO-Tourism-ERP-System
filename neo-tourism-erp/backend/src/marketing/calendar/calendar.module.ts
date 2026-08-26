import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CalendarController } from './calendar.controller';
import { MarketingAlertsService } from './services/marketing-alerts.service';
import { MarketingCalendarService } from './services/marketing-calendar.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CalendarController],
  providers: [MarketingCalendarService, MarketingAlertsService],
  exports: [MarketingCalendarService, MarketingAlertsService],
})
export class CalendarModule {}
