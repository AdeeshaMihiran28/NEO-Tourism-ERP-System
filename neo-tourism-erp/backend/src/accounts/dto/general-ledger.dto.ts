import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  AccountingMappingType,
  GlAccountType,
  JournalStatus,
} from '../../../generated/prisma/enums';

const money = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;
const currency = /^[A-Za-z]{3}$/;

export class CreateGlAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(30) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsEnum(GlAccountType) type!: GlAccountType;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class UpdateGlAccountDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsEnum(GlAccountType) type?: GlAccountType;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateAccountingMappingDto {
  @IsUUID() accountId!: string;
}

export class JournalLineDto {
  @IsUUID() accountId!: string;
  @IsString() @Matches(money) debit!: string;
  @IsString() @Matches(money) credit!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() companyBankAccountId?: string;
}

export class CreateManualJournalDto {
  @IsDateString({ strict: true }) journalDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) description!: string;
  @IsString() @Matches(currency) currency!: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class UpdateManualJournalDto extends CreateManualJournalDto {}

export class JournalQueryDto {
  @IsOptional() @IsEnum(JournalStatus) status?: JournalStatus;
  @IsOptional() @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) dateTo?: string;
  @IsOptional() @IsUUID() bookingId?: string;
}

export class LedgerQueryDto {
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() journalId?: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() companyBankAccountId?: string;
  @IsOptional() @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) dateTo?: string;
}

export class TrialBalanceQueryDto {
  @IsOptional() @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) dateTo?: string;
}

export class JournalReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export { AccountingMappingType };
