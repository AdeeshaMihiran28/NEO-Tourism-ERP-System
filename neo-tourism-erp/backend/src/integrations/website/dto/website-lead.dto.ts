import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class WebsiteLeadDto {
  @IsString() @IsNotEmpty() @MaxLength(80) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) lastName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) destination?: string;
  @IsOptional() @IsDateString() travelDate?: string;
  @IsOptional() @IsString() @MaxLength(3000) message?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsString() @IsNotEmpty() @MaxLength(200) externalReference!: string;
  @IsOptional() @IsString() @MaxLength(80) campaignCode?: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsString() @MaxLength(80) dealCode?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsString() @MaxLength(80) contentCode?: string;
  @IsOptional() @IsUUID() contentId?: string;
  @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(180) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(180) utmContent?: string;
  @IsOptional() @IsString() @MaxLength(200) externalCampaignReference?: string;
}
