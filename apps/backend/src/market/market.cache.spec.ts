import { CacheService } from '../common/cache/cache.service';

describe('CacheService (OHLC)', () => {
  it('builds a stable cache key for the same args (AC-11)', () => {
    const { cache } = makeCache();
    const args = {
      symbol: 'BTCUSDT',
      interval: '1d',
      limit: 200,
      startTime: 1700000000000,
    };
    const key1 = cache.buildOhlcKey(args);
    const key2 = cache.buildOhlcKey(args);
    expect(key1).toBe(key2);
    expect(key1).toBe('cache:ohlc:BTCUSDT:1d:200:1700000000000');
  });

  it('produces a "now" bucket when startTime is omitted (AC-15)', () => {
    const { cache } = makeCache();
    const key1 = cache.buildOhlcKey({ symbol: 'BTCUSDT', interval: '1d', limit: 200 });
    const key2 = cache.buildOhlcKey({ symbol: 'BTCUSDT', interval: '1d', limit: 200 });
    expect(key1).toMatch(/^cache:ohlc:BTCUSDT:1d:200:now:\d+$/);
    expect(key1).toBe(key2);
  });

  it('getOhlc returns null and records a miss when Redis returns null', async () => {
    const { cache, redis, metrics } = makeCache();
    redis.get.mockResolvedValue(null);
    const result = await cache.getOhlc('cache:ohlc:foo');
    expect(result).toBeNull();
    expect(metrics.cacheMiss).toHaveBeenCalledWith('ohlc');
    expect(metrics.cacheHit).not.toHaveBeenCalled();
  });

  it('getOhlc returns the cached payload and records a hit', async () => {
    const { cache, redis, metrics } = makeCache();
    const payload = {
      symbol: 'BTCUSDT',
      interval: '1d',
      market: 'GLOBAL',
      currency: 'USD',
      dataSource: 'binance',
      underlyingSymbol: null,
      cedearRatio: null,
      data: [],
      count: 0,
    };
    // RedisService.get<T> calls JSON.parse internally, so the mock
    // should return the already-parsed payload (not the stringified
    // version).
    redis.get.mockResolvedValue(payload);
    const result = await cache.getOhlc('cache:ohlc:foo');
    expect(result).toEqual(payload);
    expect(metrics.cacheHit).toHaveBeenCalledWith('ohlc');
    expect(metrics.cacheMiss).not.toHaveBeenCalled();
  });

  it('setLastPrice and getLastPrice round-trip via Redis', async () => {
    const { cache, redis } = makeCache();
    // getLastPrice returns T | null after JSON.parse — for a number
    // payload the parsed value is just the number itself.
    redis.get.mockResolvedValue(42000.5);
    await cache.setLastPrice('BTCUSDT', 42000.5);
    expect(redis.set).toHaveBeenCalledWith('cache:px:BTCUSDT', 42000.5, 2);
    const out = await cache.getLastPrice('BTCUSDT');
    expect(out).toBe(42000.5);
  });
});

type RedisLike = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  tryLock: jest.Mock;
  unlock: jest.Mock;
};

type MetricsLike = {
  cacheHit: jest.Mock;
  cacheMiss: jest.Mock;
};

function makeCache() {
  const redis: RedisLike = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    tryLock: jest.fn(),
    unlock: jest.fn(),
  };
  const metrics: MetricsLike = {
    cacheHit: jest.fn(),
    cacheMiss: jest.fn(),
  };
  const cache = new CacheService(redis as never, metrics as never);
  return { cache, redis, metrics };
}
