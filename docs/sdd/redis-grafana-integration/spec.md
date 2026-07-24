# Spec — `redis-grafana-integration`

> Delta spec. Only what this change adds or modifies.

## Conventions

- Each requirement has an ID `AC-N` (sequential).
- Each requirement has tags: `infra` | `cache` | `throttler` | `observability` | `ops` | `docs`.
- Use Given/When/Then (Gherkin) for testable scenarios.
- "MUST" / "MUST NOT" / "SHOULD" are RFC 2119 keywords.
- Scenarios are intentionally concise (3-5 lines) and TESTABLE — an engineer or test framework can run them as-is.

## Requirements

### Redis infrastructure

#### AC-1 [infra] Redis container reachable on `REDIS_URL`

The backend MUST be able to connect to a Redis 8 server using the URL supplied via the `REDIS_URL` environment variable.

**Scenario: backend connects to Redis at startup**

- **GIVEN** the `REDIS_URL` env var points to a healthy `fc-redis` container
- **WHEN** the NestJS backend starts and `RedisModule` calls `onModuleInit`
- **THEN** `ioredis.Redis` reaches state `ready`
- **AND** the backend logs `Redis connected`

#### AC-2 [infra] Backend logs `Redis connected` on startup

When the connection succeeds, the backend MUST emit a structured log line containing the substring `Redis connected`.

**Scenario: log line emitted on healthy connection**

- **GIVEN** Redis is reachable and `REDIS_REQUIRED=true`
- **WHEN** the backend finishes startup
- **THEN** the log stream contains a line matching `Redis connected`

#### AC-3 [infra] Backend startup tolerates Redis absence when `REDIS_REQUIRED=false`

When `REDIS_REQUIRED=false` and Redis is unreachable, the backend MUST start successfully, MUST emit a `WARN` log, and MUST NOT crash.

**Scenario: dev mode tolerates missing Redis**

- **GIVEN** `REDIS_REQUIRED=false` and no Redis server is running
- **WHEN** the backend starts
- **THEN** the process reaches `Nest application successfully started`
- **AND** the log stream contains `Redis unavailable, running without cache` at WARN level

#### AC-4 [infra] `REDIS_URL` documented in `.env.example`

`.env.example` MUST include `REDIS_URL`, `REDIS_REQUIRED`, and `REDIS_PASSWORD` (optional).

---

### Redis client module

#### AC-5 [infra] `RedisModule` exposes `REDIS_CLIENT` token (ioredis instance)

`RedisModule` MUST register an injection token `REDIS_CLIENT` bound to a singleton `ioredis.Redis` instance built from `REDIS_URL`.

#### AC-6 [infra] `RedisModule` is `@Global()` so all modules can inject

`RedisModule` MUST be decorated with `@Global()` and exported once at the root module. No other module MUST re-export it.

#### AC-7 [infra] `RedisService.ping()` returns `PONG` against a healthy server

A `RedisService` MUST expose `ping(): Promise<'PONG'>` that delegates to the shared client.

#### AC-8 [infra] Key namespace prefix `fc:` is applied by `RedisService` helpers, never by callers

`RedisService.get`, `set`, `del`, and the higher-level `CacheService.getOrSet` helpers MUST prepend `fc:` to every key. Callers MUST NOT include the prefix.

---

### OHLC cache

#### AC-9 [cache] First request for `(symbol, interval, limit, startTime)` populates Redis

The first call to `MarketService.getOhlcData` for a given key tuple MUST result in a Redis SET against `fc:cache:ohlc:{symbol}:{interval}:{limit}:{startTime}` with TTL 60s.

**Scenario: first call writes to Redis**

- **GIVEN** Redis is reachable and the cache key is empty
- **WHEN** `MarketService.getOhlcData` is called once
- **THEN** `redis-cli GET fc:cache:ohlc:BTCUSDT:1d:200:<startTime>` returns the JSON response
- **AND** `TTL fc:cache:ohlc:BTCUSDT:1d:200:<startTime>` returns a value in `(0, 60]`

