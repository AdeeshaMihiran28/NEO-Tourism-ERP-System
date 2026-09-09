CREATE TYPE "BankAccountType" AS ENUM ('CURRENT', 'SAVINGS', 'OTHER');
CREATE TYPE "BankTransactionDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "BankTransactionSource" AS ENUM ('CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'SUPPLIER_REFUND', 'BANK_TRANSFER', 'BANK_CHARGE', 'INTEREST', 'MANUAL_ADJUSTMENT');
CREATE TYPE "BankTransactionStatus" AS ENUM ('PENDING', 'POSTED', 'CANCELLED', 'REVERSED');
CREATE TYPE "BankStatementStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ACTION_REQUIRED', 'RECONCILED');
CREATE TYPE "BankMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'RECONCILED');

CREATE TABLE "CompanyBankAccount" (
  "id" UUID NOT NULL, "bankName" TEXT NOT NULL, "accountName" TEXT NOT NULL,
  "maskedAccountNumber" TEXT NOT NULL, "currency" TEXT NOT NULL, "branch" TEXT,
  "accountType" "BankAccountType" NOT NULL DEFAULT 'CURRENT',
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID NOT NULL, "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankTransaction" (
  "id" UUID NOT NULL, "companyBankAccountId" UUID NOT NULL, "transactionDate" DATE NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL, "currency" TEXT NOT NULL,
  "direction" "BankTransactionDirection" NOT NULL, "reference" TEXT, "description" TEXT NOT NULL,
  "sourceType" "BankTransactionSource" NOT NULL, "passengerPaymentId" UUID,
  "supplierPaymentId" UUID, "transferId" UUID, "bookingId" UUID, "customerId" UUID,
  "supplierId" UUID, "status" "BankTransactionStatus" NOT NULL DEFAULT 'POSTED',
  "reconciliationState" "BankMatchStatus" NOT NULL DEFAULT 'UNMATCHED', "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankStatement" (
  "id" UUID NOT NULL, "companyBankAccountId" UUID NOT NULL, "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL, "openingBalance" DECIMAL(14,2) NOT NULL,
  "closingBalance" DECIMAL(14,2) NOT NULL, "status" "BankStatementStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" UUID NOT NULL, "finalizedById" UUID, "finalizedAt" TIMESTAMP(3),
  "reopenedById" UUID, "reopenedAt" TIMESTAMP(3), "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankStatementTransaction" (
  "id" UUID NOT NULL, "statementId" UUID NOT NULL, "transactionDate" DATE NOT NULL,
  "valueDate" DATE, "description" TEXT NOT NULL, "reference" TEXT,
  "amount" DECIMAL(14,2) NOT NULL, "direction" "BankTransactionDirection" NOT NULL,
  "balance" DECIMAL(14,2), "fingerprint" TEXT NOT NULL,
  "matchingStatus" "BankMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatementTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankReconciliationMatch" (
  "id" UUID NOT NULL, "erpBankTransactionId" UUID NOT NULL,
  "statementTransactionId" UUID NOT NULL, "matchedById" UUID NOT NULL,
  "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unmatchedById" UUID, "unmatchedAt" TIMESTAMP(3), "unmatchReason" TEXT,
  CONSTRAINT "BankReconciliationMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyBankAccount_currency_isActive_idx" ON "CompanyBankAccount"("currency", "isActive");
CREATE INDEX "CompanyBankAccount_bankName_idx" ON "CompanyBankAccount"("bankName");
CREATE UNIQUE INDEX "BankTransaction_passengerPaymentId_key" ON "BankTransaction"("passengerPaymentId");
CREATE UNIQUE INDEX "BankTransaction_supplierPaymentId_key" ON "BankTransaction"("supplierPaymentId");
CREATE INDEX "BankTransaction_companyBankAccountId_transactionDate_status_idx" ON "BankTransaction"("companyBankAccountId", "transactionDate", "status");
CREATE INDEX "BankTransaction_bookingId_idx" ON "BankTransaction"("bookingId");
CREATE INDEX "BankTransaction_customerId_idx" ON "BankTransaction"("customerId");
CREATE INDEX "BankTransaction_supplierId_idx" ON "BankTransaction"("supplierId");
CREATE INDEX "BankTransaction_transferId_idx" ON "BankTransaction"("transferId");
CREATE INDEX "BankStatement_companyBankAccountId_status_idx" ON "BankStatement"("companyBankAccountId", "status");
CREATE UNIQUE INDEX "BankStatement_companyBankAccountId_periodStart_periodEnd_key" ON "BankStatement"("companyBankAccountId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "BankStatementTransaction_fingerprint_key" ON "BankStatementTransaction"("fingerprint");
CREATE INDEX "BankStatementTransaction_statementId_matchingStatus_transac_idx" ON "BankStatementTransaction"("statementId", "matchingStatus", "transactionDate");
CREATE INDEX "BankReconciliationMatch_erpBankTransactionId_matchedAt_idx" ON "BankReconciliationMatch"("erpBankTransactionId", "matchedAt");
CREATE INDEX "BankReconciliationMatch_statementTransactionId_matchedAt_idx" ON "BankReconciliationMatch"("statementTransactionId", "matchedAt");
CREATE UNIQUE INDEX "BankReconciliationMatch_one_active_erp" ON "BankReconciliationMatch"("erpBankTransactionId") WHERE ("unmatchedAt" IS NULL);
CREATE UNIQUE INDEX "BankReconciliationMatch_one_active_statement" ON "BankReconciliationMatch"("statementTransactionId") WHERE ("unmatchedAt" IS NULL);

ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_passengerPaymentId_fkey" FOREIGN KEY ("passengerPaymentId") REFERENCES "PassengerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankStatementTransaction" ADD CONSTRAINT "BankStatementTransaction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_erpBankTransactionId_fkey" FOREIGN KEY ("erpBankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_statementTransactionId_fkey" FOREIGN KEY ("statementTransactionId") REFERENCES "BankStatementTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_unmatchedById_fkey" FOREIGN KEY ("unmatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
