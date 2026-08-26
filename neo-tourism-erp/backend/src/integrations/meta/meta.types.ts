import type {
  MarketingCalendarEntryType,
  MarketingCalendarStatus,
  MarketingChannel,
} from '../../../generated/prisma/client';

export type MetaMarketingEvent = {
  externalReference: string;
  externalType: MarketingCalendarEntryType;
  title: string;
  scheduledAt?: Date;
  publishedAt?: Date;
  status: MarketingCalendarStatus;
  channel: MarketingChannel;
  safeMetadata?: Record<string, string | number | boolean>;
};
