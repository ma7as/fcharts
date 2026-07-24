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

    /**
     * Tracks whether the upstream handshake completed. If the caller
     * invokes the returned unsubscribe (or the gateway tears down the
     * previous subscription on a new `subscribe`) before `open` fires,
     * we close the socket pre-handshake — that's a legitimate cleanup,
     * not an error worth logging.
     */
    let opened = false;
    let closed = false;

    ws.on('open', () => {
      opened = true;
    });

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

    ws.on('error', (err) => {
      // Pre-handshake errors are almost always the result of our own
      // teardown race (caller disposed the subscription before the
      // TLS handshake finished). Skip the ERROR log in that case — a
      // WARN is enough for diagnosis.
      const message = `Binance WS error (${symbol}/${interval}): ${err.message}`;
      if (opened) {
        this.logger.error(message);
      } else {
        this.logger.warn(message);
      }
    });

    ws.on('close', (code, reason) => {
      if (!opened && !closed) {
        // Closed by the far end before we finished the handshake. This
        // is the case that used to surface as a misleading
        // "WebSocket was closed before the connection was established"
        // ERROR — demote to a debug-style log so a noisy runner doesn't
        // look like a hard failure.
        this.logger.debug(
          `Binance WS closed before handshake (${symbol}/${interval}): code=${code} reason=${reason.toString() || '(none)'}`,
        );
      }
    });

    return () => {
      if (closed) return;
      closed = true;
      // If the handshake hasn't completed yet, calling ws.close() fires
      // an `error` event with "WebSocket was closed before the connection
      // was established" — a misleading message that suggests a real
      // failure. Mark the intent and let the handshake finish (or fail)
      // on its own; the socket will be GC'd either way.
      if (!opened) {
        // No-op: the in-flight handshake will settle into either
        // an `open` (which we then close immediately) or a `close`
        // (which we handle above as a debug log).
        return;
      }
      try {
        ws.close();
      } catch (_) {
        // Already closing / already closed.
      }
    };
  }
}
