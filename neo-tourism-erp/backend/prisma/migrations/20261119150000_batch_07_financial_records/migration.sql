-- Batch 07: additive financial-record extensions. No historical values are recalculated.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'STRIPE_PAYMENT';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'WISE_CARD_PAYMENT';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_EVIDENCE';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'VOUCHER';

CREATE TYPE "BookingVoucherEntryType" AS ENUM ('REVENUE', 'SURCHARGE', 'SUPPLIER_COST', 'OTHER');

ALTER TABLE "BookingFinance"
  ADD COLUMN "surcharge" DECIMAL(12,2),
  ADD COLUMN "initialProfit" DECIMAL(12,2),
  ADD COLUMN "balancedProfit" DECIMAL(12,2),
  ADD COLUMN "totalProfit" DECIMAL(12,2),
  ADD COLUMN "adminProfit" DECIMAL(12,2);

ALTER TABLE "PassengerPayment"
  ADD COLUMN "dueDate" DATE,
  ADD COLUMN "recordedGbpAmount" DECIMAL(14,2),
  ADD COLUMN "recordedGbpRate" DECIMAL(18,8),
  ADD COLUMN "transactionFee" DECIMAL(12,2),
  ADD COLUMN "feeCurrency" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "SupplierPayment"
  ADD COLUMN "dueDate" DATE,
  ADD COLUMN "recordedGbpAmount" DECIMAL(14,2),
  ADD COLUMN "recordedGbpRate" DECIMAL(18,8),
  ADD COLUMN "transactionFee" DECIMAL(12,2),
  ADD COLUMN "feeCurrency" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "PassengerPayment_bookingId_idempotencyKey_key"
  ON "PassengerPayment"("bookingId", "idempotencyKey");
CREATE UNIQUE INDEX "SupplierPayment_bookingId_idempotencyKey_key"
  ON "SupplierPayment"("bookingId", "idempotencyKey");

CREATE TABLE "SupplierPaymentFunding" (
  "id" UUID NOT NULL,
  "supplierPaymentId" UUID NOT NULL,
  "sourceAmount" DECIMAL(14,2) NOT NULL,
  "sourceCurrency" TEXT NOT NULL,
  "feeAmount" DECIMAL(14,2),
  "feeCurrency" TEXT,
  "recordedConversionRate" DECIMAL(18,8),
  "convertedAmount" DECIMAL(14,2),
  "convertedCurrency" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPaymentFunding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPaymentFunding_supplierPaymentId_idx"
  ON "SupplierPaymentFunding"("supplierPaymentId");

ALTER TABLE "SupplierPaymentFunding"
  ADD CONSTRAINT "SupplierPaymentFunding_supplierPaymentId_fkey"
  FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BookingVoucher" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "voucherReference" TEXT NOT NULL,
  "voucherNumber" TEXT,
  "transactionDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "notes" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingVoucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingVoucher_bookingId_voucherReference_key"
  ON "BookingVoucher"("bookingId", "voucherReference");
CREATE INDEX "BookingVoucher_bookingId_transactionDate_idx"
  ON "BookingVoucher"("bookingId", "transactionDate");

ALTER TABLE "BookingVoucher"
  ADD CONSTRAINT "BookingVoucher_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingVoucher_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BookingVoucherEntry" (
  "id" UUID NOT NULL,
  "voucherId" UUID NOT NULL,
  "entryType" "BookingVoucherEntryType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "bookingSupplierId" UUID,
  "passengerPaymentId" UUID,
  "supplierPaymentId" UUID,
  "paymentReference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingVoucherEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingVoucherEntry_voucherId_idx" ON "BookingVoucherEntry"("voucherId");
CREATE INDEX "BookingVoucherEntry_bookingSupplierId_idx" ON "BookingVoucherEntry"("bookingSupplierId");
CREATE INDEX "BookingVoucherEntry_passengerPaymentId_idx" ON "BookingVoucherEntry"("passengerPaymentId");
CREATE INDEX "BookingVoucherEntry_supplierPaymentId_idx" ON "BookingVoucherEntry"("supplierPaymentId");

ALTER TABLE "BookingVoucherEntry"
  ADD CONSTRAINT "BookingVoucherEntry_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "BookingVoucher"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingDocument"
  ADD COLUMN "passengerPaymentId" UUID,
  ADD COLUMN "supplierPaymentId" UUID,
  ADD COLUMN "voucherId" UUID;

CREATE INDEX "BookingDocument_passengerPaymentId_idx" ON "BookingDocument"("passengerPaymentId");
CREATE INDEX "BookingDocument_supplierPaymentId_idx" ON "BookingDocument"("supplierPaymentId");
CREATE INDEX "BookingDocument_voucherId_idx" ON "BookingDocument"("voucherId");

ALTER TABLE "BookingDocument"
  ADD CONSTRAINT "BookingDocument_passengerPaymentId_fkey"
  FOREIGN KEY ("passengerPaymentId") REFERENCES "PassengerPayment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingDocument_supplierPaymentId_fkey"
  FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingDocument_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "BookingVoucher"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
