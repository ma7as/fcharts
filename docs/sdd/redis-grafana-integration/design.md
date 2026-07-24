# Design — `redis-grafana-integration`

> Phase: design | Date: 2026-07-24 | Artifact store: file-based
> Carries forward explore.md (decisions) and proposal.md (acceptance criteria).
> Spec.md provides the AC-N requirement IDs this design must satisfy.

---

## 1. Component overview

```
                ┌──────────────────┐
                │  fc-redis (:6379)│
                │  redis:8-alpine  │
                └────────┬─────────┘
                         │ TCP (ioredis)
                         ▼
   ┌─────────────────────────────────────────────────────┐
   │  NestJS backend (:8101, /internal/metrics)         │
   │                                                     │
   │   ┌─────────────────┐      ┌─────────────────────┐  │
   │   │  RedisModule    │      │   MetricsModule     │  │
   │   │  (Global)       │      │   (Global)          │  │
   │   │  ┌────────────┐ │      │  ┌───────────────┐  │  │
   │   │  │RedisService│ │      │  │MetricsService │  │  │
   │   │  └────┬───────┘ │      │  └───────┬───────┘  │  │
   │   └───────┼─────────┘      └──────────┼──────────┘  │
   │           │                            │             │
   │     ┌─────┴──────┐                ┌───┴────────┐    │
   │     │CacheService│                │/internal/  │    │
   │     │(typed ns)  │                │ metrics    │    │
   │     └─┬──────┬───┘                │ controller │    │
   │       │      │                    └────────────┘    │
   │       │      │                                        │
   │  ┌────▼──┐ ┌─▼──────────┐ ┌──────────────┐          │
   │  │Market │ │Symbols     │ │MarketGateway │          │
   │  │Service│ │Service     │ │ (WS)         │          │
   │  └───────┘ └────────────┘ └──────────────┘          │
   │  ┌──────────────┐ ┌──────────────────┐              │
   │  │AuthService   │ │PrismaService     │              │
   │  │(events)      │ │($on('query'))   │              │
   │  └──────────────┘ └──────────────────┘              │
   │                                                     │
   │  ThrottlerStorageRedisService ◀── app.module.ts     │
   └─────────────────────────────────────────────────────┘
                         │
                         │ scrape /metrics every 15s
                         ▼
              ┌────────────────────┐
              │ fc-prometheus :9090│
              │ (15d retention)    │
              └─────────┬──────────┘
                        │ datasource
                        ▼
              ┌────────────────────┐
              │ fc-grafana    :3000│  (host 8300)
              │ provisioning from  │
              │  ops/grafana/...   │
              └────────────────────┘
                        ▲
              ┌────────────────────┐
              │ fc-redis-exporter  │
              │ :9121 → 9110 host  │
              └────────────────────┘
```

---

## 2. `RedisModule`

**File:** `apps/backend/src/redis/redis.module.ts`
**Decorators:** `@Global()`

**Providers:**

```ts
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Module({
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        if (!url) throw new Error('REDIS_URL is required');
        return new Redis(url, {
          // Defaults: maxRetriesPerRequest=20, enableReadyCheck=true,
          // reconnect on errors with exponential backoff 100ms..3000ms.
          keyPrefix: undefined, // prefix is applied by RedisService helpers
        });
      },
    },
    RedisPingCron,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
```

**Config:**

| Env | Required | Default | Notes |
|---|---|---|---|
| `REDIS_URL` | yes | — | e.g. `redis://localhost:8103` |
| `REDIS_REQUIRED` | no | `false` | if `true`, exit code 1 on initial connect failure |
| `REDIS_KEY_PREFIX` | no | `fc:` | applied at the `RedisService` boundary, not at ioredis level (so app code sees the prefix) |

**Namespace conventions (must match spec AC-8):**

| Prefix | Owner | Examples |
|---|---|---|
| `fc:cache:ohlc:*` | `CacheService` | `fc:cache:ohlc:BTCUSDT:1d:200:1700000000` |
| `fc:cache:symbols:*` | `CacheService` | `fc:cache:symbols:abc123def456` |
| `fc:cache:px:*` | `CacheService` | `fc:cache:px:BTCUSDT` |
| `fc:lock:symbols:*` | `CacheService` | `fc:lock:symbols:abc123def456` |
| `fc:throttle:*` | ThrottlerStorageRedisService | managed by the adapter |
| `fc:metrics:*` | (reserved) | unused on day one |

**Failure modes:**

