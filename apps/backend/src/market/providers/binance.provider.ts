import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as WebSocket from 'ws';
import { IMarketDataProvider } from './market-data-provider.interface';
import { CandleData } from './candle-data.type';

@Injectable()
export class BinanceProvider implements IMarketDataProvider {
  private readonly logger = new Logger(BinanceProvider.name);
  private readonly REST = 'https://api.binance.com/api/v3';
  private readonly WS = 'wss://stream.binance.com:9443/ws';

  constructor(private readonly httpService: HttpService) {}

  async getHistoricalOhlc(
    symbol: string,
    interval: string,
    from?: Date,
    to?: Date,
    limit = 200,
  ): Promise<CandleData[]> {
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.REST}/klines`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval,
          limit,
          ...(from && { startTime: from.getTime() }),
          ...(to && { endTime: to.getTime() }),
        },
      }),
    );

    return (data as any[][]).map((c) => ({
      timestamp: c[0],
      date: new Date(c[0]).toISOString(),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.REST}/ticker/price`, {
        params: { symbol: symbol.toUpperCase() },
      }),
    );
    return parseFloat(data.price);
  }

  streamCandles(
    symbol: string,
    interval: string,
    onCandle: (candle: CandleData) => void,
  ): () => void {
    const url = `${this.WS}/${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(url);

    ws.on('message', (raw: string) => {
      const parsed = JSON.parse(raw);
      const k = parsed.k;
      onCandle({
        timestamp: k.t,
        date: new Date(k.t).toISOString(),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isClosed: k.x,
      });
    });

    ws.on('error', (err) =>
      this.logger.error(`Binance WS error: ${err.message}`),
    );

    return () => {
      try {
        ws.close();
      } catch (_) {}
    };
  }
}
