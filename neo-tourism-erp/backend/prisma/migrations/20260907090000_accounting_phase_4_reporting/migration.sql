CREATE TYPE "TaxClassification" AS ENUM ('OUTPUT', 'INPUT', 'NONE');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'LOCKED');

ALTER TYPE "AccountingMappingType" ADD VALUE 'FX_GAIN';
ALTER TYPE "AccountingMappingType" ADD VALUE 'FX_LOSS';

ALTER TABLE "BankTransaction" ADD COLUMN "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
ALTER TABLE "CustomerAdvance" ADD COLUMN "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
ALTER TABLE "CustomerInvoice" ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "baseTotalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxCodeId" UUID;
ALTER TABLE "JournalEntry" ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
ALTER TABLE "JournalLine" ADD COLUMN "baseCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "baseDebit" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "PassengerPayment" ADD COLUMN "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
ALTER TABLE "SupplierAdvance" ADD COLUMN "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
ALTER TABLE "SupplierInvoice" ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "baseTotalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxCodeId" UUID;
ALTER TABLE "SupplierPayment" ADD COLUMN "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;

CREATE TABLE "AccountingSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
  "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
  "updatedById" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExchangeRate" (
  "id" UUID NOT NULL,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency" TEXT NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID NOT NULL,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxCode" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DECIMAL(7,4) NOT NULL,
  "taxType" TEXT NOT NULL,
  "classification" "TaxClassification" NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "isRecoverable" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "glAccountId" UUID,
  "createdById" UUID NOT NULL,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPeriod" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closeNotes" TEXT,
  "validationResult" JSONB,
  "createdById" UUID,
  "closedById" UUID,
  "closedAt" TIMESTAMP(3),
  "reopenedById" UUID,
  "reopenedAt" TIMESTAMP(3),
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExchangeRate_fromCurrency_toCurrency_isActive_effectiveDate_idx" ON "ExchangeRate"("fromCurrency", "toCurrency", "isActive", "effectiveDate");
CREATE UNIQUE INDEX "ExchangeRate_fromCurrency_toCurrency_effectiveDate_key" ON "ExchangeRate"("fromCurrency", "toCurrency", "effectiveDate");
CREATE UNIQUE INDEX "TaxCode_code_key" ON "TaxCode"("code");
CREATE INDEX "TaxCode_classification_isActive_effectiveFrom_idx" ON "TaxCode"("classification", "isActive", "effectiveFrom");
CREATE INDEX "TaxCode_glAccountId_idx" ON "TaxCode"("glAccountId");
CREATE UNIQUE INDEX "AccountingPeriod_name_key" ON "AccountingPeriod"("name");
CREATE INDEX "AccountingPeriod_startDate_endDate_status_idx" ON "AccountingPeriod"("startDate", "endDate", "status");
CREATE INDEX "AccountingPeriod_fiscalYear_status_idx" ON "AccountingPeriod"("fiscalYear", "status");
CREATE INDEX "CustomerInvoice_taxCodeId_idx" ON "CustomerInvoice"("taxCodeId");
CREATE INDEX "SupplierInvoice_taxCodeId_idx" ON "SupplierInvoice"("taxCodeId");

ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingSetting" ADD CONSTRAINT "AccountingSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AccountingSetting" ("id", "baseCurrency", "fiscalYearStartMonth", "updatedAt")
VALUES ('default', 'LKR', 1, CURRENT_TIMESTAMP);

INSERT INTO "AccountingPeriod" ("id", "name", "startDate", "endDate", "fiscalYear", "status", "updatedAt")
VALUES ('40000000-0000-4000-8000-000000000026', 'FY2026 System Open', DATE '2026-01-01', DATE '2026-12-31', 2026, 'OPEN', CURRENT_TIMESTAMP);

UPDATE "PassengerPayment" SET "baseCurrency" = "currency", "baseAmount" = "amount";
UPDATE "SupplierPayment" SET "baseCurrency" = "currency", "baseAmount" = "amount";
UPDATE "CustomerAdvance" SET "baseCurrency" = "currency", "baseAmount" = "amount";
UPDATE "SupplierAdvance" SET "baseCurrency" = "currency", "baseAmount" = "amount";
UPDATE "BankTransaction" SET "baseCurrency" = "currency", "baseAmount" = "amount";
UPDATE "CustomerInvoice" SET "baseCurrency" = "currency", "netAmount" = "totalAmount", "baseTotalAmount" = "totalAmount";
UPDATE "SupplierInvoice" SET "baseCurrency" = "currency", "netAmount" = "totalAmount", "baseTotalAmount" = "totalAmount";
UPDATE "JournalEntry" SET "baseCurrency" = "currency";
UPDATE "JournalLine" SET "baseDebit" = "debit", "baseCredit" = "credit";