#### AC-10 [cache] Subsequent identical request within 60s returns from Redis

A repeat call with the same `(symbol, interval, limit, startTime)` tuple within the 60s TTL window MUST NOT invoke the underlying loader.

**Scenario: second call is served from cache**

- **GIVEN** the cache key was populated by a prior call 5s ago
- **WHEN** `MarketService.getOhlcData` is called again with the same tuple
- **THEN** the loader is NOT invoked
- **AND** the response payload is identical to the first call

#### AC-11 [cache] Cache key is `fc:cache:ohlc:{symbol}:{interval}:{limit}:{startTime}`

The OHLC cache key MUST match the literal template `fc:cache:ohlc:{symbol}:{interval}:{limit}:{startTime}` where `startTime` is the ISO-8601 string or the literal `undefined` token from AC-15.

#### AC-12 [cache] Cache hit increments `cache_hits_total{namespace="ohlc"}`

Every OHLC cache hit MUST increment the Prometheus counter `cache_hits_total` with the label `namespace="ohlc"`.

#### AC-13 [cache] Cache miss increments `cache_misses_total{namespace="ohlc"}`

Every OHLC cache miss that falls through to the loader MUST increment `cache_misses_total` with `namespace="ohlc"`.

#### AC-14 [cache] `/indicators` and `/ccl` endpoints MUST NOT be cached

Any endpoint under `/api/v1/indicators/*` and `/api/v1/ccl/*` MUST bypass the OHLC cache entirely. This is an explicit non-caching decision.

#### AC-15 [cache] `startTime=undefined` requests cache key includes `now:{floor}` (5-min bucket) to avoid unbounded cache

When the caller passes `startTime=undefined`, the cache key MUST include the current 5-minute bucket floor (e.g. `now:2026-07-24T18:30`) so the key space stays bounded.

**Scenario: undefined startTime buckets to 5 minutes**

- **GIVEN** `startTime` is `undefined` and the current time is `2026-07-24T18:32:11Z`
- **WHEN** `MarketService.getOhlcData` computes the cache key
- **THEN** the key contains `now:2026-07-24T18:30` (the 5-minute floor)
- **AND** two calls inside the same 5-minute window share the same key

---

### Symbols catalog cache

#### AC-16 [cache] `SymbolsService.findAll` returns from Redis when key present

When the cache key `fc:cache:symbols:{normalized_query}` exists, `SymbolsService.findAll` MUST return the cached value and MUST NOT query Postgres.

#### AC-17 [cache] Cache key is `fc:cache:symbols:{normalized_query}`

The symbols cache key MUST be `fc:cache:symbols:{normalized_query}` where `normalized_query` is the URL-encoded, sorted, and lower-cased query string (sort, type, search, limit, offset).

#### AC-18 [cache] TTL = 300s ±10% jitter applied at SET time

The symbols cache TTL MUST be `300 * (0.9 + Math.random() * 0.2)` seconds, computed at write time, in the range `[270, 330]`.

#### AC-19 [cache] Cache stampede protection: NX lock `fc:lock:symbols:{key}` with 5s TTL; only one process populates

On a cache miss, the loader MUST first attempt `SET fc:lock:symbols:{key} <pid> NX EX 5`. Only the process that wins the lock runs the loader; losers MUST poll the key (≤5 attempts × 100ms) before falling back to the loader.

---

### WS last-known-price cache

#### AC-20 [cache] `MarketGateway` writes `fc:cache:px:{symbol}` on every emitted tick (TTL 2s)

Every emitted price tick MUST `SET fc:cache:px:{symbol} <payload> EX 2`.

#### AC-21 [cache] `handleSubscribe` checks `fc:cache:px:{symbol}` first; emits immediately if present

`MarketGateway.handleSubscribe` MUST first read `fc:cache:px:{symbol}`. On hit, it MUST emit to the socket immediately and MUST skip the provider call.

---

### Throttler storage

