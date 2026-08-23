-- CreateEnum
CREATE TYPE "PassengerPaymentStatus" AS ENUM ('PENDING', 'RECEIVED', 'VERIFIED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SupplierPaymentStatus" AS ENUM ('PENDING', 'PAID', 'VERIFIED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingAdjustmentType" AS ENUM ('FEE', 'DISCOUNT', 'REFUND', 'MANUAL_ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'RECONCILED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('PASSENGER_PAYMENT_MISMATCH', 'SUPPLIER_COST_MISMATCH', 'SUPPLIER_PAYMENT_MISMATCH', 'SELLING_PRICE_MISMATCH', 'MISSING_PAYMENT', 'UNEXPLAINED_AMOUNT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RECONCILIATION_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'RECONCILIATION_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'RECONCILIATION_DISCREPANCY';
ALTER TYPE "NotificationType" ADD VALUE 'DISCREPANCY_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'DISCREPANCY_RESOLVED';

-- CreateTable
CREATE TABLE "BookingFinance" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "supplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedRevenue" DECIMAL(12,2) NOT NULL,
    "expectedProfit" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingFinance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassengerPayment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentReference" TEXT,
    "paymentDate" DATE NOT NULL,
    "status" "PassengerPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "recordedById" UUID NOT NULL,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassengerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "bookingSupplierId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentReference" TEXT,
    "paymentDate" DATE NOT NULL,
    "status" "SupplierPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "recordedById" UUID NOT NULL,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAdjustment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" "BookingAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "passengerPaymentsVerified" BOOLEAN NOT NULL DEFAULT false,
    "supplierCostsVerified" BOOLEAN NOT NULL DEFAULT false,
    "supplierPaymentsVerified" BOOLEAN NOT NULL DEFAULT false,
    "sellingPriceVerified" BOOLEAN NOT NULL DEFAULT false,
    "feesVerified" BOOLEAN NOT NULL DEFAULT false,
    "adjustmentsVerified" BOOLEAN NOT NULL DEFAULT false,
    "profitVerified" BOOLEAN NOT NULL DEFAULT false,
    "reconciledById" UUID,
    "reconciledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationDiscrepancy" (
    "id" UUID NOT NULL,
    "reconciliationId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" "DiscrepancyType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountDifference" DECIMAL(12,2),
    "currency" TEXT,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "assignedUserId" UUID,
    "createdById" UUID NOT NULL,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingFinance_bookingId_key" ON "BookingFinance"("bookingId");

-- CreateIndex
CREATE INDEX "PassengerPayment_bookingId_status_paymentDate_idx" ON "PassengerPayment"("bookingId", "status", "paymentDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_bookingId_status_paymentDate_idx" ON "SupplierPayment"("bookingId", "status", "paymentDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_bookingSupplierId_idx" ON "SupplierPayment"("bookingSupplierId");

-- CreateIndex
CREATE INDEX "BookingAdjustment_bookingId_type_createdAt_idx" ON "BookingAdjustment"("bookingId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_bookingId_key" ON "Reconciliation"("bookingId");

-- CreateIndex
CREATE INDEX "ReconciliationDiscrepancy_bookingId_status_createdAt_idx" ON "ReconciliationDiscrepancy"("bookingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReconciliationDiscrepancy_reconciliationId_status_idx" ON "ReconciliationDiscrepancy"("reconciliationId", "status");

-- CreateIndex
CREATE INDEX "ReconciliationDiscrepancy_assignedUserId_status_idx" ON "ReconciliationDiscrepancy"("assignedUserId", "status");

-- AddForeignKey
ALTER TABLE "BookingFinance" ADD CONSTRAINT "BookingFinance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerPayment" ADD CONSTRAINT "PassengerPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerPayment" ADD CONSTRAINT "PassengerPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerPayment" ADD CONSTRAINT "PassengerPayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_bookingSupplierId_fkey" FOREIGN KEY ("bookingSupplierId") REFERENCES "BookingSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAdjustment" ADD CONSTRAINT "BookingAdjustment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAdjustment" ADD CONSTRAINT "BookingAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAdjustment" ADD CONSTRAINT "BookingAdjustment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationDiscrepancy" ADD CONSTRAINT "ReconciliationDiscrepancy_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationDiscrepancy" ADD CONSTRAINT "ReconciliationDiscrepancy_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationDiscrepancy" ADD CONSTRAINT "ReconciliationDiscrepancy_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationDiscrepancy" ADD CONSTRAINT "ReconciliationDiscrepancy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationDiscrepancy" ADD CONSTRAINT "ReconciliationDiscrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
