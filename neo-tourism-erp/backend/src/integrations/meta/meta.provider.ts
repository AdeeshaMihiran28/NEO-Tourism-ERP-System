import { Injectable } from '@nestjs/common';
import {
  MarketingCalendarEntryType,
  MarketingCalendarStatus,
  MarketingChannel,
} from '../../../generated/prisma/client';
import type { MetaMarketingProvider } from './meta-adapter.interface';
import { metaConfiguration } from './meta.config';
import type { MetaMarketingEvent } from './meta.types';

@Injectable()
export class EnvironmentMetaProvider implements MetaMarketingProvider {
  getScheduledPosts(): Promise<MetaMarketingEvent[]> {
    const config = metaConfiguration();
    if (!config.mock)
      throw new Error('A live Meta API adapter has not been configured.');
    if (process.env.META_MOCK_FAIL === 'true')
      throw new Error('Meta development provider failure.');
    const at = new Date(
      process.env.META_MOCK_SCHEDULED_AT ?? Date.now() + 86400000,
    );
    return Promise.resolve([
      {
        externalReference: 'mock-facebook-scheduled-1',
        externalType: MarketingCalendarEntryType.FACEBOOK,
        title: 'Meta Scheduled Post A',
        scheduledAt: at,
        status: MarketingCalendarStatus.SCHEDULED,
        channel: MarketingChannel.FACEBOOK,
        safeMetadata: { developmentMock: true },
      },
      {
        externalReference: 'mock-instagram-scheduled-1',
        externalType: MarketingCalendarEntryType.INSTAGRAM,
        title: 'Meta Instagram Scheduled Post',
        scheduledAt: new Date(at.getTime() + 3600000),
        status: MarketingCalendarStatus.SCHEDULED,
        channel: MarketingChannel.INSTAGRAM,
        safeMetadata: { developmentMock: true },
      },
    ]);
  }
  getPublishedPosts() {
    return Promise.resolve([] as MetaMarketingEvent[]);
  }
  getBasicCampaignActivity() {
    return Promise.resolve([] as MetaMarketingEvent[]);
  }
}