#### AC-22 [throttler] `ThrottlerModule` is configured with `ThrottlerStorageRedisService`

`app.module.ts` MUST pass `new ThrottlerStorageRedisService(client)` to `ThrottlerModule.forRoot([...], { storage })`.

**Scenario: throttler uses Redis storage**

- **GIVEN** the backend boots with Redis reachable
- **WHEN** a throttled route is hit
- **THEN** `redis-cli KEYS 'throttle:*'` returns at least one key after the first request

#### AC-23 [throttler] Storage receives an `ioredis.Redis` instance from `RedisModule`

The `client` passed to `ThrottlerStorageRedisService` MUST be the singleton `REDIS_CLIENT` exported by `RedisModule`.

#### AC-24 [throttler] Backend MUST convert MS TTL → S before passing to ioredis (gotcha)

The storage adapter MUST be configured with TTLs expressed in seconds (ioredis uses seconds). The Throttler's MS TTL value MUST be divided by 1000 before reaching the adapter config.

#### AC-25 [throttler] Global 100/min per IP rule works identically to in-memory baseline (integration test)

An integration test MUST assert that 100 requests/minute from a single IP return 200, and the 101st returns 429.

**Scenario: 100 OK then 429**

- **GIVEN** one client IP and the `long` throttler is `100 / 60_000ms`
- **WHEN** 101 requests are sent within 60s
- **THEN** the first 100 respond with status 200
- **AND** the 101st responds with status 429

#### AC-26 [throttler] When Redis is unreachable, throttled requests MUST return 500 (acceptable for v1) — document in design

When Redis is down and `REDIS_REQUIRED=true`, the throttler MUST surface a 500 response. This behavior MUST be documented in `design.md` as an accepted v1 trade-off.

#### AC-27 [throttler] Per-route throttles (`@Throttle({short, long})`) on auth endpoints continue to work

`@Throttle()` decorators on `AuthController` (`/auth/login`, `/auth/register`, `/auth/refresh`) MUST keep enforcing the same per-route limits they did before the storage swap.

---

### Observability — Prometheus

#### AC-28 [observability] `PrometheusModule` is global

`PrometheusModule.register({ defaultMetrics: { enabled: true }, path: '/metrics' })` MUST be imported in `app.module.ts` exactly once.

#### AC-29 [observability] `/internal/metrics` is served on the main app at port 8101 (excluded from Swagger and from JwtAuthGuard)

The backend MUST expose `/internal/metrics` on the main Nest app at port `8101`. The path MUST be excluded from Swagger (`@ApiExcludeController()`) and MUST NOT be behind `JwtAuthGuard`. A separate internal port (9464) is deferred to v2 (see `design.md §9` and the drift log below).

**Scenario: metrics endpoint reachable inside the backend container**

- **GIVEN** the backend container is running on the `fc-network`
- **WHEN** `curl http://backend:8101/internal/metrics` is issued from another container on the same network
- **THEN** the response is `text/plain; version=0.0.4` and lists Prometheus metrics

#### AC-30 [observability] Default Node.js process metrics are exposed

`defaultMetrics.enabled = true` MUST expose `process_cpu_seconds_total`, `nodejs_eventloop_lag_seconds`, `nodejs_heap_size_*`, `process_resident_memory_bytes`, and the rest of the `prom-client` default set.

#### AC-31 [observability] HTTP request duration histogram `http_request_duration_seconds` with labels `method`, `route`, `status_code`

