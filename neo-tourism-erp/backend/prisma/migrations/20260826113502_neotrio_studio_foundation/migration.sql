-- CreateEnum
CREATE TYPE "NeoTrioCharacterAssetType" AS ENUM ('CHARACTER_REFERENCE', 'MASTER_IMAGE', 'OUTFIT_REFERENCE', 'EXPRESSION_REFERENCE', 'POSE_REFERENCE', 'VOICE_REFERENCE', 'STYLE_GUIDE', 'SCRIPT_GUIDE', 'LOGO_OR_BRANDING', 'OTHER');

-- CreateEnum
CREATE TYPE "NeoTrioAssetStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NeoTrioIdeaType" AS ENUM ('JOKE', 'TREND', 'TRAVEL_IDEA', 'DESTINATION', 'CAMPAIGN', 'EDUCATIONAL', 'PROMOTIONAL', 'SEASONAL', 'MEME', 'EPISODE', 'REEL', 'OTHER');

-- CreateEnum
CREATE TYPE "NeoTrioIdeaStatus" AS ENUM ('NEW', 'SHORTLISTED', 'ACCEPTED', 'CONVERTED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NeoTrioProductionType" AS ENUM ('EPISODE', 'REEL', 'SHORT_VIDEO', 'MEME', 'SOCIAL_POST', 'STORY', 'CAMPAIGN_APPEARANCE', 'IMAGE', 'SCRIPT_ONLY', 'OTHER');

-- CreateEnum
CREATE TYPE "NeoTrioProductionStage" AS ENUM ('IDEA', 'SCRIPT', 'PRODUCTION', 'REVIEW', 'READY', 'PUBLISHED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NeoTrioProductionAssetType" AS ENUM ('SCRIPT', 'RAW_IMAGE', 'RAW_VIDEO', 'EDITED_IMAGE', 'EDITED_VIDEO', 'THUMBNAIL', 'CAPTION', 'AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "NeoTrioLibraryType" AS ENUM ('EPISODE', 'REEL', 'MEME', 'SCRIPT', 'CAMPAIGN_APPEARANCE', 'SOCIAL_POST', 'IMAGE', 'VIDEO', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'NEOTRIO_IDEA_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'NEOTRIO_PRODUCTION_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'NEOTRIO_PRODUCTION_REVIEW_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'NEOTRIO_PRODUCTION_CHANGES_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'NEOTRIO_PRODUCTION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'NEOTRIO_PRODUCTION_DEADLINE';
ALTER TYPE "NotificationType" ADD VALUE 'NEOTRIO_CHARACTER_ASSET_APPROVAL_REQUIRED';

-- CreateTable
CREATE TABLE "NeoTrioIdeaCounter" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioIdeaCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "NeoTrioProductionCounter" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioProductionCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "NeoTrioSeriesCounter" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioSeriesCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "NeoTrioCharacter" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "personality" TEXT,
    "appearanceGuidelines" TEXT,
    "voiceStyleGuidelines" TEXT,
    "generalGuidelines" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeoTrioCharacterAsset" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "versionGroupKey" UUID NOT NULL,
    "assetType" "NeoTrioCharacterAssetType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "NeoTrioAssetStatus" NOT NULL DEFAULT 'DRAFT',
    "isMasterAsset" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioCharacterAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeoTrioIdea" (
    "id" UUID NOT NULL,
    "ideaCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ideaType" "NeoTrioIdeaType" NOT NULL,
    "destination" TEXT,
    "trendReference" TEXT,
    "priority" "MarketingPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "NeoTrioIdeaStatus" NOT NULL DEFAULT 'NEW',
    "submittedById" UUID NOT NULL,
    "assignedUserId" UUID,
    "campaignId" UUID,
    "dealId" UUID,
    "marketingOpportunityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeoTrioIdeaCharacter" (
    "ideaId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "NeoTrioIdeaCharacter_pkey" PRIMARY KEY ("ideaId","characterId")
);

-- CreateTable
CREATE TABLE "NeoTrioSeries" (
    "id" UUID NOT NULL,
    "seriesCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeoTrioProduction" (
    "id" UUID NOT NULL,
    "productionCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "productionType" "NeoTrioProductionType" NOT NULL,
    "stage" "NeoTrioProductionStage" NOT NULL DEFAULT 'IDEA',
    "ideaId" UUID,
    "campaignId" UUID,
    "dealId" UUID,
    "marketingContentId" UUID,
    "seriesId" UUID,
    "assignedUserId" UUID,
    "deadline" DATE,
    "plannedPublishAt" TIMESTAMP(3),
    "priority" "MarketingPriority" NOT NULL DEFAULT 'NORMAL',
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioProduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeoTrioProductionCharacter" (
    "productionId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "NeoTrioProductionCharacter_pkey" PRIMARY KEY ("productionId","characterId")
);

-- CreateTable
CREATE TABLE "NeoTrioScript" (
    "id" UUID NOT NULL,
    "productionId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "scriptText" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeoTrioScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeoTrioProductionAsset" (
    "id" UUID NOT NULL,
    "productionId" UUID NOT NULL,
    "versionGroupKey" UUID NOT NULL,
    "assetType" "NeoTrioProductionAssetType" NOT NULL,
    "title" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeoTrioProductionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeoTrioLibraryItem" (
    "id" UUID NOT NULL,
    "productionId" UUID NOT NULL,
    "marketingContentId" UUID,
    "publicationId" UUID,
    "title" TEXT NOT NULL,
    "libraryType" "NeoTrioLibraryType" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" UUID,
    "dealId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeoTrioLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioCharacter_code_key" ON "NeoTrioCharacter"("code");

-- CreateIndex
CREATE INDEX "NeoTrioCharacter_isActive_name_idx" ON "NeoTrioCharacter"("isActive", "name");

-- CreateIndex
CREATE INDEX "NeoTrioCharacterAsset_characterId_status_assetType_idx" ON "NeoTrioCharacterAsset"("characterId", "status", "assetType");

-- CreateIndex
CREATE INDEX "NeoTrioCharacterAsset_characterId_isMasterAsset_idx" ON "NeoTrioCharacterAsset"("characterId", "isMasterAsset");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioCharacterAsset_versionGroupKey_version_key" ON "NeoTrioCharacterAsset"("versionGroupKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioIdea_ideaCode_key" ON "NeoTrioIdea"("ideaCode");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioIdea_marketingOpportunityId_key" ON "NeoTrioIdea"("marketingOpportunityId");

-- CreateIndex
CREATE INDEX "NeoTrioIdea_status_priority_createdAt_idx" ON "NeoTrioIdea"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "NeoTrioIdea_assignedUserId_status_idx" ON "NeoTrioIdea"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "NeoTrioIdea_campaignId_idx" ON "NeoTrioIdea"("campaignId");

-- CreateIndex
CREATE INDEX "NeoTrioIdea_destination_idx" ON "NeoTrioIdea"("destination");

-- CreateIndex
CREATE INDEX "NeoTrioIdeaCharacter_characterId_ideaId_idx" ON "NeoTrioIdeaCharacter"("characterId", "ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioSeries_seriesCode_key" ON "NeoTrioSeries"("seriesCode");

-- CreateIndex
CREATE INDEX "NeoTrioSeries_isActive_name_idx" ON "NeoTrioSeries"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioProduction_productionCode_key" ON "NeoTrioProduction"("productionCode");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioProduction_ideaId_key" ON "NeoTrioProduction"("ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioProduction_marketingContentId_key" ON "NeoTrioProduction"("marketingContentId");

-- CreateIndex
CREATE INDEX "NeoTrioProduction_stage_priority_createdAt_idx" ON "NeoTrioProduction"("stage", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "NeoTrioProduction_assignedUserId_stage_idx" ON "NeoTrioProduction"("assignedUserId", "stage");

-- CreateIndex
CREATE INDEX "NeoTrioProduction_deadline_idx" ON "NeoTrioProduction"("deadline");

-- CreateIndex
CREATE INDEX "NeoTrioProduction_plannedPublishAt_idx" ON "NeoTrioProduction"("plannedPublishAt");

-- CreateIndex
CREATE INDEX "NeoTrioProduction_campaignId_idx" ON "NeoTrioProduction"("campaignId");

-- CreateIndex
CREATE INDEX "NeoTrioProduction_dealId_idx" ON "NeoTrioProduction"("dealId");

-- CreateIndex
CREATE INDEX "NeoTrioProduction_seriesId_idx" ON "NeoTrioProduction"("seriesId");

-- CreateIndex
CREATE INDEX "NeoTrioProductionCharacter_characterId_productionId_idx" ON "NeoTrioProductionCharacter"("characterId", "productionId");

-- CreateIndex
CREATE INDEX "NeoTrioScript_createdById_idx" ON "NeoTrioScript"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioScript_productionId_versionNumber_key" ON "NeoTrioScript"("productionId", "versionNumber");

-- CreateIndex
CREATE INDEX "NeoTrioProductionAsset_productionId_assetType_idx" ON "NeoTrioProductionAsset"("productionId", "assetType");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioProductionAsset_versionGroupKey_version_key" ON "NeoTrioProductionAsset"("versionGroupKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioLibraryItem_productionId_key" ON "NeoTrioLibraryItem"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "NeoTrioLibraryItem_publicationId_key" ON "NeoTrioLibraryItem"("publicationId");

-- CreateIndex
CREATE INDEX "NeoTrioLibraryItem_publishedAt_idx" ON "NeoTrioLibraryItem"("publishedAt");

-- CreateIndex
CREATE INDEX "NeoTrioLibraryItem_libraryType_publishedAt_idx" ON "NeoTrioLibraryItem"("libraryType", "publishedAt");

-- CreateIndex
CREATE INDEX "NeoTrioLibraryItem_campaignId_idx" ON "NeoTrioLibraryItem"("campaignId");

-- CreateIndex
CREATE INDEX "NeoTrioLibraryItem_dealId_idx" ON "NeoTrioLibraryItem"("dealId");

-- AddForeignKey
ALTER TABLE "NeoTrioCharacter" ADD CONSTRAINT "NeoTrioCharacter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioCharacter" ADD CONSTRAINT "NeoTrioCharacter_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioCharacterAsset" ADD CONSTRAINT "NeoTrioCharacterAsset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "NeoTrioCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioCharacterAsset" ADD CONSTRAINT "NeoTrioCharacterAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioCharacterAsset" ADD CONSTRAINT "NeoTrioCharacterAsset_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioIdea" ADD CONSTRAINT "NeoTrioIdea_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioIdea" ADD CONSTRAINT "NeoTrioIdea_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioIdea" ADD CONSTRAINT "NeoTrioIdea_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioIdea" ADD CONSTRAINT "NeoTrioIdea_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioIdea" ADD CONSTRAINT "NeoTrioIdea_marketingOpportunityId_fkey" FOREIGN KEY ("marketingOpportunityId") REFERENCES "MarketingOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioIdeaCharacter" ADD CONSTRAINT "NeoTrioIdeaCharacter_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "NeoTrioIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioIdeaCharacter" ADD CONSTRAINT "NeoTrioIdeaCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "NeoTrioCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioSeries" ADD CONSTRAINT "NeoTrioSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "NeoTrioIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_marketingContentId_fkey" FOREIGN KEY ("marketingContentId") REFERENCES "MarketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "NeoTrioSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProduction" ADD CONSTRAINT "NeoTrioProduction_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProductionCharacter" ADD CONSTRAINT "NeoTrioProductionCharacter_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "NeoTrioProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProductionCharacter" ADD CONSTRAINT "NeoTrioProductionCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "NeoTrioCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioScript" ADD CONSTRAINT "NeoTrioScript_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "NeoTrioProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioScript" ADD CONSTRAINT "NeoTrioScript_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProductionAsset" ADD CONSTRAINT "NeoTrioProductionAsset_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "NeoTrioProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioProductionAsset" ADD CONSTRAINT "NeoTrioProductionAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioLibraryItem" ADD CONSTRAINT "NeoTrioLibraryItem_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "NeoTrioProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioLibraryItem" ADD CONSTRAINT "NeoTrioLibraryItem_marketingContentId_fkey" FOREIGN KEY ("marketingContentId") REFERENCES "MarketingContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioLibraryItem" ADD CONSTRAINT "NeoTrioLibraryItem_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "MarketingPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioLibraryItem" ADD CONSTRAINT "NeoTrioLibraryItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeoTrioLibraryItem" ADD CONSTRAINT "NeoTrioLibraryItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
