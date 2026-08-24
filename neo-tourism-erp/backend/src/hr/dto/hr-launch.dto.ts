import {
  AccessReviewStatus,
  CustomFieldType,
  EmployeeDocumentVisibility,
  EmploymentStatus,
  EmploymentType,
  HrTaskCategory,
  HrTaskStatus,
  LeaveAccrualMethod,
  LeaveType,
} from '../../../generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class DirectoryQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsUUID() departmentId?: string;
}

export class CreateCustomFieldDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) code!: string;
  @IsEnum(CustomFieldType) fieldType!: CustomFieldType;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) selectOptions?: string[];
}

export class UpdateCustomFieldDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) selectOptions?: string[];
}

export class SetCustomFieldValueDto {
  @IsObject() value!: Record<string, unknown>;
}

export class ImportEmployeesDto {
  @IsString() @IsNotEmpty() csv!: string;
}

export class CreateLeavePolicyDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsEnum(LeaveType) leaveType!: LeaveType;
  @Type(() => Number) @IsNumber() @Min(0) annualEntitlement!: number;
  @IsEnum(LeaveAccrualMethod) accrualMethod!: LeaveAccrualMethod;
  @Type(() => Number) @IsNumber() @Min(0) accrualAmount!: number;
  @IsBoolean() allowCarryForward!: boolean;
  @Type(() => Number) @IsNumber() @Min(0) maxCarryForward!: number;
  @IsBoolean() allowNegativeBalance!: boolean;
}

export class AssignLeavePolicyDto {
  @IsUUID() employeeId!: string;
  @IsUUID() leavePolicyId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class LeaveBalanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsEnum(LeaveType) leaveType?: LeaveType;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;
}

export class LeaveCalendarQueryDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() managerId?: string;
}

export class ApprovalCommentDto {
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class UpsertLeaveApprovalPolicyDto {
  @IsEnum(LeaveType) leaveType!: LeaveType;
  @IsBoolean() requiresManagerApproval!: boolean;
  @IsBoolean() requiresHrApproval!: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AccrueLeaveDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number;
}

export class AttendanceReportQueryDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
}

export class CreateTaskTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsArray() tasks!: Array<{
    title: string;
    description?: string;
    category: HrTaskCategory;
    assignedRole?: string;
    dueDays?: number;
    requiresDocument?: boolean;
    blocksCompletion?: boolean;
  }>;
}

export class StartProcessDto {
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class UpdateHrTaskDto {
  @IsEnum(HrTaskStatus) status!: HrTaskStatus;
  @IsOptional() @IsUUID() employeeDocumentId?: string;
}

export class UpdateMyProfileDto {
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
}

export class CreateDocumentVersionDto {
  @IsString() @IsNotEmpty() @MaxLength(255) fileName!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) storageKey!: string;
}

export class AcknowledgeDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(160) typedName!: string;
}

export class UpdateDocumentAccessDto {
  @IsOptional()
  @IsEnum(EmployeeDocumentVisibility)
  visibility?: EmployeeDocumentVisibility;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class ExpiringDocumentsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days = 30;
}

export class ReviewAccessDto {
  @IsEnum(AccessReviewStatus) status!: AccessReviewStatus;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  approvedRoleIds?: string[];
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  removeRoleIds?: string[];
}

export class UpsertRoleMappingDto {
  @IsUUID() departmentId!: string;
  @IsUUID() roleId!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class HrReportQueryDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
}

export class UpsertExitInterviewDto {
  @IsOptional() @IsUUID() interviewerUserId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CsvEmployeeRowDto {
  employeeNumber?: string;
  firstName!: string;
  lastName!: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  jobTitle!: string;
  department!: string;
  manager?: string;
  employmentType!: EmploymentType;
  employmentStatus!: EmploymentStatus;
  joinDate!: string;
}
