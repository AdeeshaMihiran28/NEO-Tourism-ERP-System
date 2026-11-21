ALTER TYPE "TravelStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "BookingSupplierStatus" ADD VALUE IF NOT EXISTS 'BOOKED_PAYMENT_PENDING';
ALTER TYPE "BookingSupplierStatus" ADD VALUE IF NOT EXISTS 'BOOKED_PAID';
ALTER TYPE "BookingSupplierStatus" ADD VALUE IF NOT EXISTS 'SCHEDULE_CHANGE';
ALTER TYPE "BookingSupplierStatus" ADD VALUE IF NOT EXISTS 'SCHEDULE_CHANGE_COMPLETE';
ALTER TYPE "BookingSupplierStatus" ADD VALUE IF NOT EXISTS 'TRAVEL_COMPLETE';

CREATE TYPE "BookingProductIssueType" AS ENUM ('SCHEDULE_CHANGE', 'MISSING_PASSENGER_DOCUMENTS', 'SUPPLIER_PAYMENT_PENDING', 'BOOKING_CONFIRMATION_PENDING', 'TICKET_ISSUANCE_PENDING', 'OTHER');
CREATE TYPE "BookingProductIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "BookingProductIssue" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "bookingSupplierId" UUID NOT NULL,
    "type" "BookingProductIssueType" NOT NULL,
    "originalDetails" TEXT,
    "revisedDetails" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" "BookingProductIssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingProductIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingProductIssueNote" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingProductIssueNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingProductIssue_bookingId_status_createdAt_idx" ON "BookingProductIssue"("bookingId", "status", "createdAt");
CREATE INDEX "BookingProductIssue_bookingSupplierId_status_createdAt_idx" ON "BookingProductIssue"("bookingSupplierId", "status", "createdAt");
CREATE INDEX "BookingProductIssueNote_issueId_createdAt_idx" ON "BookingProductIssueNote"("issueId", "createdAt");

ALTER TABLE "BookingProductIssue" ADD CONSTRAINT "BookingProductIssue_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingProductIssue" ADD CONSTRAINT "BookingProductIssue_bookingSupplierId_fkey" FOREIGN KEY ("bookingSupplierId") REFERENCES "BookingSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingProductIssue" ADD CONSTRAINT "BookingProductIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingProductIssue" ADD CONSTRAINT "BookingProductIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingProductIssueNote" ADD CONSTRAINT "BookingProductIssueNote_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "BookingProductIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingProductIssueNote" ADD CONSTRAINT "BookingProductIssueNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
