-- Additive Payment Card product structure. This migration preserves every existing submission.
CREATE TYPE "SaleProductCategory" AS ENUM (
  'INTERNATIONAL_FLIGHT',
  'BUDGET_CARRIER',
  'HOTEL',
  'TRANSFER',
  'TOUR'
);

CREATE TYPE "SaleProductReferenceType" AS ENUM (
  'PNR',
  'SUPPLIER_BOOKING_REFERENCE',
  'AIRLINE_REFERENCE',
  'HOTEL_REFERENCE',
  'IV_REFERENCE',
  'AMADEUS_REFERENCE',
  'OTHER'
);

ALTER TABLE "SaleSubmission"
  ADD COLUMN "estimatedCostOfSale" DECIMAL(12,2),
  ADD COLUMN "passengerInformation" TEXT;

CREATE TABLE "SaleSubmissionProduct" (
  "id" UUID NOT NULL,
  "saleSubmissionId" UUID NOT NULL,
  "category" "SaleProductCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "supplierId" UUID,
  "estimatedSupplierCost" DECIMAL(12,2),
  "pnrText" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleSubmissionProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleProductReference" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "type" "SaleProductReferenceType" NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleProductReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleProductAttachment" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "uploadedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleProductAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleSubmissionProduct_saleSubmissionId_createdAt_idx" ON "SaleSubmissionProduct"("saleSubmissionId", "createdAt");
CREATE INDEX "SaleSubmissionProduct_supplierId_idx" ON "SaleSubmissionProduct"("supplierId");
CREATE INDEX "SaleProductReference_productId_idx" ON "SaleProductReference"("productId");
CREATE INDEX "SaleProductAttachment_productId_createdAt_idx" ON "SaleProductAttachment"("productId", "createdAt");

ALTER TABLE "SaleSubmissionProduct" ADD CONSTRAINT "SaleSubmissionProduct_saleSubmissionId_fkey"
  FOREIGN KEY ("saleSubmissionId") REFERENCES "SaleSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleSubmissionProduct" ADD CONSTRAINT "SaleSubmissionProduct_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleProductReference" ADD CONSTRAINT "SaleProductReference_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "SaleSubmissionProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleProductAttachment" ADD CONSTRAINT "SaleProductAttachment_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "SaleSubmissionProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleProductAttachment" ADD CONSTRAINT "SaleProductAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
