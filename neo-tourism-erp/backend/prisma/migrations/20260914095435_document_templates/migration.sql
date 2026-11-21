-- NOTE: Prisma also wanted to DROP the Attendance one_open_per_attendance
-- partial indexes here (they are invisible to schema.prisma). Those drops were
-- removed: the guards are managed by prisma/guards.sql (`npm run db:guards`).
-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "contentText" TEXT,
ADD COLUMN     "templateId" UUID;

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EmployeeDocumentCategory" NOT NULL DEFAULT 'HR_LETTER',
    "visibility" "EmployeeDocumentVisibility" NOT NULL DEFAULT 'EMPLOYEE',
    "content" TEXT NOT NULL,
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_name_key" ON "DocumentTemplate"("name");

-- CreateIndex
CREATE INDEX "EmployeeDocument_templateId_idx" ON "EmployeeDocument"("templateId");

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
