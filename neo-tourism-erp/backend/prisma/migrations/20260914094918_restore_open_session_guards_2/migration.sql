-- Re-applies the partial unique guards that Prisma cannot express in
-- schema.prisma and therefore drops on every `migrate dev` drift check.
-- After ANY future `migrate dev`, run `npm run db:guards` to re-apply them
-- (see prisma/guards.sql). Data verified clean before each restore.
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceWorkSession_one_open_per_attendance"
ON "AttendanceWorkSession"("attendanceId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceBreak_one_open_per_attendance"
ON "AttendanceBreak"("attendanceId") WHERE "endedAt" IS NULL;
