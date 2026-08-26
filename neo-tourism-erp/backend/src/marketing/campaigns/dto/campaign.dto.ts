import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MarketingCampaignStatus } from '../../../../generated/prisma/client';

export class CreateCampaignDto {
  @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(500) objective?: string;
  @IsOptional()
  @IsEnum(MarketingCampaignStatus)
  status?: MarketingCampaignStatus;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsUUID() ownerUserId!: string;
  @IsOptional() @IsUUID() dealId?: string;
}
