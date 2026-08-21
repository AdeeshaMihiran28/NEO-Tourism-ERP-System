import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateLeadDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  destination?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  travelDate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  summary?: string;
}
