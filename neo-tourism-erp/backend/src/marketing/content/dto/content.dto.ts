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
import {
  MarketingContentApprovalStatus,
  MarketingContentStage,
  MarketingContentType,
  MarketingPriority,
} from '../../../../generated/prisma/client';

export class CreateContentDto {
  @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsEnum(MarketingContentType) contentType!: MarketingContentType;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
}

export class UpdateContentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional()
  @IsEnum(MarketingContentType)
  contentType?: MarketingContentType;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
}

export class BoardQueryDto {
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional()
  @IsEnum(MarketingContentType)
  contentType?: MarketingContentType;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
  @IsOptional() @IsDateString() deadlineFrom?: string;
  @IsOptional() @IsDateString() deadlineTo?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class StageDto {
  @IsEnum(MarketingContentStage) stage!: MarketingContentStage;
}

export class AssignContentDto {
  @IsUUID() userId!: string;
}

export class CreateVersionDto {
  @IsOptional() @IsString() @MaxLength(255) fileName?: string;
  @IsOptional() @IsString() @MaxLength(120) fileType?: string;
  @IsOptional() @IsString() @MaxLength(500) storageKey?: string;
  @IsOptional() @IsString() @MaxLength(5000) caption?: string;
  @IsOptional() @IsString() @MaxLength(10000) copyText?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ReviewCommentDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) comment!: string;
}

export class ApprovalQueryDto {
  @IsOptional()
  @IsEnum(MarketingContentApprovalStatus)
  status: MarketingContentApprovalStatus =
    MarketingContentApprovalStatus.PENDING;
  @IsOptional() @IsUUID() reviewerUserId?: string;
  @IsOptional()
  @IsEnum(MarketingContentType)
  contentType?: MarketingContentType;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class CreateCommentDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) comment!: string;
}
