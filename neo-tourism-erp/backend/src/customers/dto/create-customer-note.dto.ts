import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCustomerNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
