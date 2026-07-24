import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly prefix: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    cfg: ConfigService,
  ) {
    this.prefix = cfg.get<string>('REDIS_KEY_PREFIX') ?? 'fc:';
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * JSON-deserialized GET. Returns null on miss OR on any error (cache layer
   * must never throw at the caller — graceful degradation).
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(this.fullKey(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(
        `Redis get('${key}') failed: ${this.errMsg(err)} — treating as miss`,
      );
      return null;
    }
  }

  /**
   * JSON-serialized SET with optional TTL in seconds. Errors are swallowed
   * and logged at warn — caching is best-effort.
   */
  async set(
    key: string,
    value: unknown,
    ttlSec?: number,
  ): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (ttlSec !== undefined) {
        await this.client.set(this.fullKey(key), payload, 'EX', ttlSec);
      } else {
        await this.client.set(this.fullKey(key), payload);
      }
    } catch (err) {
      this.logger.warn(
        `Redis set('${key}') failed: ${this.errMsg(err)}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(this.fullKey(key));
    } catch (err) {
      this.logger.warn(
        `Redis del('${key}') failed: ${this.errMsg(err)}`,
      );
    }
  }

  /**
   * Cache-aside read. On miss, runs the loader, stores the result with
   * the given TTL (plus optional ±10% jitter), and returns it.
   */
  async getOrSet<T>(
    key: string,
    ttlSec: number,
    loader: () => Promise<T>,
    opts?: { jitter?: boolean },
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const fresh = await loader();
    const ttl = opts?.jitter ? this.jitter(ttlSec) : ttlSec;
    await this.set(key, fresh, ttl);
    return fresh;
  }

  /**
   * Acquire a short-lived lock for stampede protection. Uses SET NX EX.
   * Returns true if the lock was acquired, false if another holder owns it.
   */
  async tryLock(key: string, ttlSec: number): Promise<boolean> {
    const result = await this.client.set(
      this.fullKey(key),
      '1',
      'EX',
      ttlSec,
      'NX',
    );
    return result === 'OK';
  }

  async unlock(key: string): Promise<void> {
    await this.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // Best-effort. ioredis closes on its own when the process exits.
    }
  }

  // ─── private ───────────────────────────────────────────────────

  private fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private jitter(ttlSec: number): number {
    // ±10%: ttlSec * (0.9 + Math.random() * 0.2). Always ≥1s.
    return Math.max(1, Math.floor(ttlSec * (0.9 + Math.random() * 0.2)));
  }

  private errMsg(err: unknown): string {
    return err instanceof Error ? err.message : 'unknown';
  }
}