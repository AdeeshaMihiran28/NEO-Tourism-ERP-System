import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CalendarModule } from '../calendar/calendar.module';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';
import { PulseCrmService } from './services/pulse-crm.service';
import { PulseWorkloadService } from './services/pulse-workload.service';
import { SalesSignalsService } from './services/sales-signals.service';
@Module({
  imports: [PrismaModule, NotificationsModule, CalendarModule],
  controllers: [PulseController],
  providers: [
    PulseService,
    PulseCrmService,
    PulseWorkloadService,
    SalesSignalsService,
  ],
})
export class PulseModule {}
