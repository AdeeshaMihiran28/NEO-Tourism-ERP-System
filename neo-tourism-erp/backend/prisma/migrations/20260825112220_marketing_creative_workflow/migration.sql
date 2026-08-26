-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingContentType" AS ENUM ('SOCIAL_POST', 'REEL', 'STORY', 'CAROUSEL', 'WEBSITE_BANNER', 'WEBSITE_CONTENT', 'EMAIL', 'PAID_AD', 'VIDEO', 'BLOG', 'NEOTRIO', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingContentStage" AS ENUM ('IDEA', 'CREATING', 'REVIEW', 'READY', 'LIVE', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MarketingContentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketingPublicationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'REMOVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_REVIEW_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_CHANGES_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_CONTENT_DEADLINE';
ALTER TYPE "NotificationType" ADD VALUE 'CONNECTED_DEAL_CHANGED';

-- CreateTable
CREATE TABLE "MarketingCampaignCounter" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaignCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "MarketingContentCounter" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingContentCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" UUID NOT NULL,
    "campaignCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE,
    "endDate" DATE,
    "ownerUserId" UUID NOT NULL,
    "dealId" UUID,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingContent" (
    "id" UUID NOT NULL,
    "contentCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contentType" "MarketingContentType" NOT NULL,
    "stage" "MarketingContentStage" NOT NULL DEFAULT 'IDEA',
    "campaignId" UUID,
    "dealId" UUID,
    "assignedUserId" UUID,
    "deadline" DATE,
    "priority" "MarketingPriority" NOT NULL DEFAULT 'NORMAL',
    "currentVersionId" UUID,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "dealReviewReason" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingContentVersion" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT,
    "fileType" TEXT,
    "storageKey" TEXT,
    "caption" TEXT,
    "copyText" TEXT,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingContentApproval" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "status" "MarketingContentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingContentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingContentComment" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingContentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPublication" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "status" "MarketingPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaign_campaignCode_key" ON "MarketingCampaign"("campaignCode");

-- CreateIndex
CREATE INDEX "MarketingCampaign_status_startDate_idx" ON "MarketingCampaign"("status", "startDate");

-- CreateIndex
CREATE INDEX "MarketingCampaign_ownerUserId_idx" ON "MarketingCampaign"("ownerUserId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_dealId_idx" ON "MarketingCampaign"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContent_contentCode_key" ON "MarketingContent"("contentCode");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContent_currentVersionId_key" ON "MarketingContent"("currentVersionId");

-- CreateIndex
CREATE INDEX "MarketingContent_stage_deadline_idx" ON "MarketingContent"("stage", "deadline");

-- CreateIndex
CREATE INDEX "MarketingContent_assignedUserId_stage_idx" ON "MarketingContent"("assignedUserId", "stage");

-- CreateIndex
CREATE INDEX "MarketingContent_campaignId_idx" ON "MarketingContent"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingContent_dealId_idx" ON "MarketingContent"("dealId");

-- CreateIndex
CREATE INDEX "MarketingContentVersion_createdById_idx" ON "MarketingContentVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContentVersion_contentId_versionNumber_key" ON "MarketingContentVersion"("contentId", "versionNumber");

-- CreateIndex
CREATE INDEX "MarketingContentApproval_status_requestedAt_idx" ON "MarketingContentApproval"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "MarketingContentApproval_contentId_createdAt_idx" ON "MarketingContentApproval"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingContentApproval_reviewerUserId_status_idx" ON "MarketingContentApproval"("reviewerUserId", "status");

-- CreateIndex
CREATE INDEX "MarketingContentComment_contentId_createdAt_idx" ON "MarketingContentComment"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingPublication_contentId_status_idx" ON "MarketingPublication"("contentId", "status");

-- CreateIndex
CREATE INDEX "MarketingPublication_channel_status_idx" ON "MarketingPublication"("channel", "status");

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContent" ADD CONSTRAINT "MarketingContent_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "MarketingContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentVersion" ADD CONSTRAINT "MarketingContentVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentVersion" ADD CONSTRAINT "MarketingContentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentApproval" ADD CONSTRAINT "MarketingContentApproval_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentApproval" ADD CONSTRAINT "MarketingContentApproval_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "MarketingContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentApproval" ADD CONSTRAINT "MarketingContentApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentApproval" ADD CONSTRAINT "MarketingContentApproval_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentComment" ADD CONSTRAINT "MarketingContentComment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingContentComment" ADD CONSTRAINT "MarketingContentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPublication" ADD CONSTRAINT "MarketingPublication_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MarketingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPublication" ADD CONSTRAINT "MarketingPublication_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "MarketingContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
