# Proposal — `redis-grafana-integration`

> Phase: propose | Date: 2026-07-24 | Mode: automatic | Artifact store: file-based
> Source: [`explore.md`](./explore.md) (sdd-explore, model `MiniMax M3 (minimax)`)

---

## 1. Intent

The Redis container declared in `docker-compose.yml` and `docker-compose.dev.yml` is commented out in `docker-compose.all.yml` with the literal note "*currently unused — the backend does not wire CacheModule*". That note is the seed of this change: the runtime surface for caching and observability has never been built, so today we pay full Prisma + JSON-serialization cost on every OHLC request, the rate limiter silently diverges across any future second backend replica, and the team has zero operational visibility beyond `Logger` and dev-only Swagger. This change wires Redis as a real caching layer in the NestJS backend (OHLC front-layer, symbols catalog, WS last-known price, and Throttler storage) and brings up Prometheus + Grafana as the observability surface, so that chart scroll stops hammering Postgres, rate limiting becomes globally consistent, and the team gets dashboards, alerts-ready metrics, and a path to add OpenTelemetry later without a rework.

---

## 2. Problem statement

- **Redis 8-alpine is a dead container.** Declared in `docker-compose.yml` / `docker-compose.dev.yml` (port 8103) with a `redis-cli ping` healthcheck, but commented out in `docker-compose.all.yml` (the production-shaped compose) and `apps/backend/package.json` has no `ioredis`, no `cache-manager`, no `@nestjs/cache-manager`.
- **No distributed rate limiting.** `ThrottlerModule.forRoot([...])` in [`apps/backend/src/app.module.ts`](../../apps/backend/src/app.module.ts) registers two windows (`name: 'short', ttl: 1_000, limit: 10` and `name: 'long', ttl: 60_000, limit: 100`) with no storage override → the default in-process memory storage. The first time a second backend replica comes up, per-IP counters silently split.
- **Zero observability.** No `/metrics`, no Prometheus, no Grafana, no OTel, no Loki. Visibility is `Logger` calls plus Swagger (dev-only). No HTTP duration histogram, no Prisma query histogram, no auth event counter, no cache hit ratio, no Redis health gauge.
- **OHLC response is recomputed on every chart scroll.** [`MarketService.getOhlcData`](../../apps/backend/src/market/market.service.ts) does a DB-level cache check (`candle` table, 90%-of-limit threshold) and then either returns DB rows or fetches + persists from the provider. Every chart pan / interval change costs a `prisma.symbol.findUnique` + `prisma.candle.findMany` + JSON serialization, even when the same `(symbol, interval, limit, startTime)` payload was served seconds ago.
- **No "last known price" fast path on WS reconnect.** `MarketGateway.handleSubscribe` re-fetches the provider on every reconnect; with a 2s Redis TTL we can serve the freshest tick instantly.
- **No way to know if a code change regressed cache hit ratio or p95.** No histograms → no rollback signal.

---

## 3. Goals

1. **Real Redis caching layer** in [`apps/backend/src/`](../../apps/backend/src/) wrapping `MarketService.getOhlcData` (TTL 60s), `SymbolsService.findAll` (TTL 300s with ±10% jitter), and `MarketGateway` last-known price (TTL 2s) — measurable drop in Postgres `findMany` calls and in p95 latency for OHLC.
2. **Distributed rate limiting** by swapping `ThrottlerModule` storage from in-memory to `ThrottlerStorageRedisService` from `@nestjs/throttler-storage-redis`, using the same shared `ioredis` client.
3. **Prometheus + Grafana observability stack** with `@willsoto/nestjs-prometheus`, exposing `/metrics` on the backend and **9 first-class metrics**: `http_request_duration_seconds`, `http_requests_total`, `cache_hits_total` / `cache_misses_total`, `throttler_blocked_total`, `prisma_query_duration_seconds`, `auth_events_total`, `ws_active_connections`, `redis_ping_latency_seconds`.
4. **Three repo-mounted Grafana dashboards** under [`ops/grafana/dashboards/`](../../ops/grafana/dashboards/) — `fcharts-overview.json` (request rate, p95, error rate, throttler), `fcharts-cache.json` (hit ratio, redis ping latency, prisma p95), `fcharts-auth.json` (auth events by event label) — provisioned via [`ops/grafana/provisioning/`](../../ops/grafana/provisioning/) YAML.
5. **Three chained PRs, `stacked-to-main`**, each < 400-line review budget, each independently reversible. PR1 wires Redis infra, PR2 wires cache + Throttler storage, PR3 wires observability.

---

## 4. Non-goals

