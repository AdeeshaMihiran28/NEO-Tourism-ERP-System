-- CreateEnum
CREATE TYPE "MarketingAttributionConfidence" AS ENUM ('DIRECT', 'TRACKED', 'MANUAL', 'UNATTRIBUTED');

-- CreateEnum
CREATE TYPE "MarketingAttributionSource" AS ENUM ('ERP_LINK', 'UTM', 'WEBSITE', 'META', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingOpportunitySource" AS ENUM ('CRM_TREND', 'SALES_SIGNAL', 'DEAL_INTEREST', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingOpportunityStatus" AS ENUM ('NEW', 'REVIEWING', 'ACCEPTED', 'ACTIONED', 'DISMISSED');

-- CreateTable
CREATE TABLE "MarketingAttribution" (
    "id" UUID NOT NULL,
    "campaignId" UUID,
    "dealId" UUID,
    "contentId" UUID,
    "publicationId" UUID,
    "leadId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "saleSubmissionId" UUID,
    "bookingId" UUID,
    "confidence" "MarketingAttributionConfidence" NOT NULL,
    "source" "MarketingAttributionSource" NOT NULL,
    "externalReference" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstTouchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingOpportunity" (
    "id" UUID NOT NULL,
    "sourceType" "MarketingOpportunitySource" NOT NULL,
    "sourceReferenceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "destination" TEXT,
    "priority" "MarketingPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MarketingOpportunityStatus" NOT NULL DEFAULT 'NEW',
    "createdByUserId" UUID NOT NULL,
    "assignedUserId" UUID,
    "campaignId" UUID,
    "contentId" UUID,
    "dealId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingAttribution_campaignId_firstTouchAt_idx" ON "MarketingAttribution"("campaignId", "firstTouchAt");

-- CreateIndex
CREATE INDEX "MarketingAttribution_dealId_firstTouchAt_idx" ON "MarketingAttribution"("dealId", "firstTouchAt");

-- CreateIndex
CREATE INDEX "MarketingAttribution_contentId_firstTouchAt_idx" ON "MarketingAttribution"("contentId", "firstTouchAt");

-- CreateIndex
CREATE INDEX "MarketingAttribution_leadId_isActive_idx" ON "MarketingAttribution"("leadId", "isActive");

-- CreateIndex
CREATE INDEX "MarketingAttribution_bookingId_idx" ON "MarketingAttribution"("bookingId");

-- CreateIndex
CREATE INDEX "MarketingAttribution_saleSubmissionId_idx" ON "MarketingAttribution"("saleSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingAttribution_source_externalReference_key" ON "MarketingAttribution"("source", "externalReference");

-- CreateIndex
CREATE INDEX "MarketingOpportunity_status_priority_createdAt_idx" ON "MarketingOpportunity"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingOpportunity_destination_status_idx" ON "MarketingOpportunity"("destination", "status");

-- CreateIndex
CREATE INDEX "MarketingOpportunity_sourceType_sourceReferenceId_idx" ON "MarketingOpportunity"("sourceType", "sourceReferenceId");

-- CreateIndex
CREATE INDEX "MarketingOpportunity_assignedUserId_status_idx" ON "MarketingOpportunity"("assignedUserId", "status");

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "MarketingPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_saleSubmissionId_fkey" FOREIGN KEY ("saleSubmissionId") REFERENCES "SaleSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOpportunity" ADD CONSTRAINT "MarketingOpportunity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOpportunity" ADD CONSTRAINT "MarketingOpportunity_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOpportunity" ADD CONSTRAINT "MarketingOpportunity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOpportunity" ADD CONSTRAINT "MarketingOpportunity_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOpportunity" ADD CONSTRAINT "MarketingOpportunity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
