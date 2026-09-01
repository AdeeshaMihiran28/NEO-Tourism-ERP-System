import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PulseModule } from '../pulse/pulse.module';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { AttributionService } from './services/attribution.service';
import { CampaignPerformanceService } from './services/campaign-performance.service';
@Module({
  imports: [PrismaModule, PulseModule],
  controllers: [SignalController],
  providers: [SignalService, AttributionService, CampaignPerformanceService],
  exports: [AttributionService, CampaignPerformanceService],
})
export class SignalModule {}
