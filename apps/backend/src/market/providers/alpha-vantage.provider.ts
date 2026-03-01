import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { IMarketDataProvider } from './market-data-provider.interface';
import { CandleData } from './candle-data.type';

/**
 * Alpha Vantage provider.
 * Free tier: 25 requests/day. Candles are cached in PostgreSQL to avoid exhausting the quota.
 * Set ALPHA_VANTAGE_API_KEY in environment variables.
 */
@Injectable()
export class AlphaVantageProvider implements IMarketDataProvider {
  private readonly logger = new Logger(AlphaVantageProvider.name);
  private readonly BASE = 'https://www.alphavantage.co/query';
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('ALPHA_VANTAGE_API_KEY');
    if (!key || key === 'demo') {
      this.logger.warn(
        'ALPHA_VANTAGE_API_KEY not set — using demo key with limited/fake data. ' +
        'Get a free key at https://www.alphavantage.co/support/#api-key',
      );
    }
    this.apiKey = key || 'demo';
  }

  private resolveFunction(interval: string): { fn: string; avInterval?: string } {
    switch (interval) {
      case '1m':  return { fn: 'TIME_SERIES_INTRADAY', avInterval: '1min' };
      case '5m':  return { fn: 'TIME_SERIES_INTRADAY', avInterval: '5min' };
      case '15m': return { fn: 'TIME_SERIES_INTRADAY', avInterval: '15min' };
      case '30m': return { fn: 'TIME_SERIES_INTRADAY', avInterval: '30min' };
      case '1h':
      case '4h':  return { fn: 'TIME_SERIES_INTRADAY', avInterval: '60min' };
      case '1w':  return { fn: 'TIME_SERIES_WEEKLY' };
      case '1mo': return { fn: 'TIME_SERIES_MONTHLY' };
      default:    return { fn: 'TIME_SERIES_DAILY' };
    }
  }

  async getHistoricalOhlc(
    symbol: string,
    interval: string,
    _from?: Date,
    _to?: Date,
    limit = 200,
  ): Promise<CandleData[]> {
    const { fn, avInterval } = this.resolveFunction(interval);
    const params: Record<string, any> = {
      function: fn,
      symbol,
      outputsize: limit > 100 ? 'full' : 'compact',
      apikey: this.apiKey,
    };
    if (avInterval) params.interval = avInterval;

    const { data } = await firstValueFrom(
      this.httpService.get(this.BASE, { params }),
    );

    const seriesKey = Object.keys(data).find((k) => k.startsWith('Time Series'));
    if (!seriesKey) {
      this.logger.warn(
        `AlphaVantage: no data for ${symbol}. ` +
          `Response snippet: ${JSON.stringify(data).substring(0, 200)}`,
      );
      return [];
    }

    const series = data[seriesKey] as Record<string, Record<string, string>>;

    return Object.entries(series)
      .map(([dateStr, v]) => ({
        timestamp: new Date(dateStr).getTime(),
        date: new Date(dateStr).toISOString(),
        open: parseFloat(v['1. open']),
        high: parseFloat(v['2. high']),
        low: parseFloat(v['3. low']),
        close: parseFloat(v['4. close']),
        volume: parseFloat(v['5. volume'] ?? '0'),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const candles = await this.getHistoricalOhlc(symbol, '1d', undefined, undefined, 1);
    return candles.at(-1)?.close ?? 0;
  }

  streamCandles(
    symbol: string,
    interval: string,
    onCandle: (candle: CandleData) => void,
  ): () => void {
    // AlphaVantage has no WebSocket — poll every 5 min to respect free-tier rate limits
    let active = true;

    const poll = async () => {
      while (active) {
        try {
          const candles = await this.getHistoricalOhlc(
            symbol, interval, undefined, undefined, 1,
          );
          if (candles.length > 0) {
            onCandle({ ...candles.at(-1)!, isClosed: false });
          }
        } catch (e: any) {
          this.logger.warn(`AlphaVantage poll error (${symbol}): ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, 300_000)); // 5 min
      }
    };

    poll();
    return () => {
      active = false;
    };
  }
}
