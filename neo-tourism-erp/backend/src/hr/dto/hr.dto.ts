import {
  AttendanceStatus,
  EmployeeDocumentCategory,
  EmploymentStatus,
  EmploymentType,
  LeaveType,
  ProcessStatus,
} from '../../../generated/prisma/client';
import { Type } from 'class-transformer';
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
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsString() @IsNotEmpty() @MaxLength(120) jobTitle!: string;
  @IsUUID() departmentId!: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsEnum(EmploymentType) employmentType!: EmploymentType;
  @IsDateString() joinDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) lastName?: string;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsEmail() workEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsDateString() joinDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
}

export class EmployeeQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsEnum(EmploymentStatus) status?: EmploymentStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class UpdateEmploymentStatusDto {
  @IsEnum(EmploymentStatus) status!: EmploymentStatus;
  @IsOptional() @IsDateString() endDate?: string;
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
