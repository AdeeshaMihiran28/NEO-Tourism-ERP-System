import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  MarketingChannel,
  MarketingPriority,
  NeoTrioCharacterAssetType,
  NeoTrioIdeaStatus,
  NeoTrioIdeaType,
  NeoTrioLibraryType,
  NeoTrioProductionAssetType,
  NeoTrioProductionStage,
  NeoTrioProductionType,
} from '../../../../generated/prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateCharacterDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  shortDescription?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  personality?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  appearanceGuidelines?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  voiceStyleGuidelines?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  generalGuidelines?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCharacterAssetDto {
  @IsEnum(NeoTrioCharacterAssetType) assetType!: NeoTrioCharacterAssetType;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(255) fileName!: string;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) fileSize!: number;
  @IsOptional() @IsUUID() previousAssetId?: string;
}

export class ApproveCharacterAssetDto {
  @IsOptional() @IsBoolean() isMasterAsset = false;
}

export class IdeaQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsEnum(NeoTrioIdeaType) ideaType?: NeoTrioIdeaType;
  @IsOptional() @IsEnum(NeoTrioIdeaStatus) status?: NeoTrioIdeaStatus;
  @IsOptional() @IsUUID() characterId?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  destination?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class CreateIdeaDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;
  @IsEnum(NeoTrioIdeaType) ideaType!: NeoTrioIdeaType;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  destination?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  trendReference?: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsUUID() marketingOpportunityId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  characterIds?: string[];
}

export class UpdateIdeaDto extends CreateIdeaDto {
  @IsOptional() declare title: string;
  @IsOptional() declare description: string;
  @IsOptional() declare ideaType: NeoTrioIdeaType;
}

export class CreateIdeaFromOpportunityDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(180) title?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;
  @IsOptional() @IsEnum(NeoTrioIdeaType) ideaType?: NeoTrioIdeaType;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  characterIds?: string[];
  @IsOptional() @IsUUID() assignedUserId?: string;
}

export class ProductionQueryDto {
  @IsOptional() @IsEnum(NeoTrioProductionStage) stage?: NeoTrioProductionStage;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsUUID() characterId?: string;
}

export class CreateProductionDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;
  @IsEnum(NeoTrioProductionType) productionType!: NeoTrioProductionType;
  @IsOptional() @IsUUID() ideaId?: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsUUID() seriesId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsDateString() plannedPublishAt?: string;
  @IsOptional() @IsEnum(MarketingPriority) priority?: MarketingPriority;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  characterIds?: string[];
}

export class UpdateProductionDto extends CreateProductionDto {
  @IsOptional() declare title: string;
  @IsOptional() declare productionType: NeoTrioProductionType;
  @IsOptional() declare ideaId: string;
}

export class AssignProductionDto {
  @IsUUID() userId!: string;
}
export class ProductionStageDto {
  @IsEnum(NeoTrioProductionStage) stage!: NeoTrioProductionStage;
}

export class CreateScriptDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  scriptText!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) notes?: string;
}

export class CreateProductionAssetDto {
  @IsEnum(NeoTrioProductionAssetType) assetType!: NeoTrioProductionAssetType;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(180) title?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(255) fileName!: string;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) fileSize!: number;
  @IsOptional() @IsUUID() previousAssetId?: string;
}

export class LinkContentDto {
  @IsOptional() @IsUUID() marketingContentId?: string;
}

export class PublishProductionDto {
  @IsEnum(MarketingChannel) channel!: MarketingChannel;
  @IsOptional() @IsUUID() publicationId?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  externalReference?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
}

export class LibraryQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsUUID() characterId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  characterIds?: string[];
  @IsOptional() @IsEnum(NeoTrioLibraryType) libraryType?: NeoTrioLibraryType;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  destination?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 40;
}

export class PerformanceQueryDto {
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class CreateSeriesDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  description?: string;
}

export class UpdateSeriesDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