1. **No multi-instance backend in this change.** Redis runs as a single node with AOF persistence; no Sentinel, no Cluster, no replica. Accepted for v1; revisit when the second backend replica lands.
2. **No OpenTelemetry / distributed tracing.** No OTel SDK, no collector, no spans. Deferred to a follow-up change once the Prometheus surface proves stable.
3. **No Redis as refresh-token storage source of truth.** `AuthService` keeps Postgres as the sole source of truth for rotation + family-revocation, matching the precedent set by `IolProvider` ("in-process for single-instance dev; defer to Redis when multi-instance"). Redis still wins for auth *via* Throttler storage.
4. **No Redis Cluster / Sentinel / HA topology.** Single-node Redis is accepted. Documented as a future migration.
5. **No Loki / log aggregation.** Logs stay where they are (stdout + `Logger`). Grafana dashboards cover metrics only.
6. **No change to the public API surface.** No new endpoints, no breaking changes. Existing endpoints get faster; `/metrics` (9464, internal) is the only new route and is not exposed to host in `.all.yml`.

---

## 5. Scope

### In scope

Reference: [`explore.md` Affected Areas](../../docs/sdd/redis-grafana-integration/explore.md) table.

| Path | One-line justification |
|---|---|
| [`docker-compose.all.yml`](../../docker-compose.all.yml) | Uncomment `redis` service block + add `redis_data` named volume + add `prometheus` + `grafana` + `redis-exporter` services. |
| [`docker-compose.yml`](../../docker-compose.yml), [`docker-compose.dev.yml`](../../docker-compose.dev.yml) | Add `redis-exporter` sidecar alongside existing Redis. |
| [`docker-compose.observability.yml`](../../docker-compose.observability.yml) (new) | Dev-only overlay exposing Prometheus 9090 + Grafana 8300 to `127.0.0.1`. |
| [`apps/backend/src/app.module.ts`](../../apps/backend/src/app.module.ts) | Wire `ThrottlerModule.forRoot([...], { storage: new ThrottlerStorageRedisService(client) })`, import `RedisModule`, `PrometheusModule`. |
| [`apps/backend/src/redis/`](../../apps/backend/src/redis/) (new) | `RedisModule` exposing `REDIS_CLIENT` (shared `ioredis.Redis`) + lifecycle hooks. |
| [`apps/backend/src/cache/`](../../apps/backend/src/cache/) (new) | `CacheService` wrapper (`getOrSet<T>`, `invalidate`, `invalidateByPrefix`), `CacheNamespace` enum. |
| [`apps/backend/src/market/market.service.ts`](../../apps/backend/src/market/market.service.ts) | Wrap the `buildResponse` result with `cacheService.getOrSet('ohlc', key, 60, fn)`. Key = `fc:cache:ohlc:{symbol}:{interval}:{limit}:{startTime}`. |
| [`apps/backend/src/market/market.gateway.ts`](../../apps/backend/src/market/market.gateway.ts) | `handleSubscribe` reads `fc:cache:px:{symbol}` (TTL 2s) before re-fetching. |
| [`apps/backend/src/symbols/symbols.service.ts`](../../apps/backend/src/symbols/symbols.service.ts) | Wrap `findAll` with `getOrSet('symbols', normalizedQuery, 300 ±10% jitter, fn)`. |
| [`apps/backend/src/prisma/prisma.service.ts`](../../apps/backend/src/prisma/prisma.service.ts) | Add `$on('query')` → `prisma_query_duration_seconds` histogram. |
| [`apps/backend/src/auth/auth.service.ts`](../../apps/backend/src/auth/auth.service.ts) | Increment `auth_events_total` on `login_success`, `login_fail`, `refresh_rotate`, `refresh_revoke`, `register_success`. |
| [`apps/backend/src/metrics/`](../../apps/backend/src/metrics/) (new) | Counter / Histogram / Gauge providers + HTTP duration interceptor. |
| [`apps/backend/src/main.ts`](../../apps/backend/src/main.ts) | No changes expected; observability mounts via module imports. |
| [`apps/backend/package.json`](../../apps/backend/package.json) | Add `ioredis`, `@nestjs/throttler-storage-redis`, `@willsoto/nestjs-prometheus`, `prom-client`. |
| [`ops/prometheus/prometheus.yml`](../../ops/prometheus/prometheus.yml) (new) | Scrape `backend:9464`, `redis-exporter:9121`, self. |
| [`ops/grafana/provisioning/datasources/prometheus.yml`](../../ops/grafana/provisioning/datasources/prometheus.yml) (new) | Datasource provider pointing at `http://prometheus:9090`. |
| [`ops/grafana/provisioning/dashboards/dashboards.yml`](../../ops/grafana/provisioning/dashboards/dashboards.yml) (new) | Provider config mounting [`ops/grafana/dashboards/`](../../ops/grafana/dashboards/). |
| [`ops/grafana/dashboards/fcharts-overview.json`](../../ops/grafana/dashboards/) (new) | Request rate, p95, error rate, throttler blocks. |
| [`ops/grafana/dashboards/fcharts-cache.json`](../../ops/grafana/dashboards/) (new) | Cache hit ratio, Redis ping latency, Prisma p95 by model. |
| [`ops/grafana/dashboards/fcharts-auth.json`](../../ops/grafana/dashboards/) (new) | `auth_events_total` by `event` label. |
| [`.env.example`](../../.env.example) | Document `REDIS_URL`, `REDIS_PASSWORD` (optional), `REDIS_REQUIRED` (default `false`), `GRAFANA_ADMIN_PASSWORD`, `PROMETHEUS_PORT` (9464), `GRAFANA_PORT` (8300). |
| [`apps/backend/src/test/`](../../apps/backend/src/test/) | Add `redis.mock.ts` mirroring the `prisma.mock.ts` pattern; add unit specs for `CacheService`, throttler integration test. |
| [`docs/sdd/redis-grafana-integration/`](../../docs/sdd/redis-grafana-integration/) | This proposal, plus the downstream `spec.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `archive-report.md`. |

### Out of scope (concrete exclusions)

- Multi-instance backend topology (Redis replica, Sentinel, Cluster).
- OpenTelemetry SDK, collector, span export, trace sampling.
- Refresh-token storage in Redis (Postgres stays sole source of truth).
- Loki / Promtail / log aggregation / structured-log shipping.
- New REST endpoints; new WebSocket events; any client-facing change.
- Cache invalidation APIs (no manual purge endpoint in v1).
- Migration of `IolProvider`'s OAuth-token cache to Redis (kept in-process, same single-instance assumption).
- User-profile cache (deferred; stale-user risk outweighs the saving).

---

## 6. Approach (high-level)

Three sequential PRs, **stacked-to-main** (each merges to main; no integration branch). Order chosen so that PR1 builds confidence with the smallest surface, PR2 unlocks the cache wins, PR3 layers observability on top.

### PR1 — `infra(redis): wire Redis container + NestJS RedisModule`

- Uncomment the `redis:` service block in [`docker-compose.all.yml`](../../docker-compose.all.yml) (preserving the healthcheck and named volume); re-enable the `redis_data:` named volume.
- Add new `apps/backend/src/redis/` module exporting `REDIS_CLIENT` as a shared `ioredis.Redis` instance with `retryStrategy`, `maxRetriesPerRequest`, `enableReadyCheck: true`.
- Lifecycle: `OnModuleInit` calls `redis.ping()` and logs `Redis connected` when `REDIS_REQUIRED=true`; when `REDIS_REQUIRED=false` (default in dev) missing Redis only warns.
- Add `REDIS_URL` to [`apps/backend/src/redis/redis.module.ts`](../../apps/backend/src/redis/) via `ConfigService`; document `REDIS_REQUIRED`, `REDIS_PASSWORD` in [`.env.example`](../../.env.example).
- `apps/backend/package.json`: add `ioredis` (no other deps in this PR).
- Unit test: `apps/backend/src/redis/redis.service.spec.ts` with a mocked `ioredis.Redis` — verifies `ping()` returns `'PONG'` and that a connection error emits the expected log message.
- **Approx. lines:** 150-200 (excluding generated `node_modules` lockfile churn).

### PR2 — `feat(cache): OHLC + symbols + WS last-price + Throttler Redis storage`

- New `apps/backend/src/cache/`:
  - `cache.service.ts` exposing `getOrSet<T>(namespace, key, ttlSec, loader)`, `invalidate(namespace, key)`, `invalidateByPrefix(namespace)`. Namespaces = `'ohlc' | 'symbols' | 'px'`. Counters `cache_hits_total{namespace}` and `cache_misses_total{namespace}` registered with `PrometheusModule` (counters wired here, the `/metrics` endpoint is added in PR3).
  - `CacheModule` is `@Global()`.
- `MarketService.getOhlcData`: wrap the final `buildResponse` return in `cacheService.getOrSet('ohlc', buildKey(query), 60, () => buildResponse(...))`. Key includes `symbol`, `interval`, `limit`, `startTime`. Existing DB-level 90% threshold stays — Redis sits in front of it.
- `SymbolsService.findAll`: wrap with `cacheService.getOrSet('symbols', normalizedQuery, jitter(300), () => findAll(...))`. Jitter helper = `ttl * (0.9 + Math.random() * 0.2)`. Add `SET NX EX 5` request-coalescing lock to dampen stampedes (lock key `fc:cache:symbols:lock:{hash}`).
- `MarketGateway.handleSubscribe`: read `fc:cache:px:{symbol}` with 2s TTL; if hit, emit immediately and skip provider call.
- `app.module.ts`: swap throttler storage to `ThrottlerStorageRedisService(client)`. Confirm TTL units: Throttler uses **ms**, `ioredis` SETEX uses **s** — pass seconds explicitly via the adapter's `config` arg.
- `apps/backend/package.json`: add `@nestjs/throttler-storage-redis`.
- Tests:
  - `cache.service.spec.ts` — mocked `ioredis`, validates `getOrSet` hit/miss counter increments + lock behavior.
  - `throttler.spec.ts` (integration) — 100 req/min from one IP → 100 OK, 101st → 429.
- **Approx. lines:** 300-400.

### PR3 — `feat(observability): Prometheus + Grafana + /metrics + first dashboards`

- New `apps/backend/src/metrics/`:
  - `prometheus.module.ts` importing `PrometheusModule.register({ defaultMetrics: { enabled: true }, path: '/metrics' })` — `@willsoto/nestjs-prometheus`.
  - `metrics.service.ts` exporting typed `Counter` / `Histogram` / `Gauge` factories backed by `prom-client` registries.
  - `http-duration.interceptor.ts` recording `http_request_duration_seconds{method, route, status_code}` + `http_requests_total{method, route, status_code}`. Bind globally via `APP_INTERCEPTOR`.
  - `throttler.filter.ts` (or `OnModuleInit` hook) incrementing `throttler_blocked_total{name, route}`.
- `PrismaService`: register `$on('query')` → observe `prisma_query_duration_seconds{model, action}`.
- `AuthService`: increment `auth_events_total{event}` at each known transition (5 events).
- `MarketGateway`: gauge `ws_active_connections{namespace='market'}` updated in `handleConnection` / `handleDisconnect`.
- `RedisService`: scheduled task (every 15s) calls `redis.ping()` and updates gauge `redis_ping_latency_seconds`.
- New `ops/` tree: `prometheus/prometheus.yml`, `grafana/provisioning/datasources/prometheus.yml`, `grafana/provisioning/dashboards/dashboards.yml`, `grafana/dashboards/fcharts-{overview,cache,auth}.json`.
- `docker-compose.all.yml`: add `prometheus`, `grafana`, `redis-exporter` services (no host port publishes for prometheus/grafana; redis-exporter bound to `127.0.0.1:9110`).
- `docker-compose.observability.yml` (new): dev overlay that binds prometheus `9090` and grafana `8300` to `127.0.0.1`.
- `apps/backend/package.json`: add `@willsoto/nestjs-prometheus`, `prom-client`. `prometheus` image in compose.
- **Approx. lines:** 250-350.

**Total: ~750-950 lines of new code + ~150 lines of changes to existing files. Each PR individually under the 400-line budget.**

---

## 7. Acceptance criteria (testable)

### PR1

- [ ] `redis` service is uncommented in [`docker-compose.all.yml`](../../docker-compose.all.yml) and the `redis_data` named volume is present.
- [ ] `docker compose -f docker-compose.all.yml up -d redis` brings `fc-redis` to `service_healthy` within 15s; `docker inspect --format='{{.State.Health.Status}}' fc-redis` → `healthy`.
- [ ] `pnpm dev:backend` logs `Redis connected` when `REDIS_REQUIRED=true` and Redis is reachable.
- [ ] With `REDIS_REQUIRED=false` (default) and Redis unreachable, the backend logs `Redis unavailable, running without cache` (warn) and starts normally — no crash, no stack trace.
- [ ] `REDIS_URL`, `REDIS_REQUIRED`, `REDIS_PASSWORD` documented in [`.env.example`](../../.env.example).
- [ ] Unit test `apps/backend/src/redis/redis.service.spec.ts`: `RedisService.ping()` returns `'PONG'` against a mocked `ioredis.Redis`; connect failure logs the expected message and does not throw.

### PR2

- [ ] OHLC cache hit rate ≥ 95% under a sustained 100 RPS load on `/api/v1/market/ohlc?symbol=BTCUSDT&interval=1d&limit=200` for 30s (asserted via `cache_hits_total{namespace="ohlc"} / (cache_hits_total + cache_misses_total)`).
- [ ] Symbols cache hit rate ≥ 90% under a scripted catalog-browsing pattern (same query string repeated 50× in a loop).
- [ ] WS `handleSubscribe` emits the cached `fc:cache:px:{symbol}` within 2s of the last tick; if no cached value, falls through to the provider (no regression).
- [ ] Throttler integration test: 100 requests/minute from one IP → 100 × 200; 101st → 429.
- [ ] Throttler survives Redis restart (kill `fc-redis`, bring it back): first request after recovery re-hydrates the counter from a fresh start without a 500 storm (acceptable to allow burst within the TTL window until counter re-anchors).
- [ ] All unit tests pass: `pnpm --filter backend test` is green.
- [ ] No regressions in existing auth/portfolio/market unit specs.

### PR3

- [ ] `curl -s http://localhost:9464/metrics` (or `curl http://backend:9464/metrics` from inside the container) returns Prometheus exposition with `text/plain; version=0.0.4` content type.
- [ ] All 9 metrics appear in the exposition with the expected labels:
  - `http_request_duration_seconds`, `http_requests_total`
  - `cache_hits_total`, `cache_misses_total`
  - `throttler_blocked_total`
  - `prisma_query_duration_seconds`
  - `auth_events_total`
  - `ws_active_connections`
  - `redis_ping_latency_seconds`
