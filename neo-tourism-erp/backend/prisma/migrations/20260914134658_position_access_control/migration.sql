-- CreateEnum
CREATE TYPE "RoleAssignmentSource" AS ENUM ('MANUAL', 'POSITION_AUTO');

-- AlterEnum
ALTER TYPE "AccessReviewTriggerType" ADD VALUE 'POSITION_CHANGE';

-- NOTE: Prisma also wanted to DROP the Attendance one_open_per_attendance
-- partial indexes here (they are invisible to schema.prisma). Those drops were
-- removed: the guards are managed by prisma/guards.sql (`npm run db:guards`).
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "positionId" UUID;

-- AlterTable
ALTER TABLE "UserRole" ADD COLUMN     "source" "RoleAssignmentSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionRoleMapping" (
    "id" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_code_key" ON "Position"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PositionRoleMapping_positionId_roleId_key" ON "PositionRoleMapping"("positionId", "roleId");

-- CreateIndex
CREATE INDEX "Employee_positionId_idx" ON "Employee"("positionId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionRoleMapping" ADD CONSTRAINT "PositionRoleMapping_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionRoleMapping" ADD CONSTRAINT "PositionRoleMapping_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
