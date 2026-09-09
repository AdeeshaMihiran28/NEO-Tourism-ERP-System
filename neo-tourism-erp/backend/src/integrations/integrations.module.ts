import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TelephonyService } from './telephony/telephony.service';
import { WebsiteLeadsController } from './website/website-leads.controller';
import { WebsiteLeadsService } from './website/website-leads.service';
import { WebsiteDealPublisher } from './website/website-deal.publisher';
import { WiseService } from './wise/wise.service';
import { MetaModule } from './meta/meta.module';

@Module({
  imports: [PrismaModule, MetaModule],
  controllers: [IntegrationsController, WebsiteLeadsController],
  providers: [
    IntegrationsService,
    WebsiteLeadsService,
    WiseService,
    TelephonyService,
    WebsiteDealPublisher,
    MetaModule,
  ],
  exports: [
    IntegrationsService,
    WiseService,
    TelephonyService,
    WebsiteDealPublisher,
  ],
})
export class IntegrationsModule {}