- **Connect refused at startup** — log warning with the URL redacted (no password leak). If `REDIS_REQUIRED=true`, process exits with code 1. If `false`, app continues; cache misses return null; throttler returns 500 on first request after Redis is missing.
- **Mid-flight disconnect** — ioredis auto-reconnects with backoff. `RedisService.get/set` swallows errors and returns null / no-ops respectively. App degrades to no-cache; throttler throws → 500 (documented).
- **Slow Redis** — `redis_ping_latency_seconds` gauge exposes the round-trip time; if it crosses 100ms, dashboards alert (out of scope for v1 alerting rules, but the signal is there).

---

## 3. `RedisService`

**File:** `apps/backend/src/redis/redis.service.ts`
**Injectable:** yes
**Constructor inject:** `REDIS_CLIENT`, `ConfigService`

**Public API:**

```ts
@Injectable()
export class RedisService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly cfg: ConfigService,
  ) {}

  async ping(): Promise<string>;                         // health-check
  async get<T>(key: string): Promise<T | null>;          // JSON.parse, null on miss
  async set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  async del(key: string): Promise<void>;
  async getOrSet<T>(
    key: string,
    ttlSec: number,
    loader: () => Promise<T>,
    opts?: { jitter?: boolean },
  ): Promise<T>;
  async tryLock(key: string, ttlSec: number): Promise<boolean>;  // SET NX EX
  async unlock(key: string): Promise<void>;
}
```

**Rules:**

1. All keys are prefixed with `REDIS_KEY_PREFIX` at the boundary. Callers pass raw app-level keys (e.g. `cache:ohlc:BTCUSDT:1d`); `RedisService` adds `fc:`.
2. `get` MUST catch all errors and return `null` — never throw on cache layer.
3. `set` MUST catch all errors and log at warn level; never throw.
4. `getOrSet` applies ±10% TTL jitter when `opts.jitter === true`. Jitter formula: `ttlSec * (0.9 + Math.random() * 0.2)`.
5. `tryLock` returns `true` if lock acquired, `false` otherwise. Caller is responsible for releasing via `unlock`.

---

## 4. `CacheService`

**File:** `apps/backend/src/common/cache/cache.service.ts`
**Injectable:** yes
**Constructor inject:** `RedisService`, `MetricsService`

**Public API (typed per namespace):**

```ts
@Injectable()
export class CacheService {
  // ── OHLC ─────────────────────────────────────────────────────
  async getOhlc(key: string): Promise<OhlcResponse | null>;
  async setOhlc(key: string, value: OhlcResponse, ttlSec = 60): Promise<void>;

  // ── Symbols catalog ──────────────────────────────────────────
  async getSymbols(key: string): Promise<PaginatedResult<Symbol> | null>;
  async setSymbols(
    key: string,
    value: PaginatedResult<Symbol>,
    ttlSec = 300,
  ): Promise<void>; // applies ±10% jitter

  // ── WS last-known-price ──────────────────────────────────────
  async getLastPrice(symbol: string): Promise<number | null>;
  async setLastPrice(symbol: string, price: number, ttlSec = 2): Promise<void>;

  // ── Symbols stampede lock ────────────────────────────────────
  async tryAcquireSymbolsLock(key: string): Promise<boolean>;
  async releaseSymbolsLock(key: string): Promise<void>;
}
```

**Hit/miss tracking:** every `getX` call increments `cache_hits_total` on success and `cache_misses_total` on null. Every `setX` is silent.

---

## 5. `MarketService` integration

**File:** `apps/backend/src/market/market.service.ts`
**Change:** constructor adds `CacheService` injection. `getOhlcData` wraps the existing flow in a cache-aside.

**Cache key:** `ohlc:{symbol}:{interval}:{limit}:{startTime ?? 'now:' + floor(now/5min)}`. The 5-minute `now` bucket (per AC-15) prevents unbounded key cardinality when `startTime` is omitted.

**Flow:**

```text
getOhlcData(query)
  ├── compute cacheKey
  ├── cached = await cacheService.getOhlc(cacheKey)
  │     ├── hit  → return cached  (metrics.cacheHit('ohlc'))
  │     └── miss → continue       (metrics.cacheMiss('ohlc'))
  ├── existing DB-cache check + provider fetch (unchanged)
  └── await cacheService.setOhlc(cacheKey, response, 60)
```

**Out of scope:** `getImpliedCcl` and `calculateMA` MUST NOT be touched (AC-14). Indicators endpoint computes on top of `getOhlcData` and therefore benefits from the cache transitively.

