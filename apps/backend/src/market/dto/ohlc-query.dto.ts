import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class OhlcQueryDto {
  @ApiProperty({ example: 'BTCUSDT', description: 'Trading pair / ticker symbol' })
  @IsString()
  symbol: string;

  @ApiProperty({ example: '1h', description: 'Candle interval', required: false })
  @IsString()
  @IsOptional()
  interval?: string = '1h';

  @ApiProperty({ example: 200, description: 'Number of candles to return', required: false })
  @IsInt()
  @Min(1)
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
      'Override the data source for this request. ' +
      'Options: binance | yahoo | alphavantage | finnhub | iol. ' +
      'Defaults to the dataSource stored in the Symbol record.',
    required: false,
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({
    example: '20,50',
    description: 'Moving average periods (comma-separated)',
    required: false,
  })
  @IsString()
  @IsOptional()
  ma?: string;
}
