import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MarketingChannel } from '../../../../generated/prisma/client';
export class SignalQueryDto {
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsEnum(MarketingChannel) channel?: MarketingChannel;
}
export class ManualAttributionDto {
  @IsUUID() leadId!: string;
  @IsUUID() campaignId!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
