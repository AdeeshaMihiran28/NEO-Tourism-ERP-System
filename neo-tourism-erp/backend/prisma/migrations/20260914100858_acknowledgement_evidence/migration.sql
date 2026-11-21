-- NOTE: Prisma also wanted to DROP the Attendance one_open_per_attendance
-- partial indexes here (they are invisible to schema.prisma). Those drops were
-- removed: the guards are managed by prisma/guards.sql (`npm run db:guards`).
-- AlterTable
ALTER TABLE "DocumentAcknowledgement" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "documentVersion" INTEGER;