- [ ] `docker compose -f docker-compose.all.yml up -d` brings Grafana to healthy within 30s.
- [ ] Grafana auto-provisions the Prometheus datasource on first boot (no manual UI click); verifiable at `/api/datasources`.
- [ ] Three dashboards load without JSON parse errors and show non-zero data after 60s of warm-up traffic: `fcharts-overview`, `fcharts-cache`, `fcharts-auth`.
- [ ] Prometheus targets page shows `up{job="backend"} = 1`, `up{job="redis-exporter"} = 1`, `up{job="prometheus"} = 1`.
- [ ] `GRAFANA_ADMIN_PASSWORD` is required — starting Grafana without it fails the container with a clear error.

---

## 8. Risks (carry-over from explore, condensed)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Redis is a single point of failure** — Redis dies → Throttler returns 500, OHLC cache misses fall through to Postgres (acceptable), but rate-limiting is silently off. | AOF persistence (`--appendonly yes`); document future Sentinel migration in the runbook; single-node Redis is accepted for v1. |
| 2 | **Cache stampede on symbol catalog expiry** — hundreds of concurrent misses pile into Postgres. | ±10% TTL jitter; `SET NX EX 5` request-coalescing lock on `fc:cache:symbols:lock:{hash}`. |
| 3 | **Throttler unit mismatch** — `ioredis` uses seconds, Throttler config uses ms; silent over- or under-throttling. | Pass seconds explicitly via `ThrottlerStorageRedisService` config; integration test asserts 100/min → 429; `throttler_blocked_total` counter exposes drift. |
| 4 | **Grafana exposed publicly** with default `admin/admin`. | Required `GRAFANA_ADMIN_PASSWORD` env var; bind Grafana to `127.0.0.1:8300` only (host-side). Document in `.env.example` and the runbook. |
| 5 | **Prometheus scrape config leaks secrets** if carelessly shared. | No `basic_auth` blocks in v1; if remote-write is ever added, creds go through Docker `secrets:` not `environment:`. |

