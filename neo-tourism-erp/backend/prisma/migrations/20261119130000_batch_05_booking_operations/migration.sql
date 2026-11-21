-- Add operational product traceability and passenger notes without changing submitted Sales records.
ALTER TYPE "BookingReferenceType" ADD VALUE IF NOT EXISTS 'IV_REFERENCE';
ALTER TYPE "BookingReferenceType" ADD VALUE IF NOT EXISTS 'AMADEUS_REFERENCE';

ALTER TABLE "Passenger" ADD COLUMN "operationalNotes" TEXT;

ALTER TABLE "BookingSupplier"
  ADD COLUMN "sourceSaleProductId" UUID,
  ADD COLUMN "category" "SaleProductCategory",
  ADD COLUMN "description" TEXT,
  ADD COLUMN "serviceStartDate" DATE,
  ADD COLUMN "serviceEndDate" DATE,
  ADD COLUMN "estimatedSupplierCost" DECIMAL(12,2);

ALTER TABLE "BookingReference" ADD COLUMN "bookingSupplierId" UUID;

CREATE UNIQUE INDEX "BookingSupplier_sourceSaleProductId_key" ON "BookingSupplier"("sourceSaleProductId");
CREATE INDEX "BookingReference_bookingSupplierId_idx" ON "BookingReference"("bookingSupplierId");

ALTER TABLE "BookingSupplier" ADD CONSTRAINT "BookingSupplier_sourceSaleProductId_fkey"
  FOREIGN KEY ("sourceSaleProductId") REFERENCES "SaleSubmissionProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingReference" ADD CONSTRAINT "BookingReference_bookingSupplierId_fkey"
  FOREIGN KEY ("bookingSupplierId") REFERENCES "BookingSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
