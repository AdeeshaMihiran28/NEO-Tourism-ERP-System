-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TravelStatus" AS ENUM ('UPCOMING', 'IN_TRAVEL', 'TRAVEL_COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationsStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUPPLIER_PENDING', 'TICKETING_PENDING', 'READY', 'COMPLETE', 'ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "AccountsStatus" AS ENUM ('NOT_STARTED', 'RECONCILIATION_PENDING', 'RECONCILED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "FolderStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('AIRLINE', 'HOTEL', 'TOUR_OPERATOR', 'TRANSFER', 'CRUISE', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingSupplierStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingReferenceType" AS ENUM ('PNR', 'AIRLINE_REFERENCE', 'HOTEL_REFERENCE', 'SUPPLIER_REFERENCE', 'TICKET_NUMBER', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingDocumentCategory" AS ENUM ('TICKET', 'ITINERARY', 'INVOICE', 'SUPPLIER_DOCUMENT', 'PASSENGER_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'OPERATIONS_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_TASK_ASSIGNED';

-- CreateTable
CREATE TABLE "FolderCounter" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolderCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "folderNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "saleSubmissionId" UUID NOT NULL,
    "salesAdvisorId" UUID NOT NULL,
    "operationsOwnerId" UUID,
    "status" "BookingStatus" NOT NULL DEFAULT 'NEW',
    "travelStatus" "TravelStatus" NOT NULL DEFAULT 'UPCOMING',
    "operationsStatus" "OperationsStatus" NOT NULL DEFAULT 'PENDING',
    "accountsStatus" "AccountsStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "folderStatus" "FolderStatus" NOT NULL DEFAULT 'OPEN',
    "destination" TEXT NOT NULL,
    "travelStartDate" DATE NOT NULL,
    "travelEndDate" DATE,
    "finalServiceDate" DATE,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "supplierCost" DECIMAL(12,2),
    "currency" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passenger" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "passportExpiryDate" DATE,
    "email" TEXT,
    "phone" TEXT,
    "isPrimaryPassenger" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "supplierType" "SupplierType" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSupplier" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierReference" TEXT,
    "serviceType" TEXT NOT NULL,
    "supplierCost" DECIMAL(12,2),
    "currency" TEXT,
    "status" "BookingSupplierStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingReference" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" "BookingReferenceType" NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDocument" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "category" "BookingDocumentCategory" NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingNote" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTask" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedUserId" UUID,
    "dueAt" TIMESTAMP(3),
    "status" "BookingTaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_folderNumber_key" ON "Booking"("folderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_leadId_key" ON "Booking"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_saleSubmissionId_key" ON "Booking"("saleSubmissionId");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_salesAdvisorId_status_idx" ON "Booking"("salesAdvisorId", "status");

-- CreateIndex
CREATE INDEX "Booking_operationsOwnerId_operationsStatus_idx" ON "Booking"("operationsOwnerId", "operationsStatus");

-- CreateIndex
CREATE INDEX "Booking_travelStartDate_idx" ON "Booking"("travelStartDate");

-- CreateIndex
CREATE INDEX "Passenger_bookingId_idx" ON "Passenger"("bookingId");

-- CreateIndex
CREATE INDEX "Passenger_firstName_lastName_idx" ON "Passenger"("firstName", "lastName");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Supplier_supplierType_isActive_idx" ON "Supplier"("supplierType", "isActive");

-- CreateIndex
CREATE INDEX "BookingSupplier_bookingId_idx" ON "BookingSupplier"("bookingId");

-- CreateIndex
CREATE INDEX "BookingSupplier_supplierId_idx" ON "BookingSupplier"("supplierId");

-- CreateIndex
CREATE INDEX "BookingReference_bookingId_idx" ON "BookingReference"("bookingId");

-- CreateIndex
CREATE INDEX "BookingReference_supplierId_idx" ON "BookingReference"("supplierId");

-- CreateIndex
CREATE INDEX "BookingDocument_bookingId_idx" ON "BookingDocument"("bookingId");

-- CreateIndex
CREATE INDEX "BookingNote_bookingId_createdAt_idx" ON "BookingNote"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingTask_bookingId_status_dueAt_idx" ON "BookingTask"("bookingId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "BookingTask_assignedUserId_status_idx" ON "BookingTask"("assignedUserId", "status");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_saleSubmissionId_fkey" FOREIGN KEY ("saleSubmissionId") REFERENCES "SaleSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_salesAdvisorId_fkey" FOREIGN KEY ("salesAdvisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_operationsOwnerId_fkey" FOREIGN KEY ("operationsOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passenger" ADD CONSTRAINT "Passenger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSupplier" ADD CONSTRAINT "BookingSupplier_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSupplier" ADD CONSTRAINT "BookingSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReference" ADD CONSTRAINT "BookingReference_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReference" ADD CONSTRAINT "BookingReference_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTask" ADD CONSTRAINT "BookingTask_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTask" ADD CONSTRAINT "BookingTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTask" ADD CONSTRAINT "BookingTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
