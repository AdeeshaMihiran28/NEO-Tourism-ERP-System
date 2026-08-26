import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  MarketingCalendarEntryType,
  MarketingCalendarSource,
  MarketingCalendarStatus,
  MarketingChannel,
} from '../../../../generated/prisma/client';

export class CalendarQueryDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional()
  @IsEnum(MarketingCalendarEntryType)
  entryType?: MarketingCalendarEntryType;
  @IsOptional() @IsEnum(MarketingChannel) channel?: MarketingChannel;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional()
  @IsEnum(MarketingCalendarStatus)
  status?: MarketingCalendarStatus;
  @IsOptional()
  @IsEnum(MarketingCalendarSource)
  source?: MarketingCalendarSource;
}

export class CreateCalendarEntryDto {
  @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsEnum(MarketingCalendarEntryType) entryType!: MarketingCalendarEntryType;
  @IsDateString() startAt!: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() allDay?: boolean;
  @IsOptional()
  @IsEnum(MarketingCalendarStatus)
  status?: MarketingCalendarStatus;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsEnum(MarketingChannel) channel?: MarketingChannel;
}

export class UpdateCalendarEntryDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional()
  @IsEnum(MarketingCalendarEntryType)
  entryType?: MarketingCalendarEntryType;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() allDay?: boolean;
  @IsOptional()
  @IsEnum(MarketingCalendarStatus)
  status?: MarketingCalendarStatus;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsEnum(MarketingChannel) channel?: MarketingChannel;
}

export class RescheduleCalendarEntryDto {
  @IsDateString() startAt!: string;
  @IsOptional() @IsDateString() endAt?: string;
}