**Unit tests** (`market.service.spec.ts` new or extended):

| Scenario | Expected |
|---|---|
| First call, cache empty | cache miss → DB hit (or provider) → cache populated → response |
| Second call, cache populated | cache hit → no Prisma interaction → response |
| Cache get throws | swallowed → treated as miss → flow continues normally |
| Cache set throws | swallowed → flow continues normally |

---

## 6. `SymbolsService` integration

**File:** `apps/backend/src/symbols/symbols.service.ts`
**Change:** constructor adds `CacheService`. `findAll` wraps with cache + stampede lock.

**Cache key:** SHA-1 of stable JSON `{page, limit, type, search}`, truncated to 16 hex chars.

```ts
private buildSymbolsCacheKey(p: PaginationDto): string {
  const normalized = {
    page: p.page ?? 1,
    limit: p.limit ?? 20,
    type: p.type ?? null,
    search: p.search?.trim() ?? null,
  };
  const hash = createHash('sha1')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 16);
  return hash;
}
```

**Flow with stampede protection:**

```text
findAll(pagination)
  ├── key = buildSymbolsCacheKey(pagination)
  ├── cached = await cacheService.getSymbols(key)
  │     └── if non-null → return cached
  ├── lockAcquired = await cacheService.tryAcquireSymbolsLock(key)
  │     └── if false → wait 50ms then retry getSymbols (up to 5x)
  ├── (re-check cache after lock to handle the case another process populated)
  ├── run DB query as today
  ├── await cacheService.setSymbols(key, result, 300)  // ±10% jitter applied inside
  └── await cacheService.releaseSymbolsLock(key)
  └── return result
```

---

## 7. `MarketGateway` integration (WS last-known-price)

**File:** `apps/backend/src/market/market.gateway.ts`
**Change:** constructor adds `CacheService`. Two hook points.

**Hook A — write on every tick.** Find the existing tick-emission path (where the stream candle is emitted to the socket) and add:

```ts
// after `this.server.emit('candle', ...)` or equivalent
await this.cacheService.setLastPrice(symbol, lastClosePrice);
```

**Hook B — read on subscribe.** In the existing `@SubscribeMessage('subscribe')` handler, before kicking off the live stream, check the cache:

```ts
const lastPrice = await this.cacheService.getLastPrice(symbol);
if (lastPrice !== null) {
  client.emit('last_known_price', { symbol, price: lastPrice, ts: Date.now() });
}
```

The TTL of 2s means we never show a stale-by-too-much price on reconnect, and we always show one within the latency of the most recent tick.

---

## 8. `ThrottlerModule` storage swap

**File:** `apps/backend/src/app.module.ts`
**Change:** replace `ThrottlerModule.forRoot([...])` with `ThrottlerModule.forRootAsync({...})`.

```ts
import { ThrottlerStorageRedisService } from '@nestjs/throttler-storage-redis';

ThrottlerModule.forRootAsync({
  imports: [RedisModule],
  inject: [REDIS_CLIENT],
  useFactory: (redis: Redis) => ({
    throttlers: [
      { name: 'short', ttl: 1_000, limit: 10 },
      { name: 'long', ttl: 60_000, limit: 100 },
    ],
    storage: new ThrottlerStorageRedisService(redis),
  }),
})
```

> ⚠️ **TTL unit gotcha (AC-24):** `ThrottlerStorageRedisService` from
> `@nestjs/throttler-storage-redis` v5 stores TTLs in **seconds** even
> though `ThrottlerModule` declares throttlers with `ttl` in **ms**. The
> adapter reads `throttler.ttl` and divides internally (verified against
> the v5 source — `scriptLoad` uses `ARGV[1]` as seconds). We MUST keep
> the `ttl` declarations in ms here (matches the existing Throttler API
> surface) and trust the adapter. The integration test in PR1 (AC-25)
> validates the 100/min limit fires correctly under this storage.

**Per-route throttles** (e.g. `auth.controller.ts` `@Throttle({ short: { limit: 5, ttl: 60_000 }, ... })`) continue to work because they reuse the same global storage instance.

---

## 9. `MetricsModule` + `MetricsService` + `MetricsController`

**File:** `apps/backend/src/common/metrics/metrics.module.ts`
**Decorators:** `@Global()`
**Imports:** `PrometheusModule.register({ ... })` from `@willsoto/nestjs-prometheus`

