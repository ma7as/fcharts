import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

type RedisMock = {
  ping: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  quit: jest.Mock;
};

function buildClient(): RedisMock {
  return {
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

describe('RedisService', () => {
  const cfg = {
    get: jest.fn((k: string) => (k === 'REDIS_KEY_PREFIX' ? 'fc:' : undefined)),
  } as unknown as ConfigService;

  function build() {
    const client = buildClient();
    const svc = new RedisService(client as never, cfg);
    return { svc, client };
  }

  it('ping() delegates to client.ping() and returns the response', async () => {
    const { svc, client } = build();
    client.ping.mockResolvedValue('PONG');
    await expect(svc.ping()).resolves.toBe('PONG');
    expect(client.ping).toHaveBeenCalledTimes(1);
  });

  it('get() JSON-parses and returns the value', async () => {
    const { svc, client } = build();
    client.get.mockResolvedValue(JSON.stringify({ hello: 'world' }));
    await expect(
      svc.get<{ hello: string }>('cache:foo'),
    ).resolves.toEqual({ hello: 'world' });
    expect(client.get).toHaveBeenCalledWith('fc:cache:foo');
  });

  it('get() returns null when the key is missing', async () => {
    const { svc, client } = build();
    client.get.mockResolvedValue(null);
    await expect(svc.get('cache:foo')).resolves.toBeNull();
  });

  it('get() swallows errors and returns null (graceful degradation)', async () => {
    const { svc, client } = build();
    client.get.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(svc.get('cache:foo')).resolves.toBeNull();
  });

  it('set() serializes to JSON and applies EX TTL when provided', async () => {
    const { svc, client } = build();
    client.set.mockResolvedValue('OK');
    await svc.set('cache:foo', { a: 1 }, 60);
    expect(client.set).toHaveBeenCalledWith(
      'fc:cache:foo',
      JSON.stringify({ a: 1 }),
      'EX',
      60,
    );
  });

  it('set() without TTL omits EX argument', async () => {
    const { svc, client } = build();
    client.set.mockResolvedValue('OK');
    await svc.set('cache:foo', { a: 1 });
    expect(client.set).toHaveBeenCalledWith(
      'fc:cache:foo',
      JSON.stringify({ a: 1 }),
    );
  });

  it('set() swallows errors and logs at warn level', async () => {
    const { svc, client } = build();
    client.set.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      svc.set('cache:foo', { a: 1 }, 60),
    ).resolves.toBeUndefined();
  });

  it('getOrSet() populates cache on miss and returns loader value', async () => {
    const { svc, client } = build();
    client.get.mockResolvedValue(null);
    client.set.mockResolvedValue('OK');
    const loader = jest.fn().mockResolvedValue({ fresh: true });
    const result = await svc.getOrSet('cache:foo', 60, loader);
    expect(result).toEqual({ fresh: true });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledTimes(1);
  });

  it('getOrSet() returns cached value on hit and skips the loader', async () => {
    const { svc, client } = build();
    client.get.mockResolvedValue(JSON.stringify({ cached: true }));
    const loader = jest.fn();
    const result = await svc.getOrSet('cache:foo', 60, loader);
    expect(result).toEqual({ cached: true });
    expect(loader).not.toHaveBeenCalled();
  });

  it('getOrSet() applies ±10% jitter when opts.jitter=true', async () => {
    const { svc, client } = build();
    client.get.mockResolvedValue(null);
    client.set.mockResolvedValue('OK');
    // 100s ±10% → expect ttl in [90, 110]. Mock Math.random to return 0 → ttl=90.
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    await svc.getOrSet('cache:foo', 100, async () => 1, { jitter: true });
    spy.mockRestore();
    const call = client.set.mock.calls[0];
    // call: ['fc:cache:foo', '1', 'EX', ttl]
    expect(call[0]).toBe('fc:cache:foo');
    expect(call[2]).toBe('EX');
    expect(call[3]).toBeGreaterThanOrEqual(90);
    expect(call[3]).toBeLessThanOrEqual(110);
  });

  it('tryLock() returns true when SET NX EX succeeds', async () => {
    const { svc, client } = build();
    client.set.mockResolvedValue('OK');
    await expect(svc.tryLock('lock:foo', 5)).resolves.toBe(true);
    expect(client.set).toHaveBeenCalledWith(
      'fc:lock:foo',
      '1',
      'EX',
      5,
      'NX',
    );
  });

  it('tryLock() returns false when SET NX EX is rejected (lock held)', async () => {
    const { svc, client } = build();
    client.set.mockResolvedValue(null);
    await expect(svc.tryLock('lock:foo', 5)).resolves.toBe(false);
  });

  it('unlock() delegates to del() with the prefixed key', async () => {
    const { svc, client } = build();
    client.del.mockResolvedValue(1);
    await svc.unlock('lock:foo');
    expect(client.del).toHaveBeenCalledWith('fc:lock:foo');
  });

  it('onModuleDestroy() calls quit()', async () => {
    const { svc, client } = build();
    await svc.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});