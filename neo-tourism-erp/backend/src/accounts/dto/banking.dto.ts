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
  BankAccountType,
  BankTransactionDirection,
  BankTransactionSource,
} from '../../../generated/prisma/enums';

const positiveMoney =
  /^(0*[0-9]*[1-9][0-9]*)(\.\d{1,2})?$|^0*\.((0?[1-9])|([1-9][0-9]))$/;
const signedMoney = /^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/;
const currency = /^[A-Za-z]{3}$/;

export class CreateBankAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(150) bankName!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) accountName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) accountNumber!: string;
  @IsString() @Matches(currency) currency!: string;
  @IsOptional() @IsString() @MaxLength(150) branch?: string;
  @IsOptional() @IsEnum(BankAccountType) accountType?: BankAccountType;
  @IsOptional() @IsString() @Matches(signedMoney) openingBalance?: string;
  @IsOptional() @IsUUID() glAccountId?: string;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) bankName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) accountName?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  accountNumber?: string;
  @IsOptional() @IsString() @Matches(currency) currency?: string;
  @IsOptional() @IsString() @MaxLength(150) branch?: string;
  @IsOptional() @IsEnum(BankAccountType) accountType?: BankAccountType;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsUUID() glAccountId?: string;
}

export class CreateManualBankTransactionDto {
  @IsDateString({ strict: true }) transactionDate!: string;
  @IsString() @Matches(positiveMoney) amount!: string;
  @IsEnum(BankTransactionDirection) direction!: BankTransactionDirection;
  @IsEnum(BankTransactionSource) sourceType!: BankTransactionSource;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) description!: string;
}

export class CreateBankTransferDto {
  @IsUUID() sourceAccountId!: string;
  @IsUUID() destinationAccountId!: string;
  @IsDateString({ strict: true }) transactionDate!: string;
  @IsString() @Matches(positiveMoney) amount!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) reference!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class CreateBankStatementDto {
  @IsUUID() companyBankAccountId!: string;
  @IsDateString({ strict: true }) periodStart!: string;
  @IsDateString({ strict: true }) periodEnd!: string;
  @IsString() @Matches(signedMoney) openingBalance!: string;
  @IsString() @Matches(signedMoney) closingBalance!: string;
}

export class StatementTransactionDto {
  @IsDateString({ strict: true }) transactionDate!: string;
  @IsOptional() @IsDateString({ strict: true }) valueDate?: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) description!: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsString() @Matches(positiveMoney) amount!: string;
  @IsEnum(BankTransactionDirection) direction!: BankTransactionDirection;
  @IsOptional() @IsString() @Matches(signedMoney) balance?: string;
}

export class ImportStatementTransactionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StatementTransactionDto)
  rows!: StatementTransactionDto[];
}

export class MatchBankTransactionDto {
  @IsUUID() erpBankTransactionId!: string;
}

export class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}
