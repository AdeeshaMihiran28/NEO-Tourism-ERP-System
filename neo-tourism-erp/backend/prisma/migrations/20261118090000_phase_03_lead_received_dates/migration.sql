-- Additive Phase 03 lead timing fields. Existing rows remain null because their
-- original inquiry time and requested end date cannot be reconstructed safely.
ALTER TABLE "Lead"
ADD COLUMN "receivedAt" TIMESTAMP(3),
ADD COLUMN "travelEndDate" DATE;

CREATE INDEX "Lead_source_receivedAt_idx" ON "Lead"("source", "receivedAt");
