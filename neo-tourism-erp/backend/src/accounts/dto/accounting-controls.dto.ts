import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TaxClassification } from '../../../generated/prisma/enums';
import { IsEnum } from 'class-validator';

const currency = /^[A-Za-z]{3}$/;
const positiveRate = /^(0*[0-9]*[1-9][0-9]*)(\.\d{1,8})?$|^0*\.0*[1-9]\d{0,7}$/;
const percentage = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;

export class UpdateAccountingSettingDto {
  @IsString() @Matches(currency) baseCurrency!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) fiscalYearStartMonth!: number;
}

export class CreateExchangeRateDto {
  @IsString() @Matches(currency) fromCurrency!: string;
  @IsString() @Matches(currency) toCurrency!: string;
  @IsString() @Matches(positiveRate) rate!: string;
  @IsDateString({ strict: true }) effectiveDate!: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) source?: string;
}

export class UpdateExchangeRateDto {
  @IsOptional() @IsString() @Matches(positiveRate) rate?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) source?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateTaxCodeDto {
  @IsString() @IsNotEmpty() @MaxLength(30) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsString() @Matches(percentage) rate!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) taxType!: string;
  @IsEnum(TaxClassification) classification!: TaxClassification;
  @IsDateString({ strict: true }) effectiveFrom!: string;
  @IsOptional() @IsBoolean() isRecoverable?: boolean;
  @IsOptional() @IsUUID() glAccountId?: string;
}

export class UpdateTaxCodeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @Matches(percentage) rate?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) taxType?: string;
  @IsOptional() @IsEnum(TaxClassification) classification?: TaxClassification;
  @IsOptional() @IsDateString({ strict: true }) effectiveFrom?: string;
  @IsOptional() @IsBoolean() isRecoverable?: boolean;
  @IsOptional() @IsUUID() glAccountId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateAccountingPeriodDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsDateString({ strict: true }) startDate!: string;
  @IsDateString({ strict: true }) endDate!: string;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2200) fiscalYear!: number;
}

export class ClosePeriodDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class AccountingReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export class ReportDateQueryDto {
  @IsOptional() @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) dateTo?: string;
  @IsOptional() @IsDateString({ strict: true }) asOf?: string;
}

export class PartyStatementQueryDto extends ReportDateQueryDto {
  @IsUUID() partyId!: string;
}