An HTTP interceptor MUST record a histogram with labels `method`, `route`, `status_code`. Buckets MUST be the `prom-client` default `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.

**Scenario: HTTP request emits both duration histogram and counter**

- **GIVEN** the backend is running
- **WHEN** `GET /api/v1/symbols?type=crypto` is called once
- **THEN** `http_request_duration_seconds_count{method="GET",route="/api/v1/symbols",status_code="200"}` is `>= 1`
- **AND** `http_requests_total{method="GET",route="/api/v1/symbols",status_code="200"}` is `>= 1`

#### AC-32 [observability] HTTP request counter `http_requests_total` with same labels

The interceptor MUST also increment a counter `http_requests_total{method, route, status_code}` on every completed request.

#### AC-33 [observability] Route label MUST be the normalized path template (no IDs)

The `route` label MUST be the registered Express/Nest path template (e.g. `/api/v1/symbols/:id`), NEVER a raw URL with a real ID substituted. A request to `/api/v1/symbols/abc-123` MUST record `route="/api/v1/symbols/:id"`.

---

### Observability — Cache metrics

#### AC-34 [observability] `cache_hits_total{namespace}` and `cache_misses_total{namespace}` are exposed

Two Prometheus counters MUST be registered: `cache_hits_total{namespace}` and `cache_misses_total{namespace}`.

#### AC-35 [observability] Namespace values on day one: `ohlc`, `symbols`, `px`

The `namespace` label MUST take one of three values on day one: `ohlc`, `symbols`, `px`. Any new namespace is a breaking change for existing dashboards.

---

### Observability — Throttler metrics

#### AC-36 [observability] `throttler_blocked_total{name, route}` increments on every 429

A global Throttler exception filter MUST increment `throttler_blocked_total{name, route}` on every 429 response.

---

### Observability — Prisma metrics

#### AC-37 [observability] `prisma_query_duration_seconds{model, action}` histogram exposed

A histogram MUST observe every Prisma query, labeled by `model` and `action` (`findMany`, `findUnique`, `create`, `update`, etc.).

#### AC-38 [observability] Captured via `prisma.$on('query')` in `PrismaService`

`PrismaService` MUST register a `query` event handler on `$on` that times each query from `before` to `after` and observes the duration in the histogram.

#### AC-39 [observability] Slow query log threshold: warn on queries > 500ms

The same `query` handler MUST emit a `WARN` log line when duration exceeds 500ms.

---

### Observability — Auth metrics

#### AC-40 [observability] `auth_events_total{event}` counter exposed

A counter `auth_events_total{event}` MUST be registered.

#### AC-41 [observability] Events on day one: `login_success`, `login_fail`, `refresh_rotate`, `refresh_revoke`, `register_success`

`AuthService` MUST increment `auth_events_total{event}` at the following transitions:
- `login_success` — credentials verified, access JWT issued.
- `login_fail` — credentials rejected.
- `refresh_rotate` — refresh token rotated and a new pair issued.
- `refresh_revoke` — a replay or rotation error triggered family revocation.
- `register_success` — new user persisted.

---

### Observability — WebSocket metrics

#### AC-42 [observability] `ws_active_connections{namespace}` gauge exposed

A gauge `ws_active_connections{namespace}` MUST be registered.

#### AC-43 [observability] Incremented in `handleConnection`, decremented in `handleDisconnect`

`MarketGateway` MUST `inc()` the gauge in `handleConnection` and `dec()` it in `handleDisconnect`, with `namespace="market"`.

---

### Observability — Redis health

#### AC-44 [observability] `redis_ping_latency_seconds` gauge exposed

A gauge `redis_ping_latency_seconds` MUST be registered. It stores the most recent `redis.ping()` round-trip in seconds.

#### AC-45 [observability] Updated every 30s via a `@Cron` task

A `@Cron('*/30 * * * * *')` (every 30s) task MUST call `redis.ping()` and update the gauge.

---

### Prometheus container

#### AC-46 [ops] `docker-compose.all.yml` adds `fc-prometheus` service

The `.all.yml` MUST define a `fc-prometheus` service based on the `prom/prometheus` image, depending on `fc-network`.

**Scenario: Prometheus container starts healthy**

- **GIVEN** `docker-compose.all.yml` is up to date
- **WHEN** `docker compose -f docker-compose.all.yml up -d fc-prometheus`
- **THEN** within 30s `docker inspect --format='{{.State.Health.Status}}' fc-prometheus` returns `healthy`

#### AC-47 [ops] Prometheus binds port 9090 ONLY to `127.0.0.1` (or not at all in `.all.yml`)

In `.all.yml`, Prometheus MUST NOT be reachable from outside the loopback. Either omit `ports:` entirely, or bind to `127.0.0.1:9090:9090`.

#### AC-48 [ops] Prometheus scrape config at `ops/prometheus/prometheus.yml`

A new file `ops/prometheus/prometheus.yml` MUST define the `global`, `scrape_configs`, and `evaluation_interval` sections.

#### AC-49 [ops] Targets: `fc-backend:8101` (metrics_path: `/internal/metrics`), redis-exporter (`9121`), self

`prometheus.yml` MUST scrape:
- `fc-backend:8101` with `metrics_path: /internal/metrics` — labeled `job="backend"`.
- `redis-exporter:9121` — labeled `job="redis-exporter"`.
- `localhost:9090` — labeled `job="prometheus"` (self).

#### AC-50 [ops] Scrape interval: 15s

`global.scrape_interval` MUST be `15s`.

---

### Grafana container

#### AC-51 [ops] `docker-compose.all.yml` adds `fc-grafana` service

The `.all.yml` MUST define a `fc-grafana` service based on `grafana/grafana`, mounting `ops/grafana/provisioning` and `ops/grafana/dashboards`.

**Scenario: Grafana auto-provisions Prometheus datasource**

- **GIVEN** `fc-grafana` starts for the first time
- **WHEN** `curl http://grafana:8300/api/datasources` (from inside the container) is called
- **THEN** the response includes a datasource named `Prometheus` with `url=http://prometheus:9090`

