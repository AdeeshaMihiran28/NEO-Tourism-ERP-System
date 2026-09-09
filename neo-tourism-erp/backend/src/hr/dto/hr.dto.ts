import {
  AttendanceStatus,
  EmployeeDocumentCategory,
  EmployeeDocumentVisibility,
  EmploymentStatus,
  EmploymentType,
  OrganizationLevel,
  LeaveType,
  ProcessStatus,
} from '../../../generated/prisma/client';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsString() @IsNotEmpty() @MaxLength(80) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) lastName!: string;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsEmail() workEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) workPhone?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsString() @IsNotEmpty() @MaxLength(120) jobTitle!: string;
  @IsOptional()
  @IsEnum(OrganizationLevel)
  organizationLevel?: OrganizationLevel;
  @IsUUID() departmentId!: string;
  @IsOptional() @IsUUID() managerId?: string | null;
  @IsEnum(EmploymentType) employmentType!: EmploymentType;
  @IsDateString() joinDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
  @IsOptional() @IsUUID() shiftId?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) lastName?: string;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsEmail() workEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) workPhone?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) jobTitle?: string;
  @IsOptional()
  @IsEnum(OrganizationLevel)
  organizationLevel?: OrganizationLevel;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() managerId?: string | null;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsDateString() joinDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
  @IsOptional() @IsString() @MaxLength(1000) changeReason?: string;
  @IsOptional() @IsUUID() shiftId?: string;
}

export class EmployeeQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsEnum(EmploymentStatus) status?: EmploymentStatus;
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value as unknown;
  })
  @IsBoolean()
  includeArchived?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class UpdateEmploymentStatusDto {
  @IsEnum(EmploymentStatus) status!: EmploymentStatus;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class AttendanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
}

export class UpdateAttendanceDto {
  @IsOptional() @IsDateString() checkInAt?: string;
  @IsOptional() @IsDateString() checkOutAt?: string;
  @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateAttendancePolicyDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dailyBreakMinutes?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBreakSessions?: number | null;
  @IsBoolean() flexibleBreaks!: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateAttendancePolicyDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dailyBreakMinutes?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBreakSessions?: number | null;
  @IsOptional() @IsBoolean() flexibleBreaks?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignAttendancePolicyDto {
  @IsOptional() @IsUUID() attendancePolicyId!: string | null;
}

export class CreateShiftDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignShiftDto {
  @IsUUID() employeeId!: string;
  @IsUUID() shiftId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class AssignEmployeeShiftDto {
  @IsUUID() shiftId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType) leaveType!: LeaveType;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export class ReviewLeaveDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateEmployeeDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(255) fileName!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) fileType!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) storageKey!: string;
  @IsEnum(EmployeeDocumentCategory) category!: EmployeeDocumentCategory;
  @IsOptional()
  @IsEnum(EmployeeDocumentVisibility)
  visibility?: EmployeeDocumentVisibility;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class UpdateProcessDto {
  @IsEnum(ProcessStatus) status!: ProcessStatus;
  @IsOptional() @IsBoolean() erpAccountDisabled?: boolean;
  @IsOptional() @IsBoolean() emailAccessRemoved?: boolean;
  @IsOptional() @IsBoolean() vpnRemoved?: boolean;
  @IsOptional() @IsBoolean() deviceReturnChecked?: boolean;
  @IsOptional() @IsBoolean() telephonyRemoved?: boolean;
  @IsOptional() @IsBoolean() otherAccessRemoved?: boolean;
}
