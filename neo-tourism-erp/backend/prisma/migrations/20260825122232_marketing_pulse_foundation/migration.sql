-- CreateEnum
CREATE TYPE "MarketingSalesSignalType" AS ENUM ('CUSTOMER_QUESTION', 'CONTENT_REQUEST', 'OFFER_REQUEST', 'DESTINATION_INTEREST', 'RECURRING_OBJECTION', 'MARKETING_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingSalesSignalStatus" AS ENUM ('NEW', 'REVIEWED', 'ACTIONED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MARKETING_SALES_SIGNAL';

-- CreateTable
CREATE TABLE "MarketingSalesSignal" (
    "id" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "leadId" UUID,
    "customerId" UUID,
    "destination" TEXT,
    "signalType" "MarketingSalesSignalType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "MarketingPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MarketingSalesSignalStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSalesSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingSalesSignal_status_priority_createdAt_idx" ON "MarketingSalesSignal"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingSalesSignal_destination_createdAt_idx" ON "MarketingSalesSignal"("destination", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingSalesSignal_createdByUserId_createdAt_idx" ON "MarketingSalesSignal"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingSalesSignal_leadId_idx" ON "MarketingSalesSignal"("leadId");

-- CreateIndex
CREATE INDEX "MarketingSalesSignal_customerId_idx" ON "MarketingSalesSignal"("customerId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_destination_idx" ON "Lead"("createdAt", "destination");

-- AddForeignKey
ALTER TABLE "MarketingSalesSignal" ADD CONSTRAINT "MarketingSalesSignal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSalesSignal" ADD CONSTRAINT "MarketingSalesSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSalesSignal" ADD CONSTRAINT "MarketingSalesSignal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