```ts
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },       // GC, RSS, event loop lag
      defaultLabels: { app: 'fcharts-backend' },
    }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
```

**Mount point decision (spec AC-29):** `/internal/metrics` is served on the **main** Nest app at port 8101, NOT a separate port. Rationale: simpler v1, fewer Express adapters, fewer healthchecks. The path is excluded from Swagger and from `JwtAuthGuard`. The compose layer (`fc-prometheus`) scrapes `http://fc-backend:8101/internal/metrics`.

A separate internal port (9464) is **deferred** to v2; design document notes the path so a follow-up can introduce `MetricsServerModule` with a second `NestFactory.create()` if port-isolation becomes a requirement.

**Controller** (`metrics.controller.ts`):

```ts
@Controller('internal/metrics')
// No JwtAuthGuard — Prometheus can't carry a JWT.
@ApiExcludeController()  // hides from Swagger
export class MetricsController {
  constructor(@InjectMetric('http_request_duration_seconds')
              private readonly httpHistogram: Histogram<string>,
             /* ... etc ... */) {}
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.registry.contentType);
    res.end(await this.registry.metrics());
  }
}
```

**Service** (`metrics.service.ts`) — typed helpers:

```ts
@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('cache_hits_total')  private readonly cacheHits: Counter<string>,
    @InjectMetric('cache_misses_total') private readonly cacheMisses: Counter<string>,
    @InjectMetric('throttler_blocked_total') private readonly throttlerBlocked: Counter<string>,
    @InjectMetric('auth_events_total') private readonly authEvents: Counter<string>,
    @InjectMetric('ws_active_connections') private readonly wsConn: Gauge<string>,
    /* http_request_duration_seconds + http_requests_total auto-registered by PrometheusModule */
  ) {}

  cacheHit(ns: 'ohlc' | 'symbols' | 'px'): void {
    this.cacheHits.inc({ namespace: ns });
  }
  cacheMiss(ns: 'ohlc' | 'symbols' | 'px'): void { /* same */ }
  throttlerBlocked(name: string, route: string): void {
    this.throttlerBlocked.inc({ name, route });
  }
  authEvent(event: AuthEvent): void {
    this.authEvents.inc({ event });
  }
  wsConnect(ns: string): void { this.wsConn.inc({ namespace: ns }); }
  wsDisconnect(ns: string): void { this.wsConn.dec({ namespace: ns }); }
  setRedisPingLatency(sec: number): void { /* gauge set */ }
}
```

---

## 10. `PrismaService` instrumentation

**File:** `apps/backend/src/prisma/prisma.service.ts`
**Change:** in `onModuleInit`, attach `this.$on('query', ...)`.

```ts
async onModuleInit() {
  await this.$connect();
  this.logger.log('Prisma connected to database');

  this.$on('query', (e: Prisma.QueryEvent) => {
    const durSec = e.duration / 1000;
    const meta = e as unknown as { model?: string; action?: string };
    const model = meta.model ?? 'unknown';
    const action = meta.action ?? 'unknown';
    this.metrics.prismaQueryDuration(model, action, durSec);
    if (e.duration > 500) {
      this.logger.warn(
        `Slow Prisma query (${e.duration}ms): model=${model} action=${action} query="${e.query.slice(0, 120)}"`,
      );
    }
  });
}
```

Note: `model` and `action` may be undefined for raw SQL (e.g. `findUnique` inside an interactive transaction with raw bits) — fall back to `'unknown'`.

---

## 11. `AuthService` metrics

**File:** `apps/backend/src/auth/auth.service.ts`
**Change:** inject `MetricsService`. Five call sites:

| Location | Event |
|---|---|
| `validateUser` — successful return | (none — called from local strategy which is itself called by login) |
| `login` — `bcrypt.compare` fails | `login_fail` |
| `login` — successful return | `login_success` |
| `issueTokenPair` — replay-detected branch | `refresh_revoke` |
| `issueTokenPair` — successful rotation | `refresh_rotate` |
| `register` — successful return | `register_success` |

---

## 12. `MarketGateway` metrics

**File:** `apps/backend/src/market/market.gateway.ts`
**Change:** inject `MetricsService` (in addition to `CacheService` from §7). In `handleConnection`, call `metrics.wsConnect('market')`. In `handleDisconnect`, call `metrics.wsDisconnect('market')`.

---

## 13. `RedisPingCron`

**File:** `apps/backend/src/redis/redis-ping.cron.ts`
**Decorators:** `@Injectable()`

