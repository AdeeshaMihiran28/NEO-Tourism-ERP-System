-- Employment history now records the explicit position that drove access.
ALTER TYPE "EmploymentChangeType" ADD VALUE 'POSITION_CHANGE';

ALTER TABLE "EmploymentHistory" ADD COLUMN "positionId" UUID;

CREATE INDEX "EmploymentHistory_positionId_idx" ON "EmploymentHistory"("positionId");

ALTER TABLE "EmploymentHistory"
ADD CONSTRAINT "EmploymentHistory_positionId_fkey"
FOREIGN KEY ("positionId") REFERENCES "Position"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitation secrets are stored only as hashes. Existing users are untouched.
CREATE TABLE "AccountInvitation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountInvitation_tokenHash_key" ON "AccountInvitation"("tokenHash");
CREATE INDEX "AccountInvitation_userId_createdAt_idx" ON "AccountInvitation"("userId", "createdAt");
CREATE INDEX "AccountInvitation_expiresAt_idx" ON "AccountInvitation"("expiresAt");

ALTER TABLE "AccountInvitation"
ADD CONSTRAINT "AccountInvitation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountInvitation"
ADD CONSTRAINT "AccountInvitation_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
