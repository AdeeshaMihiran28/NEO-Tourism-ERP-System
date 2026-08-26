import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MarketingChannel,
  MarketingChannelStatus,
  MarketingDealApprovalStatus,
  MarketingDealStatus,
} from '../../../../generated/prisma/client';

export class CreateDealDto {
  @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(500) shortDescription?: string;
  @IsString() @IsNotEmpty() @MaxLength(120) destination!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) departureLocation!: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsDateString() travelStartDate!: string;
  @IsDateString() travelEndDate!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @IsString() @MaxLength(200) baggage?: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) keyTerms!: string;
  @IsDateString() expiryAt!: string;
}

export class UpdateDealDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(500) shortDescription?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) destination?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  departureLocation?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsDateString() travelStartDate?: string;
  @IsOptional() @IsDateString() travelEndDate?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @MaxLength(200) baggage?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(5000) keyTerms?: string;
  @IsOptional() @IsDateString() expiryAt?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  changeReason?: string;
}

export class DealQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(120) destination?: string;
  @IsOptional() @IsEnum(MarketingDealStatus) status?: MarketingDealStatus;
  @IsOptional()
  @IsEnum(MarketingDealApprovalStatus)
  approvalStatus?: MarketingDealApprovalStatus;
  @IsOptional() @IsEnum(MarketingChannel) channel?: MarketingChannel;
  @IsOptional() @IsDateString() expiryFrom?: string;
  @IsOptional() @IsDateString() expiryTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class DecisionDto {
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class ScheduleDealDto {
  @IsDateString() scheduledFor!: string;
}

export class SuspendDealDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export class UpdateDealChannelDto {
  @IsEnum(MarketingChannel) channel!: MarketingChannel;
  @IsEnum(MarketingChannelStatus) status!: MarketingChannelStatus;
  @IsOptional() @IsString() @MaxLength(300) externalReference?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
}
