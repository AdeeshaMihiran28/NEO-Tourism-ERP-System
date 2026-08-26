import { Module } from '@nestjs/common';
import { DealsModule } from './deals/deals.module';
import { CalendarModule } from './calendar/calendar.module';
import { PulseModule } from './pulse/pulse.module';

@Module({
  imports: [DealsModule, CalendarModule, PulseModule],
  exports: [DealsModule, CalendarModule, PulseModule],
})
export class MarketingModule {}
