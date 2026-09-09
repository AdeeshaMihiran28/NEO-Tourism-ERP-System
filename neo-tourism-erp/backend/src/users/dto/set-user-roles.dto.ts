import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
