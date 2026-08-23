import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TelephonyService } from './telephony/telephony.service';
import { WebsiteLeadsController } from './website/website-leads.controller';
import { WebsiteLeadsService } from './website/website-leads.service';
import { WiseService } from './wise/wise.service';

@Module({
  imports: [PrismaModule],
  controllers: [IntegrationsController, WebsiteLeadsController],
  providers: [
    IntegrationsService,
    WebsiteLeadsService,
    WiseService,
    TelephonyService,
  ],
  exports: [IntegrationsService, WiseService, TelephonyService],
})
export class IntegrationsModule {}
