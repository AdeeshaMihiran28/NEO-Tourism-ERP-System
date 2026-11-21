-- AlterEnum
ALTER TYPE "EmploymentStatus" ADD VALUE 'PROBATION';

-- AlterEnum
ALTER TYPE "LeaveType" ADD VALUE 'PARENTAL';

-- DropIndex
DROP INDEX "AttendanceBreak_one_open_per_attendance";

-- DropIndex
DROP INDEX "AttendanceWorkSession_one_open_per_attendance";
