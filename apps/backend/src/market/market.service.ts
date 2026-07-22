import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { OhlcQueryDto } from './dto/ohlc-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataRegistry } from './providers/market-data-registry.service';
import { CandleData } from './providers/candle-data.type';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: MarketDataRegistry,
  ) {}

  async getOhlcData(query: OhlcQueryDto) {
    try {
      // 1. Resolve symbol metadata from DB
      const symbolRecord = await this.prisma.symbol.findUnique({
        where: { symbol: query.symbol },
      });

      const dataSource = query.source ?? symbolRecord?.dataSource ?? 'binance';
      const provider = this.registry.getProvider(dataSource);

      // 2. Return from DB cache when sufficiently populated (≥90% of requested limit)
      if (symbolRecord) {
        const sinceMs =
          query.startTime ??
          Date.now() - this.lookbackMs(query.interval ?? '1d', query.limit ?? 200);

        const cached = await this.prisma.candle.findMany({
          where: {
            symbolId: symbolRecord.id,
            interval: query.interval ?? '1d',
            timestamp: { gte: new Date(sinceMs) },
          },
          orderBy: { timestamp: 'asc' },
          take: query.limit ?? 200,
        });

        if (cached.length >= Math.floor((query.limit ?? 200) * 0.9)) {
          return this.buildResponse(query, symbolRecord, cached.map(this.dbToCandle));
        }
      }

      // 3. Fetch from external provider
      const from = query.startTime ? new Date(query.startTime) : undefined;
      const to = query.endTime ? new Date(query.endTime) : undefined;
      const candles = await provider.getHistoricalOhlc(
        query.symbol,
        query.interval ?? '1d',
        from,
        to,
        query.limit ?? 200,
      );

      // 4. Persist new candles to DB cache
      if (symbolRecord && candles.length > 0) {
        await this.prisma.candle.createMany({
          data: candles.map((c) => ({
            symbolId: symbolRecord.id,
            interval: query.interval ?? '1d',
            timestamp: new Date(c.timestamp),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          })),
          skipDuplicates: true,
        });
      }

      return this.buildResponse(query, symbolRecord, candles);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching market data: ${message}`);
      // Generic message to the client — internal details (upstream error bodies,
      // network addresses, stack frames) must never reach the response.
      throw new HttpException(
        'Market data is temporarily unavailable',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Compute implied CCL for a CEDEAR by comparing ARS vs USD prices. */
  async getImpliedCcl(cedearSymbol: string) {
    const cedear = await this.prisma.symbol.findFirst({
      where: { symbol: cedearSymbol, type: 'cedear' },
    });
    if (!cedear || !cedear.underlyingSymbol || !cedear.cedearRatio) {
      throw new HttpException(
        `Symbol ${cedearSymbol} is not a CEDEAR or is missing underlyingSymbol/cedearRatio`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const underlying = await this.prisma.symbol.findFirst({
      where: { symbol: cedear.underlyingSymbol, type: 'cedear_underlying' },
    });
    if (!underlying) {
      throw new HttpException(
        `Underlying symbol ${cedear.underlyingSymbol} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // Fetch last 90 daily candles for each
    const [arsCandles, usdCandles] = await Promise.all([
      this.getOhlcData({ symbol: cedear.symbol, interval: '1d', limit: 90 }),
      this.getOhlcData({ symbol: underlying.symbol, interval: '1d', limit: 90 }),
    ]);

    // Align by date and compute CCL = PriceARS / (PriceUSD * ratio)
    const usdMap = new Map<string, number>(
      usdCandles.data.map((c: CandleData) => [c.date.split('T')[0], c.close]),
    );

    const cclSeries = arsCandles.data
      .map((c: CandleData) => {
        const dateKey = c.date.split('T')[0];
        const usdClose = usdMap.get(dateKey);
        if (!usdClose) return null;
        const ccl = c.close / (usdClose * cedear.cedearRatio!);
        return { date: dateKey, priceArs: c.close, priceUsd: usdClose, ccl: +ccl.toFixed(2) };
      })
      .filter(Boolean);

    return {
      cedear: cedear.symbol,
      underlying: underlying.symbol,
      ratio: cedear.cedearRatio,
      series: cclSeries,
    };
  }

  calculateMA(data: CandleData[], period: number): (number | null)[] {
    const closes = data.map((d) => d.close);
    const ma: (number | null)[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) {
        ma.push(null);
      } else {
        const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        ma.push(+(sum / period).toFixed(4));
      }
    }
    return ma;
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private buildResponse(query: OhlcQueryDto, symbolRecord: any, data: CandleData[]) {
    return {
      symbol: query.symbol,
      interval: query.interval ?? '1d',
      market: symbolRecord?.market ?? 'GLOBAL',
      currency: symbolRecord?.currency ?? 'USD',
      dataSource: symbolRecord?.dataSource ?? 'binance',
      underlyingSymbol: symbolRecord?.underlyingSymbol ?? null,
      cedearRatio: symbolRecord?.cedearRatio ?? null,
      data,
      count: data.length,
    };
  }

  private dbToCandle(c: any): CandleData {
    return {
      timestamp: (c.timestamp as Date).getTime(),
      date: (c.timestamp as Date).toISOString(),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    };
  }

  private lookbackMs(interval: string, limit: number): number {
    const unitMs: Record<string, number> = {
      '1m': 60_000,
      '5m': 300_000,
      '15m': 900_000,
      '30m': 1_800_000,
      '1h': 3_600_000,
      '4h': 14_400_000,
      '1d': 86_400_000,
      '1w': 604_800_000,
    };
    return (unitMs[interval] ?? 86_400_000) * limit;
  }
}
