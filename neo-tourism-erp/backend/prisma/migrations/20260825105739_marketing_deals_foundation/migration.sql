-- CreateEnum
CREATE TYPE "MarketingDealStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MarketingDealApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'EMAIL', 'PAID_ADS', 'NEOTRIO', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingChannelStatus" AS ENUM ('NOT_PUBLISHED', 'SCHEDULED', 'LIVE', 'REMOVED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebsitePublicationStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING', 'PUBLISHED', 'UNPUBLISHED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_DEAL_APPROVAL_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_DEAL_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_DEAL_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_DEAL_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_DEAL_SUSPENDED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_DEAL_CHANNEL_FAILURE';

-- CreateTable
CREATE TABLE "MarketingDealCounter" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDealCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "MarketingDeal" (
    "id" UUID NOT NULL,
    "dealCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "destination" TEXT NOT NULL,
    "departureLocation" TEXT NOT NULL,
    "departureDate" DATE,
    "travelStartDate" DATE NOT NULL,
    "travelEndDate" DATE NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "baggage" TEXT,
    "keyTerms" TEXT NOT NULL,
    "expiryAt" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "status" "MarketingDealStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "MarketingDealApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "contentReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "websitePublicationStatus" "WebsitePublicationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "websiteActionMessage" TEXT,
    "expiringNotificationAt" TIMESTAMP(3),
    "expiredNotificationAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "suspendedById" UUID,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingDealChannel" (
    "id" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "status" "MarketingChannelStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
    "externalReference" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDealChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingDeal_dealCode_key" ON "MarketingDeal"("dealCode");

-- CreateIndex
CREATE INDEX "MarketingDeal_status_expiryAt_idx" ON "MarketingDeal"("status", "expiryAt");

-- CreateIndex
CREATE INDEX "MarketingDeal_approvalStatus_status_idx" ON "MarketingDeal"("approvalStatus", "status");

-- CreateIndex
CREATE INDEX "MarketingDeal_destination_idx" ON "MarketingDeal"("destination");

-- CreateIndex
CREATE INDEX "MarketingDeal_scheduledFor_idx" ON "MarketingDeal"("scheduledFor");

-- CreateIndex
CREATE INDEX "MarketingDealChannel_channel_status_idx" ON "MarketingDealChannel"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingDealChannel_dealId_channel_key" ON "MarketingDealChannel"("dealId", "channel");

-- AddForeignKey
ALTER TABLE "MarketingDeal" ADD CONSTRAINT "MarketingDeal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDeal" ADD CONSTRAINT "MarketingDeal_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDeal" ADD CONSTRAINT "MarketingDeal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDeal" ADD CONSTRAINT "MarketingDeal_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDealChannel" ADD CONSTRAINT "MarketingDealChannel_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