```ts
@Cron(CronExpression.EVERY_30_SECONDS)
async measurePing() {
  const start = Date.now();
  try {
    await this.redis.ping();
    this.metrics.setRedisPingLatency((Date.now() - start) / 1000);
  } catch (err) {
    this.logger.warn('Redis ping failed');
    this.metrics.setRedisPingLatency(-1); // sentinel value
  }
}
```

---

## 14. Prometheus container

```yaml
fc-prometheus:
  image: prom/prometheus:v2.55.0
  container_name: fc-prometheus
  restart: unless-stopped
  command:
    - --config.file=/etc/prometheus/prometheus.yml
    - --storage.tsdb.path=/prometheus
    - --storage.tsdb.retention.time=15d
  volumes:
    - ./ops/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus
  ports:
    - "127.0.0.1:9090:9090"   # .all.yml only — overlay publishes all-interfaces
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:9090/-/healthy || exit 1"]
    interval: 15s
    timeout: 5s
    retries: 5
  depends_on:
    backend:
      condition: service_started
    fc-redis-exporter:
      condition: service_started
```

Volume declaration in `.all.yml`: `prometheus_data: { driver: local }`.

---

## 15. Prometheus config

**File:** `ops/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    app: fcharts-backend

scrape_configs:
  - job_name: fcharts-backend
    metrics_path: /internal/metrics
    static_configs:
      - targets: ['fc-backend:8101']

  - job_name: redis-exporter
    static_configs:
      - targets: ['fc-redis-exporter:9121']

  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']
```

---

## 16. `redis-exporter`

```yaml
fc-redis-exporter:
  image: oliver006/redis_exporter:v1.62.0
  container_name: fc-redis-exporter
  restart: unless-stopped
  environment:
    REDIS_ADDR: redis://fc-redis:6379
  ports:
    - "127.0.0.1:9110:9121"   # .all.yml only
  depends_on:
    fc-redis:
      condition: service_healthy
```

No healthcheck on this container — rely on `depends_on` and Prometheus scrape status.

---

## 17. Grafana container

```yaml
fc-grafana:
  image: grafana/grafana:11.3.0
  container_name: fc-grafana
  restart: unless-stopped
  environment:
    GF_SECURITY_ADMIN_USER: admin
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD must be set}
    GF_USERS_ALLOW_SIGN_UP: "false"
    GF_AUTH_ANONYMOUS_ENABLED: "false"
    GF_INSTALL_PLUGINS: ""
  volumes:
    - ./ops/grafana/provisioning:/etc/grafana/provisioning:ro
    - ./ops/grafana/dashboards:/var/lib/grafana/dashboards:ro
    - grafana_data:/var/lib/grafana
  ports:
    - "127.0.0.1:8300:3000"   # .all.yml only
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
    interval: 15s
    timeout: 5s
    retries: 5
  depends_on:
    fc-prometheus:
      condition: service_healthy
```

Volume declaration in `.all.yml`: `grafana_data: { driver: local }`.

---

## 18. Grafana datasource provisioning

**File:** `ops/grafana/provisioning/datasources/prometheus.yml`

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://fc-prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: 15s
```

---

## 19. Grafana dashboard provider

**File:** `ops/grafana/provisioning/dashboards/dashboards.yml`

```yaml
apiVersion: 1
providers:
  - name: fcharts
    folder: fcharts
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
```

---

## 20. Dashboard JSON (apply phase generates)

Three dashboards, all pinned to `Prometheus` datasource, last 6h, refresh 30s.

| File | Panels |
|---|---|
| `ops/grafana/dashboards/fcharts-overview.json` | HTTP req rate (sum by `status_code`), p95 latency (`histogram_quantile`), 5xx rate, throttler blocks (`sum by (name, route)` of `throttler_blocked_total`) |
| `ops/grafana/dashboards/fcharts-cache.json` | cache hit ratio per ns (`sum(rate(cache_hits_total[5m])) / sum(rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))`), `redis_ping_latency_seconds`, prisma p95 (`histogram_quantile(0.95, ...)`), OHLC p95 |
| `ops/grafana/dashboards/fcharts-auth.json` | login_success rate, login_fail rate, refresh_rotate vs refresh_revoke |

---

## 21. `docker-compose.observability.yml`

**File:** `docker-compose.observability.yml` (new)

```yaml
# Dev overlay: publish observability ports on all interfaces so a developer
# can hit Grafana at http://localhost:8300 without Docker host networking
# tricks. Use with:
#   docker compose -f docker-compose.all.yml -f docker-compose.observability.yml up