---

## 9. Open Product Questions

None — `explore.md` recommendations are accepted as-is. Every decision has a defensible recommendation grounded in the current codebase, and the user explicitly chose automatic mode. Decisions deferred (refresh-token storage, OpenTelemetry, multi-instance Redis, Loki) are explicitly non-goals in §4 and are not "open questions" — they are deferred with rationale.

---

## Return Envelope

```yaml
status: success
artifacts:
  - b:\github\fcharts\docs\sdd\redis-grafana-integration\proposal.md
next_recommended: sdd-spec  # sdd-design can run in parallel per dependency graph
key_decisions:
  - Redis client: ioredis direct via custom RedisModule (shared client across cache + throttler; no cache-manager adapter churn).
  - Throttler storage swap: ThrottlerStorageRedisService; explicit MS→S conversion in storage config; integration test asserts 100/min → 429.
  - Cache surface: OHLC 60s + Symbols 300s ±10% jitter + WS last-price 2s; refresh-token and user-profile caches deferred.
  - Observability: Prometheus + Grafana + @willsoto/nestjs-prometheus; 9 metrics; repo-mounted dashboards under ops/grafana/.
  - Compose topology: Redis uncommented in .all.yml; new docker-compose.observability.yml dev overlay for 127.0.0.1 ports.
open_product_questions: none
risks_count: 5
pr_count: 3
pr_strategy: stacked-to-main
```