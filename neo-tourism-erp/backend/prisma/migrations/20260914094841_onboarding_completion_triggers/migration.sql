-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ONBOARDING_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'ONBOARDING_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'OFFBOARDING_COMPLETED';

-- DropIndex
DROP INDEX "AttendanceBreak_one_open_per_attendance";

-- DropIndex
DROP INDEX "AttendanceWorkSession_one_open_per_attendance";
