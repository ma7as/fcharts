import {
  Global,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';
import { RedisPingCron } from './redis-ping.cron';
import { MetricsStubModule } from '../common/metrics/metrics.stub.module';

@Global()
@Module({
  imports: [MetricsStubModule],
  providers: [
    RedisService,
    RedisPingCron,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        if (!url) {
          throw new Error(
            'REDIS_URL is required. Set it in your .env file (e.g. redis://localhost:8103).',
          );
        }
        return new Redis(url, {
          // ioredis defaults: maxRetriesPerRequest=20, enableReadyCheck=true,
          // exponential reconnect backoff 100ms..3000ms. Acceptable for v1.
          keyPrefix: undefined, // prefix applied at RedisService boundary
          lazyConnect: false,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(RedisModule.name);

  constructor(
    private readonly redis: RedisService,
    private readonly cfg: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const url = this.cfg.get<string>('REDIS_URL') ?? '';
    const redacted = url.replace(/:[^:@/]+@/, ':***@');
    const required = this.cfg.get<string>('REDIS_REQUIRED') === 'true';
    try {
      await this.redis.ping();
      this.logger.log(`Redis connected: ${redacted}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (required) {
        this.logger.error(
          `Redis unreachable at ${redacted} and REDIS_REQUIRED=true — refusing to start: ${msg}`,
        );
        throw err;
      }
      this.logger.warn(
        `Redis unreachable at ${redacted} — continuing without cache (REDIS_REQUIRED=false): ${msg}`,
      );
    }
  }
}