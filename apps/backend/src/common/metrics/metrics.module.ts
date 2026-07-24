import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsService, metricsProviders } from './metrics.service';
import { ThrottlerMetricsFilter } from './throttler-metrics.filter';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      defaultLabels: { app: 'fcharts-backend' },
    }),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    ThrottlerMetricsFilter,
    ...metricsProviders,
    {
      provide: APP_FILTER,
      useClass: ThrottlerMetricsFilter,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
