-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TRAVEL_COMPLETE';
ALTER TYPE "NotificationType" ADD VALUE 'FOLDER_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE 'FOLDER_REOPENED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "folderReopenReason" TEXT,
ADD COLUMN     "folderReopenedAt" TIMESTAMP(3),
ADD COLUMN     "folderReopenedById" UUID;

-- CreateIndex
CREATE INDEX "Booking_folderStatus_travelStatus_operationsStatus_accounts_idx" ON "Booking"("folderStatus", "travelStatus", "operationsStatus", "accountsStatus");

-- CreateIndex
CREATE INDEX "Booking_folderReopenedById_idx" ON "Booking"("folderReopenedById");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_folderReopenedById_fkey" FOREIGN KEY ("folderReopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