#### AC-52 [ops] Grafana binds port 8300 ONLY to `127.0.0.1` in `.all.yml`

In `.all.yml`, Grafana MUST NOT be reachable from outside the loopback. Either omit `ports:` entirely, or bind to `127.0.0.1:8300:3000`.

#### AC-53 [ops] Grafana admin password sourced from `GRAFANA_ADMIN_PASSWORD` env (required)

The `fc-grafana` service MUST read `GF_SECURITY_ADMIN_PASSWORD` from the `GRAFANA_ADMIN_PASSWORD` env var. If the env var is empty, the container MUST fail to start with a clear error.

#### AC-54 [ops] `ops/grafana/provisioning/datasources/prometheus.yml` provisions Prometheus datasource on first boot

The provisioning YAML MUST declare a single datasource named `Prometheus` with `url=http://prometheus:9090`, `type=prometheus`, and `access=proxy`.

#### AC-55 [ops] `ops/grafana/provisioning/dashboards/dashboards.yml` mounts `ops/grafana/dashboards` provider

The dashboards provider YAML MUST mount the host path `ops/grafana/dashboards` into `/var/lib/grafana/dashboards` and reload on boot.

---

### Grafana dashboards

#### AC-56 [ops] Dashboard `fcharts-overview` shows: HTTP request rate (by status), p95 latency, error rate, throttler blocks

A dashboard file `ops/grafana/dashboards/fcharts-overview.json` MUST contain panels for:
- Request rate per second by `status_code` (from `http_requests_total`).
- p95 latency (from `http_request_duration_seconds`).
- Error rate (5xx ratio).
- `throttler_blocked_total` rate per minute.

**Scenario: overview dashboard renders with live data**

- **GIVEN** the backend has been running and serving traffic for ≥ 60s
- **WHEN** a user opens `fcharts-overview` in Grafana
- **THEN** all four panels show non-zero values
- **AND** no panel reports "No data"

#### AC-57 [ops] Dashboard `fcharts-cache` shows: cache hit/miss ratio per namespace, redis_ping_latency_seconds, prisma_query_duration_seconds p95

A dashboard file `ops/grafana/dashboards/fcharts-cache.json` MUST contain panels for:
- Cache hit ratio per namespace (ohlc, symbols, px).
- `redis_ping_latency_seconds` gauge.
- p95 of `prisma_query_duration_seconds` per model.

