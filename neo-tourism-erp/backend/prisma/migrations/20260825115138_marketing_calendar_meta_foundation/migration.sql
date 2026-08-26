-- CreateEnum
CREATE TYPE "MarketingCalendarEntryType" AS ENUM ('CONTENT', 'CAMPAIGN', 'DEAL', 'DEAL_EXPIRY', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'PAID_AD', 'EMAIL', 'NEOTRIO', 'SEASONAL', 'INTERNAL_EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingCalendarSource" AS ENUM ('INTERNAL', 'META', 'WEBSITE', 'OTHER_INTEGRATION');

-- CreateEnum
CREATE TYPE "MarketingCalendarStatus" AS ENUM ('DRAFT', 'PLANNED', 'SCHEDULED', 'READY', 'PUBLISHED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- AlterEnum
ALTER TYPE "IntegrationProviderType" ADD VALUE 'META';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_GAP';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_READY_TO_PUBLISH';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CAMPAIGN_STARTING';

-- CreateTable
CREATE TABLE "MarketingCalendarEntry" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entryType" "MarketingCalendarEntryType" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "status" "MarketingCalendarStatus" NOT NULL DEFAULT 'PLANNED',
    "campaignId" UUID,
    "dealId" UUID,
    "contentId" UUID,
    "publicationId" UUID,
    "assignedUserId" UUID,
    "channel" "MarketingChannel",
    "source" "MarketingCalendarSource" NOT NULL DEFAULT 'INTERNAL',
    "externalReference" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalMarketingEvent" (
    "id" UUID NOT NULL,
    "provider" "IntegrationProviderType" NOT NULL,
    "externalReference" TEXT NOT NULL,
    "externalType" "MarketingCalendarEntryType" NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" "MarketingCalendarStatus" NOT NULL,
    "channel" "MarketingChannel",
    "campaignId" UUID,
    "contentId" UUID,
    "rawMetadataSafe" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dealId" UUID,

    CONSTRAINT "ExternalMarketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingCalendarEntry_startAt_endAt_idx" ON "MarketingCalendarEntry"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "MarketingCalendarEntry_entryType_status_idx" ON "MarketingCalendarEntry"("entryType", "status");

-- CreateIndex
CREATE INDEX "MarketingCalendarEntry_campaignId_idx" ON "MarketingCalendarEntry"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingCalendarEntry_dealId_idx" ON "MarketingCalendarEntry"("dealId");

-- CreateIndex
CREATE INDEX "MarketingCalendarEntry_contentId_idx" ON "MarketingCalendarEntry"("contentId");

-- CreateIndex
CREATE INDEX "MarketingCalendarEntry_assignedUserId_idx" ON "MarketingCalendarEntry"("assignedUserId");

-- CreateIndex
CREATE INDEX "ExternalMarketingEvent_scheduledAt_publishedAt_idx" ON "ExternalMarketingEvent"("scheduledAt", "publishedAt");

-- CreateIndex
CREATE INDEX "ExternalMarketingEvent_channel_status_idx" ON "ExternalMarketingEvent"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMarketingEvent_provider_externalReference_key" ON "ExternalMarketingEvent"("provider", "externalReference");

-- AddForeignKey
ALTER TABLE "MarketingCalendarEntry" ADD CONSTRAINT "MarketingCalendarEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCalendarEntry" ADD CONSTRAINT "MarketingCalendarEntry_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCalendarEntry" ADD CONSTRAINT "MarketingCalendarEntry_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCalendarEntry" ADD CONSTRAINT "MarketingCalendarEntry_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "MarketingPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCalendarEntry" ADD CONSTRAINT "MarketingCalendarEntry_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCalendarEntry" ADD CONSTRAINT "MarketingCalendarEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCalendarEntry" ADD CONSTRAINT "MarketingCalendarEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMarketingEvent" ADD CONSTRAINT "ExternalMarketingEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMarketingEvent" ADD CONSTRAINT "ExternalMarketingEvent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMarketingEvent" ADD CONSTRAINT "ExternalMarketingEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
