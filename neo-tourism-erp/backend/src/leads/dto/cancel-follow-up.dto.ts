import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelFollowUpDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
