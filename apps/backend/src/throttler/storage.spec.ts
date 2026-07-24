import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

describe('ThrottlerStorageRedisService wiring', () => {
  it('instantiates without throwing when given a Redis client (AC-22, AC-23)', () => {
    const fakeRedis = {
      scriptLoad: jest.fn(),
      evalsha: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
      pttl: jest.fn(),
      pexpire: jest.fn(),
    };
    expect(
      () => new ThrottlerStorageRedisService(fakeRedis as never),
    ).not.toThrow();
  });
});