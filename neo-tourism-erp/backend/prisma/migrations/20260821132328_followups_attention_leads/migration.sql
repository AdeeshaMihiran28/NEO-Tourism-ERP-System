-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('CALLBACK', 'GENERAL_FOLLOW_UP', 'EMAIL_FOLLOW_UP', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttentionReason" AS ENUM ('NO_ACTIVITY_3_DAYS', 'MISSED_CALLBACK', 'NO_FUTURE_ACTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_CREATED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_UPDATED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_COMPLETED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_CANCELLED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_MISSED';
ALTER TYPE "LeadActivityType" ADD VALUE 'ATTENTION_FLAGGED';
ALTER TYPE "LeadActivityType" ADD VALUE 'ATTENTION_CLEARED';
ALTER TYPE "LeadActivityType" ADD VALUE 'LEAD_REASSIGNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CALLBACK_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'MISSED_CALLBACK';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENTION_LEAD';
ALTER TYPE "NotificationType" ADD VALUE 'LEAD_REASSIGNED';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "attentionReason" "AttentionReason",
ADD COLUMN     "attentionSince" TIMESTAMP(3),
ADD COLUMN     "isAttentionRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "assignedUserId" UUID NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "createdById" UUID NOT NULL,
    "dueNotificationSentAt" TIMESTAMP(3),
    "missedNotificationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUp_leadId_status_scheduledAt_idx" ON "FollowUp"("leadId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "FollowUp_assignedUserId_status_scheduledAt_idx" ON "FollowUp"("assignedUserId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "FollowUp_status_scheduledAt_idx" ON "FollowUp"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Lead_isAttentionRequired_assignedUserId_idx" ON "Lead"("isAttentionRequired", "assignedUserId");

-- CreateIndex
CREATE INDEX "Lead_status_isAttentionRequired_idx" ON "Lead"("status", "isAttentionRequired");

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
