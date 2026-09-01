import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  MarketingOpportunitySource,
  MarketingOpportunityStatus,
  MarketingPriority,
} from '../../../../generated/prisma/client';
export class CreateOpportunityDto {
  @IsEnum(MarketingOpportunitySource) sourceType!: MarketingOpportunitySource;
  @IsOptional() @IsString() @MaxLength(200) sourceReferenceId?: string;
  @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(3000) description!: string;
  @IsOptional() @IsString() @MaxLength(120) destination?: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
  @IsOptional() @IsUUID() assignedUserId?: string;
}
export class OpportunityStatusDto {
  @IsEnum(MarketingOpportunityStatus) status!: MarketingOpportunityStatus;
}
export class OpportunityDealDto {
  @IsUUID() dealId!: string;
}
