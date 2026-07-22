import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { Currency } from '@prisma/client';

export class CreatePortfolioDto {
  @ApiProperty({ example: 'Main Portfolio' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'My investment portfolio', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'USD',
    enum: Currency,
    default: Currency.USD,
    required: false,
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiProperty({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
