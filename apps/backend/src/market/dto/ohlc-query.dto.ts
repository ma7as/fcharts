import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const ALLOWED_INTERVALS = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
] as const;
export type AllowedInterval = (typeof ALLOWED_INTERVALS)[number];

export const ALLOWED_SOURCES = [
  'binance',
  'yahoo',
  'alphavantage',
  'finnhub',
  'iol',
] as const;
export type AllowedSource = (typeof ALLOWED_SOURCES)[number];

export class OhlcQueryDto {
  @ApiProperty({ example: 'BTCUSDT', description: 'Trading pair / ticker symbol' })
  @IsString()
  symbol!: string;

  @ApiProperty({
    example: '1h',
    description: `Candle interval. Allowed: ${ALLOWED_INTERVALS.join(', ')}`,
    required: false,
  })
  @IsString()
  @IsIn(ALLOWED_INTERVALS as readonly string[])
  @IsOptional()
  interval?: AllowedInterval = '1h';

  @ApiProperty({
    example: 200,
    description: 'Number of candles to return (1-1000)',
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 200;

  @ApiProperty({ description: 'Start timestamp (ms)', required: false })
  @IsOptional()
  @Type(() => Number)
  startTime?: number;

  @ApiProperty({ description: 'End timestamp (ms)', required: false })
  @IsOptional()
  @Type(() => Number)
  endTime?: number;

  @ApiProperty({
    example: 'finnhub',
    description:
      `Override the data source for this request. ` +
      `Allowed: ${ALLOWED_SOURCES.join(', ')}. ` +
      `Defaults to the dataSource stored in the Symbol record.`,
    required: false,
  })
  @IsString()
  @IsIn(ALLOWED_SOURCES as readonly string[])
  @IsOptional()
  source?: AllowedSource;

  @ApiProperty({
    example: '20,50',
    description: 'Moving average periods (comma-separated)',
    required: false,
  })
  @IsString()
  @IsOptional()
  ma?: string;
}
