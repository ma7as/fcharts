import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { MarketService } from './market.service';
import { OhlcQueryDto } from './dto/ohlc-query.dto';

@ApiTags('market')
@Controller('api/v1/market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('ohlc')
  @ApiOperation({ summary: 'Get OHLC candlestick data' })
  @ApiResponse({
    status: 200,
    description:
      'Returns OHLC data with enriched metadata: market, currency, dataSource, cedearRatio.',
  })
  async getOhlc(@Query() query: OhlcQueryDto) {
    return this.marketService.getOhlcData(query);
  }

  @Get('indicators')
  @ApiOperation({ summary: 'Get OHLC data with moving average indicators' })
  async getIndicators(@Query() query: OhlcQueryDto) {
    const ohlcData = await this.marketService.getOhlcData(query);
    const periods = query.ma?.split(',').map(Number) ?? [20, 50];

    const ma: Record<string, number[]> = {};
    periods.forEach((period) => {
      ma[period.toString()] = this.marketService.calculateMA(ohlcData.data, period);
    });

    return { ...ohlcData, ma };
  }

  @Get('ccl/:cedear')
  @ApiOperation({
    summary: 'Get implied CCL (Contado con Liquidación) derived from a CEDEAR pair',
  })
  @ApiParam({
    name: 'cedear',
    example: 'AAPL',
    description: 'CEDEAR ticker as listed on BYMA (ARS side)',
  })
  async getCcl(@Param('cedear') cedear: string) {
    return this.marketService.getImpliedCcl(cedear);
  }
}
