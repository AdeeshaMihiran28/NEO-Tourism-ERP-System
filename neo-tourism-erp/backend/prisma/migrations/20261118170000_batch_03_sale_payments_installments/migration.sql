-- Additive pre-booking payment intake and installment schedule records.
CREATE TYPE "BookingPaymentType" AS ENUM ('FULL_PAYMENT', 'DEPOSIT', 'INTERNAL_DEPOSIT');
CREATE TYPE "SalePaymentMethod" AS ENUM ('BANK_TRANSFER', 'STRIPE_PAYMENT', 'WISE_CARD_PAYMENT', 'CASH');
CREATE TYPE "SalePaymentEntryStatus" AS ENUM ('RECORDED', 'VERIFIED');

ALTER TABLE "SaleSubmission"
  ADD COLUMN "paymentType" "BookingPaymentType",
  ADD COLUMN "initialPaymentAmount" DECIMAL(12,2),
  ADD COLUMN "finalBalancePaymentDate" DATE,
  ADD COLUMN "paymentArrangementNotes" TEXT;

CREATE TABLE "SalePaymentEntry" (
  "id" UUID NOT NULL,
  "saleSubmissionId" UUID NOT NULL,
  "method" "SalePaymentMethod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentDate" DATE NOT NULL,
  "transactionReference" TEXT,
  "notes" TEXT,
  "status" "SalePaymentEntryStatus" NOT NULL DEFAULT 'RECORDED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalePaymentEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalePaymentEvidence" (
  "id" UUID NOT NULL,
  "paymentEntryId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "uploadedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalePaymentEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleInstallment" (
  "id" UUID NOT NULL,
  "saleSubmissionId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "dueDate" DATE NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleInstallment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalePaymentEntry_saleSubmissionId_paymentDate_idx" ON "SalePaymentEntry"("saleSubmissionId", "paymentDate");
CREATE INDEX "SalePaymentEvidence_paymentEntryId_createdAt_idx" ON "SalePaymentEvidence"("paymentEntryId", "createdAt");
CREATE INDEX "SaleInstallment_saleSubmissionId_dueDate_idx" ON "SaleInstallment"("saleSubmissionId", "dueDate");

ALTER TABLE "SalePaymentEntry" ADD CONSTRAINT "SalePaymentEntry_saleSubmissionId_fkey"
  FOREIGN KEY ("saleSubmissionId") REFERENCES "SaleSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalePaymentEvidence" ADD CONSTRAINT "SalePaymentEvidence_paymentEntryId_fkey"
  FOREIGN KEY ("paymentEntryId") REFERENCES "SalePaymentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalePaymentEvidence" ADD CONSTRAINT "SalePaymentEvidence_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleInstallment" ADD CONSTRAINT "SaleInstallment_saleSubmissionId_fkey"
  FOREIGN KEY ("saleSubmissionId") REFERENCES "SaleSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
