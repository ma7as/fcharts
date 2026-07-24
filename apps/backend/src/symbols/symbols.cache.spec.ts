import { CacheService } from '../common/cache/cache.service';

describe('CacheService (Symbols stampede)', () => {
  it('jitterTtl() returns a value within ±10% of the input (AC-18)', () => {
    const { cache } = makeCache();
    for (let i = 0; i < 50; i++) {
      const out = cache.jitterTtl(300);
      expect(out).toBeGreaterThanOrEqual(270);
      expect(out).toBeLessThanOrEqual(330);
    }
  });

  it('jitterTtl() returns at least 1 second even for tiny inputs', () => {
    const { cache } = makeCache();
    expect(cache.jitterTtl(0)).toBeGreaterThanOrEqual(1);
    expect(cache.jitterTtl(1)).toBeGreaterThanOrEqual(1);
  });

  it('tryAcquireSymbolsLock delegates to redis.tryLock with the namespaced lock key (AC-19)', async () => {
    const { cache, redis } = makeCache();
    redis.tryLock.mockResolvedValue(true);
    const acquired = await cache.tryAcquireSymbolsLock('abc123def456');
    expect(acquired).toBe(true);
    expect(redis.tryLock).toHaveBeenCalledWith('lock:symbols:abc123def456', 5);
  });

  it('releaseSymbolsLock delegates to redis.unlock', async () => {
    const { cache, redis } = makeCache();
    redis.unlock.mockResolvedValue(undefined);
    await cache.releaseSymbolsLock('abc123def456');
    expect(redis.unlock).toHaveBeenCalledWith('lock:symbols:abc123def456');
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