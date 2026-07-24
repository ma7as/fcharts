import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsServiceStub, metricsProviders } from './metrics.stub';
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
    MetricsServiceStub,
    ThrottlerMetricsFilter,
    ...metricsProviders,
    {
      provide: APP_FILTER,
      useClass: ThrottlerMetricsFilter,
    },
  ],
  exports: [MetricsServiceStub],
})
export class MetricsStubModule {}
