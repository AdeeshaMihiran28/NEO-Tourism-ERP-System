-- Additive manual Deposit Gate review records. Existing Marketing offers remain unchanged.
CREATE TYPE "DepositRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE "DepositRequest" (
  "id" UUID NOT NULL,
  "saleSubmissionId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "leadId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "destination" TEXT NOT NULL,
  "departureDate" DATE NOT NULL,
  "arrivalDate" DATE,
  "passengerCount" INTEGER NOT NULL,
  "cancellationCost" DECIMAL(12,2) NOT NULL,
  "netFare" DECIMAL(12,2) NOT NULL,
  "sellingFare" DECIMAL(12,2) NOT NULL,
  "initialPaymentAmount" DECIMAL(12,2) NOT NULL,
  "balancePaymentDate" DATE NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
  "arrangementNotes" TEXT,
  "status" "DepositRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "decidedByUserId" UUID,
  "decidedAt" TIMESTAMP(3),
  "decisionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepositRequest_saleSubmissionId_key" ON "DepositRequest"("saleSubmissionId");
CREATE INDEX "DepositRequest_requestedByUserId_status_createdAt_idx" ON "DepositRequest"("requestedByUserId", "status", "createdAt");
CREATE INDEX "DepositRequest_status_createdAt_idx" ON "DepositRequest"("status", "createdAt");
CREATE INDEX "DepositRequest_customerId_idx" ON "DepositRequest"("customerId");
CREATE INDEX "DepositRequest_leadId_idx" ON "DepositRequest"("leadId");

ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_saleSubmissionId_fkey"
  FOREIGN KEY ("saleSubmissionId") REFERENCES "SaleSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
