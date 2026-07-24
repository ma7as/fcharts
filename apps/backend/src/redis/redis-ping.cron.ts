import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.service';
import { MetricsServiceStub } from '../common/metrics/metrics.stub';

@Injectable()
export class RedisPingCron {
  private readonly logger = new Logger(RedisPingCron.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly metrics: MetricsServiceStub,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async measurePing(): Promise<void> {
    const start = Date.now();
    try {
      await this.redis.ping();
      this.metrics.setRedisPingLatency((Date.now() - start) / 1000);
    } catch (err) {
      this.logger.warn(
        `Redis ping failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      this.metrics.setRedisPingLatency(-1);
    }
  }
}
