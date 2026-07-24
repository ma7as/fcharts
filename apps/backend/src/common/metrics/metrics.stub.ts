import { Injectable } from '@nestjs/common';
import {
  InjectMetric,
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import type { Counter, Gauge, Histogram } from 'prom-client';

export type CacheNamespace = 'ohlc' | 'symbols' | 'px';

/**
 * Backend metrics service. The class is named `MetricsServiceStub` to
 * preserve the symbol that PR2's `CacheService` already imports; PR4
 * (cleanup) renames it to `MetricsService`. Body now wires real
 * Prometheus counters/gauges/histograms via `@willsoto/nestjs-prometheus`
 * and exposes typed helpers for the rest of the codebase.
 */
@Injectable()
export class MetricsServiceStub {
  constructor(
    @InjectMetric('cache_hits_total') private readonly cacheHits: Counter<string>,
    @InjectMetric('cache_misses_total') private readonly cacheMisses: Counter<string>,
    @InjectMetric('throttler_blocked_total') private readonly throttlerBlockedCounter: Counter<string>,
    @InjectMetric('auth_events_total') private readonly authEvents: Counter<string>,
    @InjectMetric('ws_active_connections') private readonly wsConn: Gauge<string>,
    @InjectMetric('prisma_query_duration_seconds') private readonly prismaDuration: Histogram<string>,
    @InjectMetric('redis_ping_latency_seconds') private readonly redisPing: Gauge<string>,
  ) {}

  cacheHit(ns: CacheNamespace): void {
    this.cacheHits.inc({ namespace: ns });
  }
  cacheMiss(ns: CacheNamespace): void {
    this.cacheMisses.inc({ namespace: ns });
  }
  throttlerBlocked(name: string, route: string): void {
    this.throttlerBlockedCounter.inc({ name, route });
  }
  authEvent(event: string): void {
    this.authEvents.inc({ event });
  }
  wsConnect(ns: string): void {
    this.wsConn.inc({ namespace: ns });
  }
  wsDisconnect(ns: string): void {
    this.wsConn.dec({ namespace: ns });
  }
  prismaQueryDuration(model: string, action: string, sec: number): void {
    this.prismaDuration.observe({ model, action }, sec);
  }
  setRedisPingLatency(sec: number): void {
    this.redisPing.set(sec < 0 ? -1 : sec);
  }
}

export const metricsProviders = [
  // HTTP auto-instrumentation (registered by @willsoto/nestjs-prometheus
  // via the controller, but the histogram + counter live here so other
  // modules can decorate them if needed).
  makeHistogramProvider({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  }),
  makeCounterProvider({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  }),
  makeCounterProvider({
    name: 'cache_hits_total',
    help: 'Cache hits',
    labelNames: ['namespace'],
  }),
  makeCounterProvider({
    name: 'cache_misses_total',
    help: 'Cache misses',
    labelNames: ['namespace'],
  }),
  makeCounterProvider({
    name: 'throttler_blocked_total',
    help: 'Requests blocked by the rate limiter',
    labelNames: ['name', 'route'],
  }),
  makeCounterProvider({
    name: 'auth_events_total',
    help: 'Auth-related events',
    labelNames: ['event'],
  }),
  makeGaugeProvider({
    name: 'ws_active_connections',
    help: 'Active WebSocket connections',
    labelNames: ['namespace'],
  }),
  makeHistogramProvider({
    name: 'prisma_query_duration_seconds',
    help: 'Prisma query duration in seconds',
    labelNames: ['model', 'action'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1],
  }),
  makeGaugeProvider({
    name: 'redis_ping_latency_seconds',
    help: 'Redis PING round-trip in seconds (-1 if unreachable)',
  }),
];
