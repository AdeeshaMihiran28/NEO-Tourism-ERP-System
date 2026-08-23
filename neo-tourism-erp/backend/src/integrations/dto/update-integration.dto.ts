import { IsBoolean } from 'class-validator';
export class UpdateIntegrationDto {
  @IsBoolean() isEnabled!: boolean;
}
