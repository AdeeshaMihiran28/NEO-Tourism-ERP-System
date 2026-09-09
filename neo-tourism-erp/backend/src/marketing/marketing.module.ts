import { Module } from '@nestjs/common';
import { DealsModule } from './deals/deals.module';
import { CalendarModule } from './calendar/calendar.module';
import { PulseModule } from './pulse/pulse.module';
import { SignalModule } from './signal/signal.module';
import { RadarModule } from './radar/radar.module';
import { NeoTrioModule } from './neotrio/neotrio.module';

@Module({
  imports: [
    DealsModule,
    CalendarModule,
    PulseModule,
    SignalModule,
    RadarModule,
    NeoTrioModule,
  ],
  exports: [
    DealsModule,
    CalendarModule,
    PulseModule,
    SignalModule,
    RadarModule,
    NeoTrioModule,
  ],
})
export class MarketingModule {}
