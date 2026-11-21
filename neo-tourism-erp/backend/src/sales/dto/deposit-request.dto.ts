import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const moneyPattern = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export class CreateDepositRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  passengerCount!: number;

  @IsString()
  @Matches(moneyPattern, {
    message:
      'cancellationCost must be a valid non-negative GBP amount with at most 2 decimal places.',
  })
  cancellationCost!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  arrangementNotes?: string;
}

export class DecideDepositRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
