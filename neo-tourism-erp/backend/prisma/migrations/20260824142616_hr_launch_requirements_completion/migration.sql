-- CreateEnum
CREATE TYPE "EmploymentChangeType" AS ENUM ('HIRED', 'PROMOTION', 'TRANSFER', 'DEPARTMENT_CHANGE', 'MANAGER_CHANGE', 'JOB_TITLE_CHANGE', 'EMPLOYMENT_TYPE_CHANGE', 'STATUS_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');

-- CreateEnum
CREATE TYPE "LeaveAccrualMethod" AS ENUM ('ANNUAL', 'MONTHLY', 'NONE');

-- CreateEnum
CREATE TYPE "LeaveApprovalLevel" AS ENUM ('MANAGER', 'HR');

-- CreateEnum
CREATE TYPE "LeaveApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HrTaskCategory" AS ENUM ('HR', 'MANAGER', 'IT', 'EMPLOYEE', 'DOCUMENT', 'ACCESS', 'EQUIPMENT', 'FINANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "HrTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentAcknowledgementStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "EmployeeDocumentVisibility" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR_ONLY', 'ADMIN_ONLY');

-- CreateEnum
CREATE TYPE "AccessReviewTriggerType" AS ENUM ('DEPARTMENT_CHANGE', 'MANAGER_CHANGE', 'JOB_TITLE_CHANGE', 'STATUS_CHANGE', 'OFFBOARDING', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmployeeDocumentCategory" ADD VALUE 'POLICY';
ALTER TYPE "EmployeeDocumentCategory" ADD VALUE 'VISA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_APPROVAL_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'ONBOARDING_TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'ONBOARDING_TASK_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'OFFBOARDING_TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_DOCUMENT_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_DOCUMENT_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCESS_REVIEW_REQUIRED';

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "expiryDate" DATE,
ADD COLUMN     "visibility" "EmployeeDocumentVisibility" NOT NULL DEFAULT 'HR_ONLY';

-- CreateTable
CREATE TABLE "EmploymentHistory" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "departmentId" UUID NOT NULL,
    "managerId" UUID,
    "employmentType" "EmploymentType" NOT NULL,
    "employmentStatus" "EmploymentStatus" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "changeType" "EmploymentChangeType" NOT NULL,
    "reason" TEXT,
    "changedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCustomFieldDefinition" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "selectOptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCustomFieldValue" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "annualEntitlement" DECIMAL(8,2) NOT NULL,
    "accrualMethod" "LeaveAccrualMethod" NOT NULL DEFAULT 'ANNUAL',
    "accrualAmount" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "allowCarryForward" BOOLEAN NOT NULL DEFAULT false,
    "maxCarryForward" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLeavePolicy" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leavePolicyId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeLeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "year" INTEGER NOT NULL,
    "openingBalance" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "accrued" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "adjusted" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "remainingBalance" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApprovalPolicy" (
    "id" UUID NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "requiresManagerApproval" BOOLEAN NOT NULL DEFAULT true,
    "requiresHrApproval" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApproval" (
    "id" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "approvalLevel" "LeaveApprovalLevel" NOT NULL,
    "approverUserId" UUID,
    "status" "LeaveApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplateTask" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "HrTaskCategory" NOT NULL,
    "assignedRole" TEXT,
    "dueDaysAfterJoin" INTEGER,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OnboardingTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "HrTaskCategory" NOT NULL,
    "assignedRole" TEXT,
    "assignedUserId" UUID,
    "dueDate" DATE,
    "status" "HrTaskStatus" NOT NULL DEFAULT 'PENDING',
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "employeeDocumentId" UUID,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffboardingTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffboardingTemplateTask" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "HrTaskCategory" NOT NULL,
    "assignedRole" TEXT,
    "dueDaysFromEnd" INTEGER,
    "blocksCompletion" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OffboardingTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffboardingTask" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "HrTaskCategory" NOT NULL,
    "assignedRole" TEXT,
    "assignedUserId" UUID,
    "dueDate" DATE,
    "status" "HrTaskStatus" NOT NULL DEFAULT 'PENDING',
    "blocksCompletion" BOOLEAN NOT NULL DEFAULT true,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocumentVersion" (
    "id" UUID NOT NULL,
    "employeeDocumentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAcknowledgement" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "employeeDocumentId" UUID NOT NULL,
    "status" "DocumentAcknowledgementStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledgedAt" TIMESTAMP(3),
    "typedName" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentRoleMapping" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAccessReview" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "userId" UUID,
    "triggerType" "AccessReviewTriggerType" NOT NULL,
    "oldDepartmentId" UUID,
    "newDepartmentId" UUID,
    "oldRoles" JSONB NOT NULL,
    "recommendedRoles" JSONB NOT NULL,
    "status" "AccessReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitInterview" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "interviewerUserId" UUID,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExitInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmploymentHistory_employeeId_effectiveFrom_idx" ON "EmploymentHistory"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCustomFieldDefinition_code_key" ON "EmployeeCustomFieldDefinition"("code");

-- CreateIndex
CREATE INDEX "EmployeeCustomFieldValue_definitionId_idx" ON "EmployeeCustomFieldValue"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCustomFieldValue_employeeId_definitionId_key" ON "EmployeeCustomFieldValue"("employeeId", "definitionId");

-- CreateIndex
CREATE INDEX "LeavePolicy_leaveType_isActive_idx" ON "LeavePolicy"("leaveType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_name_leaveType_key" ON "LeavePolicy"("name", "leaveType");

-- CreateIndex
CREATE INDEX "EmployeeLeavePolicy_employeeId_effectiveFrom_idx" ON "EmployeeLeavePolicy"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeLeavePolicy_leavePolicyId_idx" ON "EmployeeLeavePolicy"("leavePolicyId");

-- CreateIndex
CREATE INDEX "LeaveBalance_year_leaveType_idx" ON "LeaveBalance"("year", "leaveType");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveType_year_key" ON "LeaveBalance"("employeeId", "leaveType", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApprovalPolicy_leaveType_key" ON "LeaveApprovalPolicy"("leaveType");

-- CreateIndex
CREATE INDEX "LeaveApproval_approverUserId_status_idx" ON "LeaveApproval"("approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApproval_leaveRequestId_approvalLevel_key" ON "LeaveApproval"("leaveRequestId", "approvalLevel");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingTemplate_name_key" ON "OnboardingTemplate"("name");

-- CreateIndex
CREATE INDEX "OnboardingTemplateTask_templateId_sortOrder_idx" ON "OnboardingTemplateTask"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "OnboardingTask_employeeId_status_idx" ON "OnboardingTask"("employeeId", "status");

-- CreateIndex
CREATE INDEX "OnboardingTask_assignedUserId_status_idx" ON "OnboardingTask"("assignedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OffboardingTemplate_name_key" ON "OffboardingTemplate"("name");

-- CreateIndex
CREATE INDEX "OffboardingTemplateTask_templateId_sortOrder_idx" ON "OffboardingTemplateTask"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "OffboardingTask_employeeId_status_idx" ON "OffboardingTask"("employeeId", "status");

-- CreateIndex
CREATE INDEX "OffboardingTask_assignedUserId_status_idx" ON "OffboardingTask"("assignedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocumentVersion_employeeDocumentId_version_key" ON "EmployeeDocumentVersion"("employeeDocumentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAcknowledgement_employeeId_employeeDocumentId_key" ON "DocumentAcknowledgement"("employeeId", "employeeDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentRoleMapping_departmentId_roleId_key" ON "DepartmentRoleMapping"("departmentId", "roleId");

-- CreateIndex
CREATE INDEX "EmployeeAccessReview_status_createdAt_idx" ON "EmployeeAccessReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeAccessReview_employeeId_createdAt_idx" ON "EmployeeAccessReview"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "ExitInterview_employeeId_scheduledAt_idx" ON "ExitInterview"("employeeId", "scheduledAt");

-- CreateIndex
CREATE INDEX "EmployeeDocument_expiryDate_idx" ON "EmployeeDocument"("expiryDate");

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCustomFieldValue" ADD CONSTRAINT "EmployeeCustomFieldValue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCustomFieldValue" ADD CONSTRAINT "EmployeeCustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "EmployeeCustomFieldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeavePolicy" ADD CONSTRAINT "EmployeeLeavePolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeavePolicy" ADD CONSTRAINT "EmployeeLeavePolicy_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "LeavePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApproval" ADD CONSTRAINT "LeaveApproval_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffboardingTemplateTask" ADD CONSTRAINT "OffboardingTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OffboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffboardingTask" ADD CONSTRAINT "OffboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocumentVersion" ADD CONSTRAINT "EmployeeDocumentVersion_employeeDocumentId_fkey" FOREIGN KEY ("employeeDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAcknowledgement" ADD CONSTRAINT "DocumentAcknowledgement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAcknowledgement" ADD CONSTRAINT "DocumentAcknowledgement_employeeDocumentId_fkey" FOREIGN KEY ("employeeDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAccessReview" ADD CONSTRAINT "EmployeeAccessReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitInterview" ADD CONSTRAINT "ExitInterview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
