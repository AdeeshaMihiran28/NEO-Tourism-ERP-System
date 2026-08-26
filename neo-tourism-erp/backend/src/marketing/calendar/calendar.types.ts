import type {
  MarketingCalendarEntryType,
  MarketingCalendarSource,
  MarketingCalendarStatus,
  MarketingChannel,
} from '../../../generated/prisma/client';

export type NormalizedCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  entryType: MarketingCalendarEntryType;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  status: MarketingCalendarStatus;
  source: MarketingCalendarSource;
  channel: MarketingChannel | null;
  campaignId: string | null;
  dealId: string | null;
  contentId: string | null;
  publicationId: string | null;
  assignedUserId: string | null;
  editable: boolean;
  reschedulable: boolean;
  href: string | null;
  externalPublishStatus?: 'VERIFIED' | 'NOT_VERIFIED';
};
