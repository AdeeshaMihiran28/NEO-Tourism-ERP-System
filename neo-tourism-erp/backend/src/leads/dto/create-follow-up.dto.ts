import {
  IsDateString,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FollowUpType } from '../../../generated/prisma/enums';

export class CreateFollowUpDto {
  @IsEnum(FollowUpType)
  type!: FollowUpType;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}
