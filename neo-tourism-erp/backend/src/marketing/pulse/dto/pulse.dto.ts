import { Type } from 'class-transformer';
import {
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
import {
  MarketingPriority,
  MarketingSalesSignalStatus,
  MarketingSalesSignalType,
} from '../../../../generated/prisma/client';

export enum PulsePeriod {
  TODAY = 'TODAY',
  SEVEN_DAYS = '7_DAYS',
  THIRTY_DAYS = '30_DAYS',
}
export class PulseQueryDto {
  @IsOptional() @IsEnum(PulsePeriod) period: PulsePeriod =
    PulsePeriod.SEVEN_DAYS;
}
export class CreateSalesSignalDto {
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @MaxLength(120) destination?: string;
  @IsEnum(MarketingSalesSignalType) signalType!: MarketingSalesSignalType;
  @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(3000) description!: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
}
export class UpdateSalesSignalDto {
  @IsEnum(MarketingSalesSignalStatus) status!: MarketingSalesSignalStatus;
}
export class SalesSignalQueryDto {
  @IsOptional()
  @IsEnum(MarketingSalesSignalStatus)
  status?: MarketingSalesSignalStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
