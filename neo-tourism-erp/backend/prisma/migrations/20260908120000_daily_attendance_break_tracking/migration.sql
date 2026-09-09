-- Extend the existing daily attendance record with configurable policies,
-- work sessions, and break sessions.
CREATE TABLE "AttendancePolicy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBreakMinutes" INTEGER,
    "maxBreakSessions" INTEGER,
    "flexibleBreaks" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendancePolicy_name_key" ON "AttendancePolicy"("name");

INSERT INTO "AttendancePolicy" (
    "id", "name", "dailyBreakMinutes", "maxBreakSessions", "flexibleBreaks", "isActive", "updatedAt"
) VALUES
    (gen_random_uuid(), 'STANDARD', 60, 3, false, true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ADMIN_FLEXIBLE', NULL, NULL, true, true, CURRENT_TIMESTAMP);

ALTER TABLE "Employee" ADD COLUMN "attendancePolicyId" UUID;
CREATE INDEX "Employee_attendancePolicyId_idx" ON "Employee"("attendancePolicyId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_attendancePolicyId_fkey"
FOREIGN KEY ("attendancePolicyId") REFERENCES "AttendancePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AttendanceWorkSession" (
    "id" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceWorkSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceWorkSession_attendanceId_startedAt_idx"
ON "AttendanceWorkSession"("attendanceId", "startedAt");
CREATE UNIQUE INDEX "AttendanceWorkSession_one_open_per_attendance"
ON "AttendanceWorkSession"("attendanceId") WHERE "endedAt" IS NULL;
ALTER TABLE "AttendanceWorkSession" ADD CONSTRAINT "AttendanceWorkSession_attendanceId_fkey"
FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AttendanceBreak" (
    "id" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceBreak_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceBreak_attendanceId_startedAt_idx"
ON "AttendanceBreak"("attendanceId", "startedAt");
CREATE UNIQUE INDEX "AttendanceBreak_one_open_per_attendance"
ON "AttendanceBreak"("attendanceId") WHERE "endedAt" IS NULL;
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_attendanceId_fkey"
FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing attendance as one completed or active work session.
INSERT INTO "AttendanceWorkSession" (
    "id", "attendanceId", "startedAt", "endedAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "id", "checkInAt", "checkOutAt", "createdAt", CURRENT_TIMESTAMP
FROM "Attendance"
WHERE "checkInAt" IS NOT NULL;
