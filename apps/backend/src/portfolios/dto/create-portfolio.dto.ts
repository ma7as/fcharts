import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePortfolioDto {
  @ApiProperty({ example: 'Main Portfolio' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'My investment portfolio', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
