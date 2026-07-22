import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { MarketService } from './market.service';
import { OhlcQueryDto } from './dto/ohlc-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ACCESS_TOKEN_COOKIE } from '../auth/constants';

// JWT guard at controller level — protects upstream provider quotas
// (AlphaVantage free tier = 25 req/day) from anonymous exhaustion.
@ApiTags('market')
@ApiBearerAuth('bearerAuth')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@ApiUnauthorizedResponse({ description: 'Missing or invalid auth token' })
@ApiBadRequestResponse({
  description:
    'Invalid query params: interval must be one of 1m|5m|15m|30m|1h|4h|1d|1w|1M, ' +
    'limit must be 1-1000, source must be binance|yahoo|alphavantage|finnhub|iol',
})
@UseGuards(JwtAuthGuard)
@Controller('api/v1/market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('ohlc')
  @ApiOperation({
    summary: 'Get OHLC candlestick data',
    description:
      'Returns up to `limit` candles for a symbol/interval. The response is ' +
      'served from the local Postgres cache when possible (>=90% of the ' +
      'requested range is already cached); otherwise the configured upstream ' +
      'provider (Binance, Yahoo, Finnhub, AlphaVantage, IOL) is called and ' +
      'results are persisted to the cache for next time.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns OHLC data with enriched metadata: market, currency, dataSource, cedearRatio.',
  })
  @ApiResponse({ status: 404, description: 'Symbol not found in the catalog' })
  @ApiResponse({ status: 503, description: 'Upstream provider unavailable' })
  async getOhlc(@Query() query: OhlcQueryDto) {
    return this.marketService.getOhlcData(query);
  }

  @Get('indicators')
  @ApiOperation({
    summary: 'Get OHLC data with moving average indicators',
    description:
      'Same as /ohlc but also computes simple moving averages for the periods ' +
      'in the `ma` query param (comma-separated, default 20,50).',
  })
  @ApiQuery({
    name: 'ma',
    required: false,
    example: '20,50,200',
    description: 'Comma-separated MA periods to compute',
  })
  @ApiResponse({ status: 200, description: 'OHLC + computed MAs' })
  async getIndicators(@Query() query: OhlcQueryDto) {
    const ohlcData = await this.marketService.getOhlcData(query);
    const rawPeriods = query.ma?.split(',').map((p) => Number(p.trim())) ?? [20, 50];
    const periods = rawPeriods.filter((p): p is number => Number.isFinite(p) && p > 0);

    const ma: Record<string, (number | null)[]> = {};
    periods.forEach((period) => {
      ma[period.toString()] = this.marketService.calculateMA(ohlcData.data, period);
    });

    return { ...ohlcData, ma };
  }

  @Get('ccl/:cedear')
  @ApiOperation({
    summary: 'Get implied CCL (Contado con Liquidación) derived from a CEDEAR pair',
    description:
      'Computes the implied CCL from a CEDEAR/underlying pair (ARS price / ' +
      '(USD price * cedearRatio)) for the last 90 daily candles.',
  })
  @ApiParam({
    name: 'cedear',
    example: 'AAPL',
    description: 'CEDEAR ticker as listed on BYMA (ARS side, e.g. AAPLD)',
  })
  @ApiResponse({ status: 200, description: 'CCL series with date, priceArs, priceUsd, ccl' })
  @ApiResponse({
    status: 400,
    description: 'Symbol is not a CEDEAR or missing underlyingSymbol/cedearRatio',
  })
  @ApiResponse({ status: 404, description: 'Underlying symbol not found' })
  async getCcl(@Param('cedear') cedear: string) {
    return this.marketService.getImpliedCcl(cedear);
  }
}
