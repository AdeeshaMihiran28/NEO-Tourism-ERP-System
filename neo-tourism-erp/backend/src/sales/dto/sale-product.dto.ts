import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  SaleProductCategory,
  SaleProductReferenceType,
} from '../../../generated/prisma/enums';

const moneyPattern = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export class SaleProductReferenceDto {
  @IsEnum(SaleProductReferenceType)
  type!: SaleProductReferenceType;

  @IsString()
  @MaxLength(500)
  value!: string;
}

export class SaveSaleProductDto {
  @IsOptional()
  @IsEnum(SaleProductCategory)
  category?: SaleProductCategory;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern, {
    message:
      'estimatedSupplierCost must be a valid non-negative amount with at most 2 decimal places.',
  })
  estimatedSupplierCost?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  pnrText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SaleProductReferenceDto)
  references?: SaleProductReferenceDto[];
}
