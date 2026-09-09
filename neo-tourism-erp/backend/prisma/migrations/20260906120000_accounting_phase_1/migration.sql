CREATE TYPE "CustomerInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

ALTER TABLE "PassengerPayment" ADD COLUMN "customerInvoiceId" UUID;
ALTER TABLE "SupplierPayment" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'OTHER', ADD COLUMN "supplierInvoiceId" UUID;

CREATE TABLE "CustomerInvoice" (
  "id" UUID NOT NULL, "bookingId" UUID NOT NULL, "customerId" UUID NOT NULL,
  "invoiceNumber" TEXT NOT NULL, "invoiceDate" DATE NOT NULL, "dueDate" DATE,
  "currency" TEXT NOT NULL, "totalAmount" DECIMAL(12,2) NOT NULL,
  "status" "CustomerInvoiceStatus" NOT NULL DEFAULT 'DRAFT', "documentId" UUID,
  "createdById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CustomerInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierInvoice" (
  "id" UUID NOT NULL, "bookingId" UUID NOT NULL, "bookingSupplierId" UUID NOT NULL,
  "supplierId" UUID NOT NULL, "invoiceNumber" TEXT NOT NULL, "invoiceDate" DATE NOT NULL,
  "dueDate" DATE, "currency" TEXT NOT NULL, "totalAmount" DECIMAL(12,2) NOT NULL,
  "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT', "documentId" UUID,
  "createdById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerAdvance" (
  "id" UUID NOT NULL, "customerId" UUID NOT NULL, "bookingId" UUID,
  "amount" DECIMAL(12,2) NOT NULL, "currency" TEXT NOT NULL, "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentReference" TEXT, "paymentDate" DATE NOT NULL, "notes" TEXT, "cancelledAt" TIMESTAMP(3),
  "recordedById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CustomerAdvance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerAdvanceAllocation" (
  "id" UUID NOT NULL, "advanceId" UUID NOT NULL, "invoiceId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "allocatedById" UUID NOT NULL,
  "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reversedById" UUID,
  "reversedAt" TIMESTAMP(3), "reversalReason" TEXT,
  CONSTRAINT "CustomerAdvanceAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierAdvance" (
  "id" UUID NOT NULL, "supplierId" UUID NOT NULL, "bookingId" UUID,
  "amount" DECIMAL(12,2) NOT NULL, "currency" TEXT NOT NULL, "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentReference" TEXT, "paymentDate" DATE NOT NULL, "notes" TEXT, "cancelledAt" TIMESTAMP(3),
  "recordedById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SupplierAdvance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierAdvanceAllocation" (
  "id" UUID NOT NULL, "advanceId" UUID NOT NULL, "invoiceId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "allocatedById" UUID NOT NULL,
  "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reversedById" UUID,
  "reversedAt" TIMESTAMP(3), "reversalReason" TEXT,
  CONSTRAINT "SupplierAdvanceAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerInvoice_invoiceNumber_key" ON "CustomerInvoice"("invoiceNumber");
CREATE INDEX "CustomerInvoice_bookingId_status_idx" ON "CustomerInvoice"("bookingId", "status");
CREATE INDEX "CustomerInvoice_customerId_status_dueDate_idx" ON "CustomerInvoice"("customerId", "status", "dueDate");
CREATE INDEX "CustomerInvoice_documentId_idx" ON "CustomerInvoice"("documentId");
CREATE INDEX "SupplierInvoice_bookingId_status_idx" ON "SupplierInvoice"("bookingId", "status");
CREATE INDEX "SupplierInvoice_supplierId_status_dueDate_idx" ON "SupplierInvoice"("supplierId", "status", "dueDate");
CREATE INDEX "SupplierInvoice_bookingSupplierId_idx" ON "SupplierInvoice"("bookingSupplierId");
CREATE INDEX "SupplierInvoice_documentId_idx" ON "SupplierInvoice"("documentId");
CREATE UNIQUE INDEX "SupplierInvoice_supplierId_invoiceNumber_key" ON "SupplierInvoice"("supplierId", "invoiceNumber");
CREATE INDEX "CustomerAdvance_customerId_currency_idx" ON "CustomerAdvance"("customerId", "currency");
CREATE INDEX "CustomerAdvance_bookingId_idx" ON "CustomerAdvance"("bookingId");
CREATE INDEX "CustomerAdvanceAllocation_advanceId_reversedAt_idx" ON "CustomerAdvanceAllocation"("advanceId", "reversedAt");
CREATE INDEX "CustomerAdvanceAllocation_invoiceId_reversedAt_idx" ON "CustomerAdvanceAllocation"("invoiceId", "reversedAt");
CREATE INDEX "SupplierAdvance_supplierId_currency_idx" ON "SupplierAdvance"("supplierId", "currency");
CREATE INDEX "SupplierAdvance_bookingId_idx" ON "SupplierAdvance"("bookingId");
CREATE INDEX "SupplierAdvanceAllocation_advanceId_reversedAt_idx" ON "SupplierAdvanceAllocation"("advanceId", "reversedAt");
CREATE INDEX "SupplierAdvanceAllocation_invoiceId_reversedAt_idx" ON "SupplierAdvanceAllocation"("invoiceId", "reversedAt");
CREATE INDEX "PassengerPayment_customerInvoiceId_idx" ON "PassengerPayment"("customerInvoiceId");
CREATE INDEX "SupplierPayment_supplierInvoiceId_idx" ON "SupplierPayment"("supplierInvoiceId");

ALTER TABLE "PassengerPayment" ADD CONSTRAINT "PassengerPayment_customerInvoiceId_fkey" FOREIGN KEY ("customerInvoiceId") REFERENCES "CustomerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BookingDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_bookingSupplierId_fkey" FOREIGN KEY ("bookingSupplierId") REFERENCES "BookingSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BookingDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAdvanceAllocation" ADD CONSTRAINT "CustomerAdvanceAllocation_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "CustomerAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAdvanceAllocation" ADD CONSTRAINT "CustomerAdvanceAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CustomerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAdvanceAllocation" ADD CONSTRAINT "CustomerAdvanceAllocation_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAdvanceAllocation" ADD CONSTRAINT "CustomerAdvanceAllocation_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvanceAllocation" ADD CONSTRAINT "SupplierAdvanceAllocation_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "SupplierAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvanceAllocation" ADD CONSTRAINT "SupplierAdvanceAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvanceAllocation" ADD CONSTRAINT "SupplierAdvanceAllocation_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvanceAllocation" ADD CONSTRAINT "SupplierAdvanceAllocation_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
