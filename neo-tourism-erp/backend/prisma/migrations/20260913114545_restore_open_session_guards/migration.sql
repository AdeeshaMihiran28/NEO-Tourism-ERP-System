-- Restore partial unique guards dropped by drift reconciliation in
-- 20260913113951_add_probation_status_parental_leave. These cannot be
-- expressed in schema.prisma; they were originally created by raw SQL in
-- 20260908120000_daily_attendance_break_tracking. Data verified clean
-- (zero attendances with more than one open session or break).
CREATE UNIQUE INDEX "AttendanceWorkSession_one_open_per_attendance"
ON "AttendanceWorkSession"("attendanceId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "AttendanceBreak_one_open_per_attendance"
ON "AttendanceBreak"("attendanceId") WHERE "endedAt" IS NULL;
