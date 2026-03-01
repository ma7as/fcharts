import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import * as WebSocket from 'ws';
import { IMarketDataProvider } from './market-data-provider.interface';
import { CandleData } from './candle-data.type';

/**
 * Finnhub provider — recommended for real-time US stocks (NASDAQ/NYSE / CEDEAR subyacentes).
 * WebSocket: wss://ws.finnhub.io
 * REST:      https://finnhub.io/api/v1
 * Free tier: 60 API calls/minute, 1 WS connection.
 * Set FINNHUB_API_KEY in environment variables.
 */
@Injectable()
export class FinnhubProvider implements IMarketDataProvider {
  private readonly logger = new Logger(FinnhubProvider.name);
  private readonly REST = 'https://finnhub.io/api/v1';
  private readonly WS_URL = 'wss://ws.finnhub.io';
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('FINNHUB_API_KEY') ?? '';
    if (!this.apiKey) {
      this.logger.warn(
        'FINNHUB_API_KEY not set — Finnhub provider will return empty data. ' +
        'Get a free key at https://finnhub.io/register',
      );
    }
  }

  private resolution(interval: string): string {
    const map: Record<string, string> = {
      '1m': '1',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '4h': 'H',
      '1d': 'D',
      '1w': 'W',
      '1mo': 'M',
    };
    return map[interval] ?? 'D';
  }

  async getHistoricalOhlc(
    symbol: string,
    interval: string,
    from?: Date,
    to?: Date,
    limit = 200,
  ): Promise<CandleData[]> {
    if (!this.apiKey) {
      this.logger.warn('FinnhubProvider: FINNHUB_API_KEY not set');
      return [];
    }

    const resolution = this.resolution(interval);
    const toTs = to ? Math.floor(to.getTime() / 1000) : Math.floor(Date.now() / 1000);

    // Approximate "from" from limit when not explicitly provided
    const intervalMs: Record<string, number> = {
      '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
      '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800,
    };
    const fromTs = from
      ? Math.floor(from.getTime() / 1000)
      : toTs - (intervalMs[interval] ?? 86400) * limit;

    const { data } = await firstValueFrom(
      this.httpService.get(`${this.REST}/stock/candle`, {
        params: {
          symbol,
          resolution,
          from: fromTs,
          to: toTs,
          token: this.apiKey,
        },
      }),
    );

    if (data.s === 'no_data' || !data.t) return [];

    const { t, o, h, l, c, v } = data as {
      t: number[];
      o: number[];
      h: number[];
      l: number[];
      c: number[];
      v: number[];
    };

    return t.map((ts, i) => ({
      timestamp: ts * 1000,
      date: new Date(ts * 1000).toISOString(),
      open: o[i],
      high: h[i],
      low: l[i],
      close: c[i],
      volume: v[i],
    }));
  }

  async getLatestPrice(symbol: string): Promise<number> {
    if (!this.apiKey) return 0;
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.REST}/quote`, {
        params: { symbol, token: this.apiKey },
      }),
    );
    return data.c ?? 0;
  }

  streamCandles(
    symbol: string,
    _interval: string,
    onCandle: (candle: CandleData) => void,
  ): () => void {
    if (!this.apiKey) {
      this.logger.warn('FinnhubProvider: no API key, streaming disabled');
      return () => {};
    }

    const ws = new WebSocket(`${this.WS_URL}?token=${this.apiKey}`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      this.logger.log(`Finnhub WS subscribed: ${symbol}`);
    });

    ws.on('message', (raw: string) => {
      const msg = JSON.parse(raw);
      if (msg.type !== 'trade' || !msg.data?.length) return;

      // Collect last trade tick as a pseudo-candle
      const last = msg.data[msg.data.length - 1];
      onCandle({
        timestamp: last.t,
        date: new Date(last.t).toISOString(),
        open: last.p,
        high: last.p,
        low: last.p,
        close: last.p,
        volume: last.v,
        isClosed: false,
      });
    });

    ws.on('error', (err) =>
      this.logger.error(`Finnhub WS error (${symbol}): ${err.message}`),
    );

    return () => {
      try {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        ws.close();
      } catch (_) {}
    };
  }
}
