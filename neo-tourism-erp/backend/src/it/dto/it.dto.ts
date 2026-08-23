import {
  AccessRequestStatus,
  ITAssetStatus,
  ITAssetType,
  ITTicketCategory,
  ITTicketPriority,
  ITTicketStatus,
} from '../../../generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAssetDto {
  @IsEnum(ITAssetType) assetType!: ITAssetType;
  @IsOptional() @IsString() @MaxLength(100) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @IsString() @MaxLength(150) serialNumber?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsDateString() warrantyEndDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateAssetDto {
  @IsOptional() @IsEnum(ITAssetType) assetType?: ITAssetType;
  @IsOptional() @IsString() @MaxLength(100) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @IsString() @MaxLength(150) serialNumber?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsDateString() warrantyEndDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsEnum(ITAssetStatus) status?: ITAssetStatus;
}
export class AssetQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(ITAssetType) type?: ITAssetType;
  @IsOptional() @IsEnum(ITAssetStatus) status?: ITAssetStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class AssignAssetDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() @MaxLength(500) condition?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class ReturnAssetDto {
  @IsOptional() @IsString() @MaxLength(500) condition?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateTicketDto {
  @IsEnum(ITTicketCategory) category!: ITTicketCategory;
  @IsOptional() @IsEnum(ITTicketPriority) priority?: ITTicketPriority;
  @IsString() @IsNotEmpty() @MaxLength(200) subject!: string;
  @IsString() @IsNotEmpty() @MaxLength(4000) description!: string;
}
export class TicketQueryDto {
  @IsOptional() @IsEnum(ITTicketStatus) status?: ITTicketStatus;
  @IsOptional() @IsEnum(ITTicketPriority) priority?: ITTicketPriority;
  @IsOptional() @IsEnum(ITTicketCategory) category?: ITTicketCategory;
}
export class AssignTicketDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class UpdateTicketStatusDto {
  @IsEnum(ITTicketStatus) status!: ITTicketStatus;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class ResolveTicketDto {
  @IsString() @IsNotEmpty() @MaxLength(4000) resolution!: string;
}

export class CreateAccessRequestDto {
  @IsString() @IsNotEmpty() @MaxLength(150) systemName!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) accessType!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
export class ReviewAccessRequestDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class AccessQueryDto {
  @IsOptional() @IsEnum(AccessRequestStatus) status?: AccessRequestStatus;
}
