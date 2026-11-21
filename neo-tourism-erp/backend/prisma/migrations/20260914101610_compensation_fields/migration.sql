-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('HOURLY', 'DAILY', 'MONTHLY');

-- NOTE: Prisma also wanted to DROP the Attendance one_open_per_attendance
-- partial indexes here (they are invisible to schema.prisma). Those drops were
-- removed: the guards are managed by prisma/guards.sql (`npm run db:guards`).
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "payFrequency" "PayFrequency",
ADD COLUMN     "payRate" DECIMAL(12,2),
ADD COLUMN     "salaryBand" TEXT;
