import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
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
import {
  AccountsStatus,
  BookingAdjustmentType,
  DiscrepancyStatus,
  DiscrepancyType,
  PassengerPaymentStatus,
  PaymentMethod,
  SupplierPaymentStatus,
} from '../../../generated/prisma/enums';

const positiveMoney =
  /^(0*[0-9]*[1-9][0-9]*)(\.\d{1,2})?$|^0*\.((0?[1-9])|([1-9][0-9]))$/;
const signedMoney = /^-?(0|[1-9]\d{0,9})(\.\d{1,2})?$/;
const currency = /^[A-Za-z]{3}$/;

export class AccountsQueueQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(30) folderNumber?: string;
  @IsOptional() @IsString() @MaxLength(150) customer?: string;
  @IsOptional() @IsUUID() salesAdvisorId?: string;
  @IsOptional() @IsEnum(AccountsStatus) status?: AccountsStatus;
  @IsOptional() @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) dateTo?: string;
}

export class CreatePassengerPaymentDto {
  @IsString() @Matches(positiveMoney) amount!: string;
  @IsString() @Matches(currency) currency!: string;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(200) paymentReference?: string;
  @IsDateString({ strict: true }) paymentDate!: string;
  @IsOptional() @IsEnum(PassengerPaymentStatus) status?: PassengerPaymentStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdatePassengerPaymentDto {
  @IsOptional() @IsString() @Matches(positiveMoney) amount?: string;
  @IsOptional() @IsString() @Matches(currency) currency?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(200) paymentReference?: string;
  @IsOptional() @IsDateString({ strict: true }) paymentDate?: string;
  @IsOptional() @IsEnum(PassengerPaymentStatus) status?: PassengerPaymentStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateSupplierPaymentDto {
  @IsUUID() bookingSupplierId!: string;
  @IsString() @Matches(positiveMoney) amount!: string;
  @IsString() @Matches(currency) currency!: string;
  @IsOptional() @IsString() @MaxLength(200) paymentReference?: string;
  @IsDateString({ strict: true }) paymentDate!: string;
  @IsOptional() @IsEnum(SupplierPaymentStatus) status?: SupplierPaymentStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateSupplierPaymentDto {
  @IsOptional() @IsUUID() bookingSupplierId?: string;
  @IsOptional() @IsString() @Matches(positiveMoney) amount?: string;
  @IsOptional() @IsString() @Matches(currency) currency?: string;
  @IsOptional() @IsString() @MaxLength(200) paymentReference?: string;
  @IsOptional() @IsDateString({ strict: true }) paymentDate?: string;
  @IsOptional() @IsEnum(SupplierPaymentStatus) status?: SupplierPaymentStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateAdjustmentDto {
  @IsEnum(BookingAdjustmentType) type!: BookingAdjustmentType;
  @IsString() @Matches(signedMoney) amount!: string;
  @IsString() @Matches(currency) currency!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export class UpdateReconciliationDto {
  @IsOptional() @IsBoolean() passengerPaymentsVerified?: boolean;
  @IsOptional() @IsBoolean() supplierCostsVerified?: boolean;
  @IsOptional() @IsBoolean() supplierPaymentsVerified?: boolean;
  @IsOptional() @IsBoolean() sellingPriceVerified?: boolean;
  @IsOptional() @IsBoolean() feesVerified?: boolean;
  @IsOptional() @IsBoolean() adjustmentsVerified?: boolean;
  @IsOptional() @IsBoolean() profitVerified?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateDiscrepancyDto {
  @IsEnum(DiscrepancyType) type!: DiscrepancyType;
  @IsString() @IsNotEmpty() @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @Matches(signedMoney) amountDifference?: string;
  @IsOptional() @IsString() @Matches(currency) currency?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
}

export class ResolveDiscrepancyDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) resolutionNotes!: string;
}

export class DiscrepancyQueryDto extends AccountsQueueQueryDto {
  @IsOptional()
  @IsEnum(DiscrepancyStatus)
  discrepancyStatus?: DiscrepancyStatus;
}
