import type { MetaMarketingEvent } from './meta.types';

export const META_MARKETING_PROVIDER = Symbol('META_MARKETING_PROVIDER');
export interface MetaMarketingProvider {
  getScheduledPosts(): Promise<MetaMarketingEvent[]>;
  getPublishedPosts(): Promise<MetaMarketingEvent[]>;
  getBasicCampaignActivity(): Promise<MetaMarketingEvent[]>;
}
