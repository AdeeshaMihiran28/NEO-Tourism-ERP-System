import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DealsModule } from '../deals/deals.module';
import { PulseModule } from '../pulse/pulse.module';
import { RadarController } from './radar.controller';
import { RadarService } from './radar.service';
import { NeoTrioModule } from '../neotrio/neotrio.module';
@Module({
  imports: [PrismaModule, PulseModule, DealsModule, NeoTrioModule],
  controllers: [RadarController],
  providers: [RadarService],
})
export class RadarModule {}
