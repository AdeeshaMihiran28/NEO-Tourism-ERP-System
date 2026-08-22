-- CreateEnum
CREATE TYPE "SaleSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED_TO_ADMIN', 'ADMIN_ACCEPTED', 'ADMIN_REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'CASH', 'WISE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadActivityType" ADD VALUE 'SALE_MADE_STARTED';
ALTER TYPE "LeadActivityType" ADD VALUE 'SALE_SUBMISSION_UPDATED';
ALTER TYPE "LeadActivityType" ADD VALUE 'SALE_SUBMITTED_TO_ADMIN';
ALTER TYPE "LeadActivityType" ADD VALUE 'SALE_ACCEPTED_BY_ADMIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'NEW_SALE';
ALTER TYPE "NotificationType" ADD VALUE 'SALE_ACCEPTED';

-- CreateTable
CREATE TABLE "SaleSubmission" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "destination" TEXT,
    "travelStartDate" DATE,
    "travelEndDate" DATE,
    "sellingPrice" DECIMAL(12,2),
    "depositAmount" DECIMAL(12,2),
    "currency" TEXT,
    "paymentMethod" "PaymentMethod",
    "paymentReference" TEXT,
    "salesNotes" TEXT,
    "status" "SaleSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleSubmission_leadId_key" ON "SaleSubmission"("leadId");

-- CreateIndex
CREATE INDEX "SaleSubmission_customerId_idx" ON "SaleSubmission"("customerId");

-- CreateIndex
CREATE INDEX "SaleSubmission_submittedByUserId_status_updatedAt_idx" ON "SaleSubmission"("submittedByUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "SaleSubmission_status_submittedAt_idx" ON "SaleSubmission"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "SaleSubmission" ADD CONSTRAINT "SaleSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleSubmission" ADD CONSTRAINT "SaleSubmission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleSubmission" ADD CONSTRAINT "SaleSubmission_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
