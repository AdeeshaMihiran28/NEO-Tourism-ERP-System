import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  SalePaymentEntryStatus,
  SalePaymentMethod,
} from '../../../generated/prisma/enums';

const positiveMoneyPattern =
  /^(?!0+(?:\.0{1,2})?$)(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export class SaveSalePaymentEntryDto {
  @IsOptional()
  @IsEnum(SalePaymentMethod)
  method?: SalePaymentMethod;

  @IsOptional()
  @IsString()
  @Matches(positiveMoneyPattern, {
    message: 'amount must be greater than zero with at most 2 decimal places.',
  })
  amount?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transactionReference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsEnum(SalePaymentEntryStatus)
  status?: SalePaymentEntryStatus;
}

export class SaveSaleInstallmentDto {
  @IsOptional()
  @IsString()
  @Matches(positiveMoneyPattern, {
    message: 'amount must be greater than zero with at most 2 decimal places.',
  })
  amount?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