#### AC-58 [ops] Dashboard `fcharts-auth` shows: auth_events_total rate by event, login_fail spike detection

A dashboard file `ops/grafana/dashboards/fcharts-auth.json` MUST contain panels for:
- `auth_events_total` rate per minute, grouped by `event`.
- A spike alert panel on `login_fail` rate (visual only — no alerting rule in v1).

---

### Observability dev overlay

#### AC-59 [ops] New `docker-compose.observability.yml` overlay publishes Prometheus 9090 and Grafana 8300 to localhost for dev use

A new file `docker-compose.observability.yml` MUST extend the `.all.yml` services and publish Prometheus on `127.0.0.1:9090:9090` and Grafana on `127.0.0.1:8300:3000`.

#### AC-60 [ops] Overlay inherits network from `.all.yml`

The overlay MUST attach to the `fc-network` created by `.all.yml` (`networks: default: external: true: name: fc-network`).

---

### redis-exporter

#### AC-61 [ops] `docker-compose.all.yml` adds `fc-redis-exporter` (image `oliver006/redis_exporter`)

The `.all.yml` MUST define a `fc-redis-exporter` service based on `oliver006/redis_exporter`, depending on `fc-redis: condition: service_healthy`.

#### AC-62 [ops] Exporter binds port 9110 to localhost only in `.all.yml`

In `.all.yml`, the exporter MUST either omit `ports:` or bind to `127.0.0.1:9110:9121`.

#### AC-63 [ops] Exporter scraped by Prometheus

`ops/prometheus/prometheus.yml` MUST include a scrape target `redis-exporter:9121` with `job="redis-exporter"`.

---

### Refresh-token storage (NON-goal reaffirmed)

#### AC-64 [docs] Spec captures that refresh-token storage remains Postgres-only

`AuthService` MUST continue to read/write refresh tokens exclusively against the `refreshToken` Postgres table. Redis MUST NOT be introduced as a second source of truth for refresh tokens in this change.

---

### Documentation

#### AC-65 [docs] `.env.example` documents `REDIS_URL`, `REDIS_REQUIRED`, `GRAFANA_ADMIN_PASSWORD`

`.env.example` MUST include commented defaults for:
- `REDIS_URL=redis://localhost:8103`
- `REDIS_REQUIRED=false`
- `REDIS_PASSWORD=` (empty by default)
- `GRAFANA_ADMIN_PASSWORD=changeme` (with a NOTE that it MUST be changed)

#### AC-66 [docs] `README.md` updated with a one-paragraph "Observability" section pointing to Grafana and the scrape targets

`README.md` MUST add an `## Observability` section that mentions the `/metrics` endpoint on port 9464, the Prometheus scrape config under `ops/prometheus/`, and the Grafana dashboards under `ops/grafana/`.

---

## Out of scope (reaffirm proposal §4 and §5)

- Multi-instance backend / Redis Sentinel / Cluster.
- OpenTelemetry SDK and tracing.
- Loki / log aggregation.
- Redis as refresh-token storage source of truth.
- Public API changes (no new endpoints, no breaking changes; `/metrics` is internal-only on port 9464).
- Cache invalidation API (no manual purge endpoint in v1).
- Migration of `IolProvider`'s OAuth-token cache to Redis.
- User-profile cache.
- Alertmanager / alerting rules (dashboards only in v1).

---

## Mapping to PRs

| PR | Requirements |
|---|---|
| **PR1** (infra) | AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-64, AC-65 |
| **PR2** (cache) | AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27 |
| **PR3** (observability) | AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, AC-50, AC-51, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, AC-66 |
## Drift log

| Date | AC | Original | Current | Reason |
|---|---|---|---|---|
| 2026-07-24 | AC-29 | /metrics on internal port 9464 | /internal/metrics on main app at port 8101 | Design §9 chose to mount on the main app for simplicity; a separate internal port "deferred to v2". Implementation matches design. |
| 2026-07-24 | AC-49 | backend target :9464 | c-backend:8101/internal/metrics | Linked to AC-29 drift. |
