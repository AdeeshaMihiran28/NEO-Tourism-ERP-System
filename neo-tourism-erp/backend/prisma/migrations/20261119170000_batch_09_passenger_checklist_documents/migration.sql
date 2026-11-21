ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'BOOKING_CONFIRMATION';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'E_TICKET';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'HOTEL_VOUCHER';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'TRANSFER_VOUCHER';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'TOUR_CONFIRMATION';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'SUPPLIER_CONFIRMATION';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'SCREENSHOT_SNIP';
ALTER TYPE "BookingDocumentCategory" ADD VALUE IF NOT EXISTS 'AMENDMENT_CANCELLATION';

CREATE TYPE "BookingSpecialRequestType" AS ENUM ('FLIGHT', 'HOTEL', 'SPECIAL_ASSISTANCE', 'DIETARY', 'BAGGAGE', 'TRANSFER', 'OTHER');
CREATE TYPE "BookingSpecialRequestStatus" AS ENUM ('REQUESTED', 'SUPPLIER_CONFIRMED', 'UNAVAILABLE', 'CANCELLED');
CREATE TYPE "BookingChecklistItemType" AS ENUM ('PAX_NAMES', 'FLIGHT_DETAILS', 'CANCELLATION_COST', 'BAGGAGE_ALLOWANCE', 'SPECIAL_REQUESTS_FLIGHT', 'HOTELS', 'SPECIAL_REQUESTS_HOTEL', 'TRANSFERS', 'TOURS', 'SNIPS', 'CALCULATIONS');
CREATE TYPE "BookingChecklistState" AS ENUM ('PENDING', 'CHECKED', 'NOT_APPLICABLE');

CREATE TABLE "BookingSpecialRequest" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "passengerId" UUID,
  "bookingSupplierId" UUID,
  "type" "BookingSpecialRequestType" NOT NULL,
  "details" TEXT NOT NULL,
  "status" "BookingSpecialRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "responsibleUserId" UUID,
  "notes" TEXT,
  "createdById" UUID NOT NULL,
  "confirmedById" UUID,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingSpecialRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingSpecialRequestHistory" (
  "id" UUID NOT NULL,
  "specialRequestId" UUID NOT NULL,
  "previousStatus" "BookingSpecialRequestStatus",
  "newStatus" "BookingSpecialRequestStatus" NOT NULL,
  "notes" TEXT,
  "changedById" UUID NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingSpecialRequestHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingChecklistItem" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "itemType" "BookingChecklistItemType" NOT NULL,
  "state" "BookingChecklistState" NOT NULL DEFAULT 'PENDING',
  "verificationNotes" TEXT,
  "checkedById" UUID,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingChecklistHistory" (
  "id" UUID NOT NULL,
  "checklistItemId" UUID NOT NULL,
  "previousState" "BookingChecklistState",
  "newState" "BookingChecklistState" NOT NULL,
  "notes" TEXT,
  "changedById" UUID NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingChecklistHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingSpecialRequest_bookingId_status_createdAt_idx" ON "BookingSpecialRequest"("bookingId", "status", "createdAt");
CREATE INDEX "BookingSpecialRequest_passengerId_idx" ON "BookingSpecialRequest"("passengerId");
CREATE INDEX "BookingSpecialRequest_bookingSupplierId_idx" ON "BookingSpecialRequest"("bookingSupplierId");
CREATE INDEX "BookingSpecialRequest_responsibleUserId_status_idx" ON "BookingSpecialRequest"("responsibleUserId", "status");
CREATE INDEX "BookingSpecialRequestHistory_specialRequestId_changedAt_idx" ON "BookingSpecialRequestHistory"("specialRequestId", "changedAt");
CREATE UNIQUE INDEX "BookingChecklistItem_bookingId_itemType_key" ON "BookingChecklistItem"("bookingId", "itemType");
CREATE INDEX "BookingChecklistItem_bookingId_state_idx" ON "BookingChecklistItem"("bookingId", "state");
CREATE INDEX "BookingChecklistHistory_checklistItemId_changedAt_idx" ON "BookingChecklistHistory"("checklistItemId", "changedAt");

ALTER TABLE "BookingSpecialRequest" ADD CONSTRAINT "BookingSpecialRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingSpecialRequest" ADD CONSTRAINT "BookingSpecialRequest_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingSpecialRequest" ADD CONSTRAINT "BookingSpecialRequest_bookingSupplierId_fkey" FOREIGN KEY ("bookingSupplierId") REFERENCES "BookingSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingSpecialRequest" ADD CONSTRAINT "BookingSpecialRequest_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingSpecialRequest" ADD CONSTRAINT "BookingSpecialRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingSpecialRequest" ADD CONSTRAINT "BookingSpecialRequest_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingSpecialRequestHistory" ADD CONSTRAINT "BookingSpecialRequestHistory_specialRequestId_fkey" FOREIGN KEY ("specialRequestId") REFERENCES "BookingSpecialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingSpecialRequestHistory" ADD CONSTRAINT "BookingSpecialRequestHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingChecklistItem" ADD CONSTRAINT "BookingChecklistItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingChecklistItem" ADD CONSTRAINT "BookingChecklistItem_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingChecklistHistory" ADD CONSTRAINT "BookingChecklistHistory_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "BookingChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingChecklistHistory" ADD CONSTRAINT "BookingChecklistHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingDocument"
  ALTER COLUMN "storageKey" DROP NOT NULL,
  ADD COLUMN "passengerId" UUID,
  ADD COLUMN "bookingSupplierId" UUID,
  ADD COLUMN "revisionRootId" UUID,
  ADD COLUMN "fileSize" INTEGER,
  ADD COLUMN "content" BYTEA,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedById" UUID,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "BookingDocument_passengerId_idx" ON "BookingDocument"("passengerId");
CREATE INDEX "BookingDocument_bookingSupplierId_idx" ON "BookingDocument"("bookingSupplierId");
CREATE INDEX "BookingDocument_revisionRootId_revisionNumber_idx" ON "BookingDocument"("revisionRootId", "revisionNumber");
CREATE INDEX "BookingDocument_bookingId_deletedAt_createdAt_idx" ON "BookingDocument"("bookingId", "deletedAt", "createdAt");

ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_bookingSupplierId_fkey" FOREIGN KEY ("bookingSupplierId") REFERENCES "BookingSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_revisionRootId_fkey" FOREIGN KEY ("revisionRootId") REFERENCES "BookingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
