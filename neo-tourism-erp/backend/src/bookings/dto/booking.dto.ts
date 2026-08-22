import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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
import {
  BookingDocumentCategory,
  BookingReferenceType,
  BookingStatus,
  BookingSupplierStatus,
  BookingTaskStatus,
  OperationsStatus,
  SupplierType,
  TravelStatus,
} from '../../../generated/prisma/enums';

const moneyPattern = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export class BookingQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(30) folderNumber?: string;
  @IsOptional() @IsString() @MaxLength(150) customer?: string;
  @IsOptional() @IsString() @MaxLength(150) passenger?: string;
  @IsOptional() @IsUUID() salesAdvisorId?: string;
  @IsOptional() @IsUUID() operationsOwnerId?: string;
  @IsOptional() @IsEnum(BookingStatus) bookingStatus?: BookingStatus;
  @IsOptional() @IsEnum(TravelStatus) travelStatus?: TravelStatus;
  @IsOptional() @IsEnum(OperationsStatus) operationsStatus?: OperationsStatus;
  @IsOptional() @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) dateTo?: string;
}

export class UpdateBookingDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) destination?: string;
  @IsOptional() @IsDateString({ strict: true }) travelStartDate?: string;
  @IsOptional() @IsDateString({ strict: true }) travelEndDate?: string;
  @IsOptional() @IsDateString({ strict: true }) finalServiceDate?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) supplierCost?: string;
}

export class AssignOperationsDto {
  @IsUUID() userId!: string;
}
export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus) status!: BookingStatus;
}
export class UpdateOperationsStatusDto {
  @IsEnum(OperationsStatus) status!: OperationsStatus;
}
export class UpdateTravelStatusDto {
  @IsEnum(TravelStatus) status!: TravelStatus;
}

export class CreatePassengerDto {
  @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @IsOptional() @IsDateString({ strict: true }) dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(100) nationality?: string;
  @IsOptional() @IsString() @MaxLength(100) passportNumber?: string;
  @IsOptional() @IsDateString({ strict: true }) passportExpiryDate?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsBoolean() isPrimaryPassenger?: boolean;
}

export class UpdatePassengerDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) lastName?: string;
  @IsOptional() @IsDateString({ strict: true }) dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(100) nationality?: string;
  @IsOptional() @IsString() @MaxLength(100) passportNumber?: string;
  @IsOptional() @IsDateString({ strict: true }) passportExpiryDate?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsBoolean() isPrimaryPassenger?: boolean;
}

export class CreateBookingSupplierDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsEnum(SupplierType) supplierType?: SupplierType;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsString() @IsNotEmpty() @MaxLength(150) serviceType!: string;
  @IsOptional() @IsString() @MaxLength(200) supplierReference?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) supplierCost?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsEnum(BookingSupplierStatus) status?: BookingSupplierStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateBookingSupplierDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) serviceType?: string;
  @IsOptional() @IsString() @MaxLength(200) supplierReference?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) supplierCost?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsEnum(BookingSupplierStatus) status?: BookingSupplierStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateBookingReferenceDto {
  @IsEnum(BookingReferenceType) type!: BookingReferenceType;
  @IsString() @IsNotEmpty() @MaxLength(200) reference!: string;
  @IsOptional() @IsUUID() supplierId?: string;
}

export class UpdateBookingReferenceDto {
  @IsOptional() @IsEnum(BookingReferenceType) type?: BookingReferenceType;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) reference?: string;
  @IsOptional() @IsUUID() supplierId?: string;
}

export class CreateBookingDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(255) fileName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) fileType!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) storageKey!: string;
  @IsEnum(BookingDocumentCategory) category!: BookingDocumentCategory;
}

export class CreateBookingNoteDto {
  @IsString() @IsNotEmpty() @MaxLength(4000) content!: string;
}

export class CreateBookingTaskDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

export class UpdateBookingTaskDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsEnum(BookingTaskStatus) status?: BookingTaskStatus;
}
