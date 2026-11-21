import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export class CreateQuotationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  itinerary!: string;

  @Matches(MONEY_PATTERN)
  netFare!: string;

  @Matches(MONEY_PATTERN)
  quotedSellingFare!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
