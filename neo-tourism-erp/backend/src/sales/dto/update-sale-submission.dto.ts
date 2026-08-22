import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/enums';

const moneyPattern = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export class UpdateSaleSubmissionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  destination?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  travelStartDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  travelEndDate?: string;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern, {
    message:
      'sellingPrice must be a valid non-negative amount with at most 2 decimal places.',
  })
  sellingPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern, {
    message:
      'depositAmount must be a valid non-negative amount with at most 2 decimal places.',
  })
  depositAmount?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter code.' })
  currency?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  salesNotes?: string;
}
