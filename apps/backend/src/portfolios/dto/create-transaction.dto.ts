import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum, IsOptional, IsDateString } from 'class-validator';

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND',
  SPLIT = 'SPLIT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export class CreateTransactionDto {
  @ApiProperty({ example: 'clx123abc...' })
  @IsString()
  symbolId: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.BUY })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 1.5 })
  @IsNumber()
  quantity: number;

  @ApiProperty({ example: 45000 })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 10, required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  fees?: number;

  @ApiProperty({ example: 'Bought BTC on dip', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: '2024-01-15T10:30:00Z', required: false })
  @IsOptional()
  @IsDateString()
  executedAt?: string;
}
