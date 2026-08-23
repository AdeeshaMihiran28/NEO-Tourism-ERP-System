import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReopenBookingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
