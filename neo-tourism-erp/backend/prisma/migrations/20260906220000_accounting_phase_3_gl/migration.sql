CREATE TYPE "GlAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "AccountingMappingType" AS ENUM ('BANK_CONTROL', 'ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'CUSTOMER_ADVANCES', 'SUPPLIER_ADVANCES', 'SALES_REVENUE', 'DIRECT_BOOKING_COST', 'BANK_CHARGES', 'BANK_ADJUSTMENTS', 'PAYMENT_CLEARING');
CREATE TYPE "JournalSourceType" AS ENUM ('MANUAL', 'CUSTOMER_INVOICE', 'CUSTOMER_RECEIPT', 'CUSTOMER_ADVANCE', 'CUSTOMER_ADVANCE_ALLOCATION', 'SUPPLIER_INVOICE', 'SUPPLIER_PAYMENT', 'SUPPLIER_ADVANCE', 'SUPPLIER_ADVANCE_ALLOCATION', 'BANK_CHARGE', 'BANK_ADJUSTMENT', 'REVERSAL');
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED', 'REVERSED', 'REJECTED');

ALTER TABLE "CompanyBankAccount" ADD COLUMN "glAccountId" UUID;
ALTER TABLE "CustomerAdvance" ADD COLUMN "companyBankAccountId" UUID;
ALTER TABLE "SupplierAdvance" ADD COLUMN "companyBankAccountId" UUID;

CREATE TABLE "GlAccount" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "GlAccountType" NOT NULL,
  "parentId" UUID,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingMapping" (
  "type" "AccountingMappingType" NOT NULL,
  "accountId" UUID NOT NULL,
  "updatedById" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingMapping_pkey" PRIMARY KEY ("type")
);

CREATE TABLE "JournalEntry" (
  "id" UUID NOT NULL,
  "journalNumber" TEXT NOT NULL,
  "journalDate" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "sourceType" "JournalSourceType" NOT NULL,
  "sourceRecordId" UUID,
  "bookingId" UUID,
  "currency" TEXT NOT NULL,
  "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" UUID NOT NULL,
  "approvedById" UUID,
  "approvedAt" TIMESTAMP(3),
  "postedById" UUID,
  "postedAt" TIMESTAMP(3),
  "reversedById" UUID,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "reversalOfId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalLine" (
  "id" UUID NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "bookingId" UUID,
  "customerId" UUID,
  "supplierId" UUID,
  "companyBankAccountId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalLine_valid_amounts" CHECK (
    "debit" >= 0 AND "credit" >= 0 AND
    (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
  )
);

CREATE UNIQUE INDEX "GlAccount_code_key" ON "GlAccount"("code");
CREATE INDEX "GlAccount_type_isActive_idx" ON "GlAccount"("type", "isActive");
CREATE INDEX "GlAccount_parentId_idx" ON "GlAccount"("parentId");
CREATE INDEX "AccountingMapping_accountId_idx" ON "AccountingMapping"("accountId");
CREATE UNIQUE INDEX "JournalEntry_journalNumber_key" ON "JournalEntry"("journalNumber");
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceRecordId_key" ON "JournalEntry"("sourceType", "sourceRecordId");
CREATE INDEX "JournalEntry_journalDate_status_idx" ON "JournalEntry"("journalDate", "status");
CREATE INDEX "JournalEntry_bookingId_idx" ON "JournalEntry"("bookingId");
CREATE INDEX "JournalEntry_sourceType_sourceRecordId_idx" ON "JournalEntry"("sourceType", "sourceRecordId");
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX "JournalLine_accountId_journalEntryId_idx" ON "JournalLine"("accountId", "journalEntryId");
CREATE INDEX "JournalLine_bookingId_idx" ON "JournalLine"("bookingId");
CREATE INDEX "JournalLine_customerId_idx" ON "JournalLine"("customerId");
CREATE INDEX "JournalLine_supplierId_idx" ON "JournalLine"("supplierId");
CREATE INDEX "JournalLine_companyBankAccountId_idx" ON "JournalLine"("companyBankAccountId");
CREATE INDEX "CompanyBankAccount_glAccountId_idx" ON "CompanyBankAccount"("glAccountId");
CREATE INDEX "CustomerAdvance_companyBankAccountId_idx" ON "CustomerAdvance"("companyBankAccountId");
CREATE INDEX "SupplierAdvance_companyBankAccountId_idx" ON "SupplierAdvance"("companyBankAccountId");

ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GlAccount" ADD CONSTRAINT "GlAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GlAccount" ADD CONSTRAINT "GlAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GlAccount" ADD CONSTRAINT "GlAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "GlAccount" ("id", "code", "name", "type", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000001', '1000', 'Assets', 'ASSET', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', '1100', 'Cash and Bank', 'ASSET', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', '1190', 'Payment Clearing', 'ASSET', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', '1200', 'Accounts Receivable', 'ASSET', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000005', '1300', 'Supplier Advances', 'ASSET', CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000001', '2000', 'Liabilities', 'LIABILITY', CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000002', '2100', 'Accounts Payable', 'LIABILITY', CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000003', '2200', 'Customer Advances', 'LIABILITY', CURRENT_TIMESTAMP),
  ('30000000-0000-4000-8000-000000000001', '3000', 'Equity', 'EQUITY', CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000001', '4000', 'Booking Revenue', 'REVENUE', CURRENT_TIMESTAMP),
  ('50000000-0000-4000-8000-000000000001', '5000', 'Direct Booking Costs', 'EXPENSE', CURRENT_TIMESTAMP),
  ('50000000-0000-4000-8000-000000000002', '5100', 'Bank Charges', 'EXPENSE', CURRENT_TIMESTAMP),
  ('50000000-0000-4000-8000-000000000003', '5200', 'Bank Adjustments', 'EXPENSE', CURRENT_TIMESTAMP);

UPDATE "GlAccount" SET "parentId" = '10000000-0000-4000-8000-000000000001' WHERE "code" IN ('1100', '1190', '1200', '1300');
UPDATE "GlAccount" SET "parentId" = '20000000-0000-4000-8000-000000000001' WHERE "code" IN ('2100', '2200');

INSERT INTO "AccountingMapping" ("type", "accountId", "updatedAt") VALUES
  ('BANK_CONTROL', '10000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP),
  ('ACCOUNTS_RECEIVABLE', '10000000-0000-4000-8000-000000000004', CURRENT_TIMESTAMP),
  ('ACCOUNTS_PAYABLE', '20000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP),
  ('CUSTOMER_ADVANCES', '20000000-0000-4000-8000-000000000003', CURRENT_TIMESTAMP),
  ('SUPPLIER_ADVANCES', '10000000-0000-4000-8000-000000000005', CURRENT_TIMESTAMP),
  ('SALES_REVENUE', '40000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP),
  ('DIRECT_BOOKING_COST', '50000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP),
  ('BANK_CHARGES', '50000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP),
  ('BANK_ADJUSTMENTS', '50000000-0000-4000-8000-000000000003', CURRENT_TIMESTAMP),
  ('PAYMENT_CLEARING', '10000000-0000-4000-8000-000000000003', CURRENT_TIMESTAMP);

UPDATE "CompanyBankAccount" SET "glAccountId" = '10000000-0000-4000-8000-000000000002' WHERE "glAccountId" IS NULL;
