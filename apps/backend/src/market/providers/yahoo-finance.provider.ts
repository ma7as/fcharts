import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IMarketDataProvider } from './market-data-provider.interface';
import { CandleData } from './candle-data.type';

/** Yahoo Finance v8 chart API — no API key required. */
@Injectable()
export class YahooFinanceProvider implements IMarketDataProvider {
  private readonly logger = new Logger(YahooFinanceProvider.name);
  private readonly BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

  // App interval → Yahoo interval
  private static readonly INTERVAL_MAP: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '1h', // Yahoo doesn't have 4h; use 1h
    '1d': '1d',
    '1w': '1wk',
    '1mo': '1mo',
  };

  constructor(private readonly httpService: HttpService) {}

  /** Derive Yahoo range string from interval + limit */
  private rangeFor(interval: string, limit: number): string {
    switch (interval) {
      case '1d':
        if (limit <= 30) return '1mo';
        if (limit <= 90) return '3mo';
        if (limit <= 365) return '1y';
        return '5y';
      case '1w':
        return limit <= 52 ? '1y' : '5y';
      case '1mo':
        return '5y';
      case '1h':
      case '4h':
        return '730d'; // max for hourly on Yahoo
      default:
        return '60d';
    }
  }

  async getHistoricalOhlc(
    symbol: string,
    interval: string,
    from?: Date,
    to?: Date,
    limit = 200,
  ): Promise<CandleData[]> {
    const yahooInterval = YahooFinanceProvider.INTERVAL_MAP[interval] ?? '1d';
    const params: Record<string, any> = { interval: yahooInterval };

    if (from && to) {
      params.period1 = Math.floor(from.getTime() / 1000);
      params.period2 = Math.floor(to.getTime() / 1000);
    } else {
      params.range = this.rangeFor(interval, limit);
    }

    const { data } = await firstValueFrom(
      this.httpService.get(`${this.BASE}/${encodeURIComponent(symbol)}`, {
        params,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
    );

    const result = data?.chart?.result?.[0];
    if (!result) {
      this.logger.warn(`Yahoo Finance: no data for ${symbol}`);
      return [];
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};

    return timestamps
      .map((ts, i) => ({
        timestamp: ts * 1000,
        date: new Date(ts * 1000).toISOString(),
        open: quote.open?.[i] ?? 0,
        high: quote.high?.[i] ?? 0,
        low: quote.low?.[i] ?? 0,
        close: quote.close?.[i] ?? 0,
        volume: quote.volume?.[i] ?? 0,
      }))
      .filter((c) => c.open > 0 && c.close > 0)
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
    // Yahoo Finance has no WebSocket — poll every 60 seconds
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
          this.logger.warn(`Yahoo poll error (${symbol}): ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, 60_000));
      }
    };

    poll();
    return () => {
      active = false;
    };
  }
}
