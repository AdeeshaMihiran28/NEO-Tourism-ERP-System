import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateLeadDto {
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

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  salesNotes?: string;

  @IsOptional()
  @IsDateString()
  nextActionAt?: string;
}
