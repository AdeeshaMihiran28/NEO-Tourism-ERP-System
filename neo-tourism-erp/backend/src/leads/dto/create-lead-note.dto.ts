import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateLeadNoteDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'content must contain meaningful text' })
  @MaxLength(5000)
  content!: string;
}