include:
  - path: ./docker-compose.all.yml

services:
  fc-prometheus:
    ports:
      - "9090:9090"

  fc-grafana:
    ports:
      - "8300:3000"

  fc-redis-exporter:
    ports:
      - "9110:9121"
```

`include:` (Compose v2.20+) inherits the full service set from `.all.yml` and we override only the `ports` keys we care about.

---

## 22. `.env` additions

**File:** `.env.example` (add to existing block):

```bash
# Redis
REDIS_URL=redis://localhost:8103
REDIS_REQUIRED=false
REDIS_KEY_PREFIX=fc:

# Grafana
GRAFANA_ADMIN_PASSWORD=change-me-in-prod
```

If `REDIS_REQUIRED=true`, the backend exits with code 1 on initial connect failure. If `false` (default), the backend warns and continues (cache layer degrades to no-cache).

---

## 23. README updates

**File:** `README.md` — add a new section after `## Stack Tecnológico`:

```markdown
## Observability

The backend exposes Prometheus metrics at `GET /internal/metrics` on the
main API port (8101). A Prometheus + Grafana stack is included in
`docker-compose.all.yml`:

- Prometheus scrapes the backend, `redis-exporter`, and itself every 15s.
- Grafana auto-provisions the Prometheus datasource and three
  dashboards from `ops/grafana/`.

For local development, use the overlay to publish the UIs to your host:

\```bash
docker compose -f docker-compose.all.yml -f docker-compose.observability.yml up -d
\```

Then open:

- Grafana: http://localhost:8300 (admin / `${GRAFANA_ADMIN_PASSWORD}`)
- Prometheus: http://localhost:9090

Dashboard sources live under `ops/grafana/dashboards/` — edit JSON,
commit, Grafana picks it up within 30s (no restart needed).
```

---

## 24. PR slicing — final

| PR | Spec requirements | Files |
|---|---|---|
| **PR1** (infra) | AC-1..AC-8, AC-64, AC-65 | `docker-compose.all.yml` (uncomment Redis), `apps/backend/src/redis/*`, `apps/backend/package.json`, `.env.example` |
| **PR2** (cache) | AC-9..AC-27 | `apps/backend/src/common/cache/*`, `apps/backend/src/market/market.service.ts`, `apps/backend/src/symbols/symbols.service.ts`, `apps/backend/src/market/market.gateway.ts`, `apps/backend/src/app.module.ts` (Throttler swap), unit tests |
| **PR3** (observability) | AC-28..AC-63, AC-66 | `apps/backend/src/common/metrics/*`, `apps/backend/src/prisma/prisma.service.ts`, `apps/backend/src/auth/auth.service.ts`, `apps/backend/src/main.ts`, `docker-compose.all.yml` (Prometheus + Grafana + exporter), `docker-compose.observability.yml`, `ops/prometheus/prometheus.yml`, `ops/grafana/provisioning/...`, `ops/grafana/dashboards/*.json`, `README.md` |

PR1 = ~150-200 lines. PR2 = ~300-400 lines. PR3 = ~250-350 lines. All under the 400-line per-PR budget.

---

## 25. Open implementation notes

1. `cache-manager` is REJECTED per Decision 1 in explore.md. If the apply agent re-introduces it, halt and re-read Decision 1.
2. `ThrottlerStorageRedisService` v5 — confirm version in `pnpm-lock.yaml` after install. The TTL unit gotcha (§8) is the single most likely failure mode of this PR.
3. ioredis reconnect backoff defaults are 100ms..3000ms. Acceptable. Do not lower `maxRetriesPerRequest` below 20.
4. `/internal/metrics` MUST NOT be added to Swagger and MUST NOT be behind `JwtAuthGuard`. Prometheus can't carry a JWT.
5. The `@Cron` decorator from `@nestjs/schedule` requires importing `ScheduleModule.forRoot()` in `app.module.ts`. If `app.module.ts` doesn't already import it, PR3 must add it.
6. `redis_exporter` image `oliver006/redis_exporter` is unmaintained as of late 2025; the community has moved to `bitnami/redis-exporter`. For v1, keep `oliver006/redis_exporter:v1.62.0` (known stable). v2 should swap.
7. Grafana provisioning re-reads dashboards every 30s. JSON edits in `ops/grafana/dashboards/*.json` show up without a container restart.
8. Default Prometheus retention is **15 days**. Anything older than that is gone. Document in the Observability README section.
