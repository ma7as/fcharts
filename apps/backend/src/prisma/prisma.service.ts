import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from '../common/metrics/metrics.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly metrics: MetricsService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected to database');

    this.$on('query' as never, ((event: { duration: number; query: string }) => {
      const durSec = event.duration / 1000;
      // Prisma 5 doesn't expose model/action on the query event payload
      // uniformly — fall back to 'unknown' when absent.
      this.metrics.prismaQueryDuration('unknown', 'unknown', durSec);
      if (event.duration > 500) {
        this.logger.warn(
          `Slow Prisma query (${event.duration}ms): "${event.query.slice(0, 120)}"`,
        );
      }
    }) as never);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from database');
  }
}
