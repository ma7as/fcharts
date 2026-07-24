import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';
import { CandleData } from '../../market/providers/candle-data.type';

export type OhlcCacheResponse = {
  symbol: string;
  interval: string;
  market: string;
  currency: string;
  dataSource: string;
  underlyingSymbol: string | null;
  cedearRatio: number | null;
  data: CandleData[];
  count: number;
};

export type PaginatedResultLike<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore?: boolean;
};

/**
 * Typed cache facade. Wraps RedisService with one method per cache
 * namespace (ohlc, symbols, px) so callers don't need to know the
 * key shape or TTL — that's the service's job.
 *
 * All read paths record hit/miss via MetricsService. All writes are silent
 * on success.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  // Defaults per design.md §4. Tuned via methods so PR3 can override
  // TTLs from config without touching call sites.
  private readonly ohlcTtlSec = 60;
  private readonly symbolsTtlSec = 300;
  private readonly pxTtlSec = 2;
  private readonly symbolsLockTtlSec = 5;

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  // ── OHLC ────────────────────────────────────────────────────────

  buildOhlcKey(args: {
    symbol: string;
    interval: string;
    limit: number;
    startTime?: number;
  }): string {
    const st =
      args.startTime !== undefined
        ? String(args.startTime)
        : `now:${Math.floor(Date.now() / 300_000)}`;
    return `cache:ohlc:${args.symbol}:${args.interval}:${args.limit}:${st}`;
  }

  async getOhlc(key: string): Promise<OhlcCacheResponse | null> {
    const hit = await this.redis.get<OhlcCacheResponse>(key);
    if (hit !== null) {
      this.metrics.cacheHit('ohlc');
      return hit;
    }
    this.metrics.cacheMiss('ohlc');
    return null;
  }

  async setOhlc(
    key: string,
    value: OhlcCacheResponse,
    ttlSec: number = this.ohlcTtlSec,
  ): Promise<void> {
    await this.redis.set(key, value, ttlSec);
  }

  // ── Symbols catalog ─────────────────────────────────────────────

  async getSymbols<T>(key: string): Promise<PaginatedResultLike<T> | null> {
    const hit = await this.redis.get<PaginatedResultLike<T>>(key);
    if (hit !== null) {
      this.metrics.cacheHit('symbols');
      return hit;
    }
    this.metrics.cacheMiss('symbols');
    return null;
  }

  async setSymbols<T>(
    key: string,
    value: PaginatedResultLike<T>,
    ttlSec: number = this.symbolsTtlSec,
  ): Promise<void> {
    // Caller (SymbolsService) computes its own jittered TTL via jitterTtl()
    // and passes it in here. We don't double-jitter inside this method.
    await this.redis.set(key, value, ttlSec);
  }

  /**
   * Stampede protection for the symbols catalog. A request that wins
   * the lock populates the cache; others see a miss and re-check.
   */
  async tryAcquireSymbolsLock(key: string): Promise<boolean> {
    return this.redis.tryLock(`lock:symbols:${key}`, this.symbolsLockTtlSec);
  }

  async releaseSymbolsLock(key: string): Promise<void> {
    await this.redis.unlock(`lock:symbols:${key}`);
  }

  // ── WS last-known-price ─────────────────────────────────────────

  async getLastPrice(symbol: string): Promise<number | null> {
    return this.redis.get<number>(`cache:px:${symbol}`);
  }

  async setLastPrice(
    symbol: string,
    price: number,
    ttlSec: number = this.pxTtlSec,
  ): Promise<void> {
    await this.redis.set(`cache:px:${symbol}`, price, ttlSec);
  }

  /**
   * Apply ±10% jitter to a TTL in seconds. Public so SymbolsService can
   * compute its own jittered TTL before calling setSymbols.
   */
  jitterTtl(ttlSec: number): number {
    return Math.max(1, Math.floor(ttlSec * (0.9 + Math.random() * 0.2)));
  }

  /**
   * Invalidate every cached symbols catalog page. Best-effort: if Redis
   * is down, the call swallows the error and returns 0.
   *
   * Used by the admin endpoint when a new symbol is added so the catalog
   * reflects the change immediately instead of waiting for the 5-min TTL.
   */
  async invalidateAllSymbols(): Promise<number> {
    try {
      // We use the underlying client (via RedisService) to enumerate keys.
      // The `KEYS` command is OK for low-cardinality namespaces like ours
      // (≤ a few hundred paginated queries at any time). For higher
      // cardinality, switch to `SCAN`.
      const keys = await this.redis.scan('cache:symbols:*');
      if (keys.length === 0) return 0;
      await this.redis.delMany(keys);
      return keys.length;
    } catch (err) {
      this.logger.warn(
        `invalidateAllSymbols failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return 0;
    }
  }
}