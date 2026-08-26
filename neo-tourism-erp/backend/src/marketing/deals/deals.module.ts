import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { MarketingDealLifecycleService } from './marketing-deal-lifecycle.service';
import { CampaignsController } from '../campaigns/campaigns.controller';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContentController } from '../content/content.controller';
import { ContentDeadlineScheduler } from '../content/content-deadline.scheduler';
import { ContentService } from '../content/content.service';

@Module({
  imports: [PrismaModule, NotificationsModule, IntegrationsModule],
  controllers: [DealsController, CampaignsController, ContentController],
  providers: [
    DealsService,
    MarketingDealLifecycleService,
    CampaignsService,
    ContentService,
    ContentDeadlineScheduler,
  ],
  exports: [DealsService, MarketingDealLifecycleService],
})
export class DealsModule {}
