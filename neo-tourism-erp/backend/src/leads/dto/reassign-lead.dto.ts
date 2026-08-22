import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ReassignLeadDto {
  @IsUUID()
  newAssignedUserId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
