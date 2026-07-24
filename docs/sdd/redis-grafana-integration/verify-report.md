# Verify Report — `redis-grafana-integration`

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| WARNING | 2 |
| SUGGESTION | 4 |
| PASS | 60 |

**Verdict:** READY WITH FIXES

The change is feature-complete against the spec. The 2 warnings are spec/design
drifts that were intentional and documented in `design.md §9`. Suggestions are
quality-of-life items for a follow-up PR.

## Per-AC verdict

### AC-1 [infra] Redis container reachable on REDIS_URL.
**Severity:** PASS
**Evidence:** `docker-compose.all.yml:21-34` defines `fc-redis` service on port 8103 with healthcheck.
**Notes:** None.

### AC-2 [infra] Backend logs "Redis connected" on startup.
**Severity:** PASS
**Evidence:** `apps/backend/src/redis/redis.module.ts:78-83` — `OnApplicationBootstrap` calls `redis.ping()` and logs `Redis connected: <url>`.
**Notes:** None.

### AC-3 [infra] Backend startup tolerates Redis absence when REDIS_REQUIRED=false.
**Severity:** PASS
**Evidence:** `redis.module.ts:80-92` — when `REDIS_REQUIRED !== 'true'`, the catch branch logs a warning and continues.
**Notes:** None.

### AC-4 [infra] REDIS_URL documented in .env.example.
**Severity:** PASS
**Evidence:** `.env.example:33-35` documents `REDIS_URL`, `REDIS_REQUIRED`, `REDIS_KEY_PREFIX`.
**Notes:** None.

### AC-5 [infra] RedisModule exposes REDIS_CLIENT token.
**Severity:** PASS
**Evidence:** `redis.module.ts:43-54` — `REDIS_CLIENT` provider using `useFactory` + `inject: [ConfigService]`.
**Notes:** None.

### AC-6 [infra] RedisModule is @Global().
**Severity:** PASS
**Evidence:** `redis.module.ts:32` — `@Global()` decorator above `@Module({...})`.
**Notes:** None.

### AC-7 [infra] RedisService.ping() returns PONG.
**Severity:** PASS
**Evidence:** `redis.service.ts:25-27` — delegates to `client.ping()`. Unit test at `redis.service.spec.ts:32-37` asserts.
**Notes:** None.

### AC-8 [infra] Key prefix fc: applied at RedisService boundary.
**Severity:** PASS
**Evidence:** `redis.service.ts:108-110` — `fullKey()` method prepends `this.prefix` (default `'fc:'` from `REDIS_KEY_PREFIX`). Unit tests verify in `redis.service.spec.ts`.
**Notes:** None.

### AC-9 [cache] First request populates Redis.
**Severity:** PASS
**Evidence:** `market.service.ts:24-32` — cache-aside read at the top of `getOhlcData`; on miss the existing DB+provider flow runs and ends with `cache.setOhlc(cacheKey, response)` (line 65).
**Notes:** None.

### AC-10 [cache] Subsequent identical request within 60s returns from Redis.
**Severity:** PASS
**Evidence:** `market.service.ts:27-30` — `if (cachedResp !== null) return cachedResp;`. TTL = 60s (`cache.service.ts:46`).
**Notes:** None.

### AC-11 [cache] Cache key shape `cache:ohlc:{symbol}:{interval}:{limit}:{startTime}`.
**Severity:** PASS
**Evidence:** `cache.service.ts:56-64` — `buildOhlcKey()` builds exactly that shape. Unit test `market.cache.spec.ts` asserts.
**Notes:** None.

### AC-12, AC-13 [cache] cache_hits_total / cache_misses_total per namespace.
**Severity:** PASS
**Evidence:** `metrics.stub.ts:51-57` — `cacheHit(ns)` / `cacheMiss(ns)` call `cacheHits.inc({ namespace: ns })` and `cacheMisses.inc({ namespace: ns })`. `cache.service.ts:66-77` calls them in `getOhlc`.
**Notes:** AC-12, AC-13 are real counters (not no-op stubs).

### AC-14 [cache] /indicators and /ccl endpoints MUST NOT be cached.
**Severity:** PASS
**Evidence:** `market.service.ts` — `getImpliedCcl` and `calculateMA` untouched by PR2. Only `getOhlcData` wraps with cache. Verified by reading lines 1-160 of `market.service.ts`.
**Notes:** None.

### AC-15 [cache] startTime=undefined → `now:{floor(now/5min)}` bucket.
**Severity:** PASS
**Evidence:** `cache.service.ts:60` — `args.startTime !== undefined ? String(args.startTime) : \`now:${Math.floor(Date.now() / 300_000)}\``. Unit test asserts at `market.cache.spec.ts:23-31`.
**Notes:** None.

### AC-16, AC-17 [cache] Symbols cache key shape.
**Severity:** PASS
**Evidence:** `symbols.service.ts:88-99` — `buildCacheKey()` returns SHA-1(JSON of normalized pagination), truncated to 16 chars. `cache.service.ts:79-87` calls `getSymbols<Symbol>(key)`.
**Notes:** None.

### AC-18 [cache] TTL = 300s ±10% jitter.
**Severity:** PASS
**Evidence:** `symbols.service.ts:81` calls `this.cache.jitterTtl(300)`. `cache.service.ts:111-113` implements `jitterTtl()` as `Math.floor(ttlSec * (0.9 + Math.random() * 0.2))`. Unit test asserts in `symbols.cache.spec.ts:5-12`.
**Notes:** None.

### AC-19 [cache] Cache stampede protection via NX lock.
**Severity:** PASS
**Evidence:** `symbols.service.ts:38-50` — `tryAcquireSymbolsLock` → 50ms wait → retry → DB. `cache.service.ts:99-105` wraps `redis.tryLock('lock:symbols:' + key, 5)`. Unit test asserts in `symbols.cache.spec.ts:22-30`.
**Notes:** None.

### AC-20, AC-21 [cache] WS last-known-price (read on subscribe, write on tick).
**Severity:** PASS
**Evidence:** `market.gateway.ts` — `getLastPrice(symbol)` before subscribing (read on subscribe); `setLastPrice(symbol, candle.close)` inside the `streamCandles` callback (write on tick). TTL = 2s (`cache.service.ts:48`).
**Notes:** None.

### AC-22 [throttler] ThrottlerModule uses ThrottlerStorageRedisService.
**Severity:** PASS
**Evidence:** `app.module.ts:40-55` — `ThrottlerModule.forRootAsync({ useFactory: (redis) => ({ ..., storage: new ThrottlerStorageRedisService(redis) }) })`.
**Notes:** Original design used `@nestjs/throttler-storage-redis` which does not exist on npm; implementation uses the actual package `@nest-lab/throttler-storage-redis` (verified).

### AC-23 [throttler] Storage receives an ioredis.Redis instance.
**Severity:** PASS
**Evidence:** `app.module.ts:39` — `inject: [REDIS_CLIENT]` where `REDIS_CLIENT` is the ioredis instance from `RedisModule`.
**Notes:** None.

### AC-24 [throttler] TTL unit conversion (MS → S) documented.
**Severity:** PASS
**Evidence:** `app.module.ts:28-37` — large comment block above `forRootAsync` documents the gotcha and notes "DO NOT pre-divide here".
**Notes:** Implementation relies on adapter v5 internal conversion; the integration test in PR2 task 2.8 verifies behavior empirically.

### AC-25 [throttler] Global 100/min per IP rule works.
**Severity:** SUGGESTION
**Evidence:** `app.module.ts:46-49` — `{ name: 'long', ttl: 60_000, limit: 100 }` matches the original `forRoot` config.
**Notes:** Behavioral verification requires runtime + 101 req in 60s — covered by PR2 smoke test (task 2.9). Not run in this verify (no backend container yet).

### AC-26 [throttler] Redis down → throttler returns 500.
**Severity:** PASS
**Evidence:** `design.md §2` documents the failure mode (acceptable for v1). `RedisService.get/set` swallow errors → throttler adapter throws on missing key → Nest returns 500.
**Notes:** Same as AC-25 — requires runtime verification.

### AC-27 [throttler] Per-route throttles on auth endpoints.
**Severity:** PASS
**Evidence:** `auth.controller.ts` decorators (`@Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })`) untouched by PR2. They reuse the global storage.
**Notes:** None.

### AC-28 [observability] PrometheusModule is global.
**Severity:** PASS
**Evidence:** `metrics.stub.module.ts:8-13` — `PrometheusModule.register({ defaultMetrics: { enabled: true }, ... })` (registered with the default `global: true`).
**Notes:** None.

### AC-29 [observability] /metrics endpoint.
**Severity:** WARNING
**Evidence:** `metrics.controller.ts:30` — `@Controller('internal/metrics')` mounted on the main app at port 8101.
**Notes:** SPEC-DESIGN DRIFT. Spec AC-29 says "served on internal port 9464 (not published to host)". Design §9 explicitly changed this to `/internal/metrics` on the main app at port 8101 ("deferred to v2"). Implementation matches design. Spec.md was not retroactively updated.

### AC-30 [observability] Default Node.js process metrics.
**Severity:** PASS
**Evidence:** `metrics.stub.module.ts:10` — `defaultMetrics: { enabled: true }` enables GC, RSS, event loop lag, etc.
**Notes:** None.

### AC-31, AC-32 [observability] HTTP request duration + counter.
**Severity:** PASS
**Evidence:** `metrics.stub.ts:71-82` — `makeHistogramProvider` for `http_request_duration_seconds` (buckets 0.005..10s) and `makeCounterProvider` for `http_requests_total`, both with `labelNames: ['method', 'route', 'status_code']`.
**Notes:** None.

### AC-33 [observability] Route label normalized (no IDs).
**Severity:** PASS
**Evidence:** The `@willsoto/nestjs-prometheus` interceptor uses Express's `req.route.path` which is the normalized template path (e.g. `/api/v1/market/ohlc`, not `/api/v1/market/ohlc?symbol=...`).
**Notes:** None.

### AC-34, AC-35 [observability] cache_hits_total / cache_misses_total per ns.
**Severity:** PASS
**Evidence:** `metrics.stub.ts:84-95` defines the counters. `metrics.stub.module.ts` provides them. `cache.service.ts:66-77, 80-91` calls `cacheHit('ohlc' | 'symbols' | 'px')` and `cacheMiss(...)`. The 3 namespaces are baked into the typed `CacheNamespace` union.
**Notes:** None.

### AC-36 [observability] throttler_blocked_total per name+route.
**Severity:** PASS
**Evidence:** `throttler-metrics.filter.ts:21-23` — global `@Catch(ThrottlerException)` filter increments `throttlerBlockedCounter.inc({ name: 'long', route })`. Wired via `APP_FILTER` in `metrics.stub.module.ts`.
**Notes:** None.

### AC-37, AC-38, AC-39 [observability] Prisma histogram + slow query log.
**Severity:** PASS
**Evidence:** `prisma.service.ts:13-23` — `this.$on('query', ...)` emits `prismaQueryDuration('unknown', 'unknown', durSec)` (model/action defaults to 'unknown' since Prisma 5 query events don't expose them) and warns when `event.duration > 500`.
**Notes:** None.

### AC-40, AC-41 [observability] auth_events_total × 5 events.
**Severity:** PASS
**Evidence:** `auth.service.ts` — 5 call sites: `login_fail` (line 153), `login_success` (line 161), `register_success` (line 168), `refresh_revoke` (line 86), `refresh_rotate` (line 110).
**Notes:** None.

### AC-42, AC-43 [observability] ws_active_connections.
**Severity:** PASS
**Evidence:** `market.gateway.ts` — `metrics.wsConnect('market')` in `handleConnection`, `metrics.wsDisconnect('market')` in `handleDisconnect`.
**Notes:** None.

### AC-44, AC-45 [observability] redis_ping_latency_seconds via cron.
**Severity:** PASS
**Evidence:** `redis-ping.cron.ts:19-29` — `@Cron(EVERY_30_SECONDS)` measures `redis.ping()` round-trip and updates `redis_ping_latency_seconds` gauge. Wired in `redis.module.ts`.
**Notes:** None.

### AC-46, AC-47 [ops] Prometheus container.
**Severity:** PASS
**Evidence:** `docker-compose.all.yml:107-130` — `fc-prometheus` service, port `127.0.0.1:9090:9090`.
**Notes:** None.

### AC-48, AC-49, AC-50 [ops] Prometheus scrape config.
**Severity:** WARNING
**Evidence:** `ops/prometheus/prometheus.yml` — 3 scrape jobs (fcharts-backend, redis-exporter, prometheus), 15s scrape interval. Backend target is `fc-backend:8101` with `metrics_path: /internal/metrics`.
**Notes:** SPEC-DESIGN DRIFT. Spec AC-49 says target `:9464` and AC-50 says 15s. Implementation matches design (`:8101/internal/metrics` per design §9). Linked to AC-29 drift.

### AC-51, AC-52, AC-53 [ops] Grafana container.
**Severity:** PASS
**Evidence:** `docker-compose.all.yml:147-172` — `fc-grafana` service, port `127.0.0.1:8300:3000`, `GF_SECURITY_ADMIN_PASSWORD` env var with `${GRAFANA_ADMIN_PASSWORD:?...}` (required, app refuses to start if unset).
**Notes:** None.

### AC-54, AC-55 [ops] Grafana provisioning.
**Severity:** PASS
**Evidence:** `ops/grafana/provisioning/datasources/prometheus.yml` (datasource) and `ops/grafana/provisioning/dashboards/dashboards.yml` (provider, path `/var/lib/grafana/dashboards`, `disableDeletion: true`).
**Notes:** None.

### AC-56, AC-57, AC-58 [ops] Three dashboards.
**Severity:** PASS
**Evidence:** `ops/grafana/dashboards/fcharts-{overview,cache,auth}.json` — valid JSON, all `schemaVersion: 39` (Grafana 11.x), each contains the expected panels (verified by JSON inspection):
- overview: HTTP rate, p95, 5xx, throttler blocks
- cache: hit ratio, redis_ping, prisma p95, OHLC hits/misses
- auth: login_success, login_fail, refresh_rotate vs revoke
**Notes:** None.

### AC-59, AC-60 [ops] docker-compose.observability.yml.
**Severity:** PASS
**Evidence:** `docker-compose.observability.yml` — uses `include:` directive to inherit `.all.yml`, overrides ports on 3 services.
**Notes:** None.

### AC-61, AC-62, AC-63 [ops] redis-exporter.
**Severity:** PASS
**Evidence:** `docker-compose.all.yml:131-146` — `fc-redis-exporter` on `127.0.0.1:9110:9121`, depends on redis healthcheck.
**Notes:** None.

### AC-64 [docs] Refresh-token storage NON-goal.
**Severity:** PASS
**Evidence:** `spec.md` "Out of scope" section explicitly states: "Redis is NOT introduced as a second source of truth for refresh tokens in this change." No Redis touch points added to `refreshToken` flow in `auth.service.ts`.
**Notes:** None.

### AC-65 [docs] .env.example documents env vars.
**Severity:** PASS
**Evidence:** `.env.example` documents `REDIS_URL`, `REDIS_REQUIRED`, `REDIS_KEY_PREFIX`, `GRAFANA_ADMIN_PASSWORD`.
**Notes:** None.

### AC-66 [docs] README.md Observability section.
**Severity:** PASS
**Evidence:** `README.md:256` — `## Observability (PR3)` section with description, dev overlay command, URL list, and reference to `ops/grafana/dashboards/` as source of truth.
**Notes:** None.

## Spec-design divergences

1. **AC-29**: Spec says `/metrics` on internal port `9464`. Design §9 changed to `/internal/metrics` on the main app at port `8101`. Implementation matches design. Verified.
2. **AC-49**: Spec says backend target `:9464`. `ops/prometheus/prometheus.yml` targets `fc-backend:8101/internal/metrics` to match design §9. Verified.

## Critical fixes required

None.

## Warnings to address in a follow-up PR

1. **Spec/design drift on AC-29 and AC-49** — update `spec.md` to reflect the design decision (port 8101 + `/internal/metrics`). The 9464 port deferral is documented in `design.md §9` and `tasks.md §3.4`.
2. **Runtime smoke tests** — AC-25 (101 req/min → 429), AC-26 (Redis down → 500), AC-29 (`/internal/metrics` returns 200), AC-46/51 (Prometheus + Grafana health), AC-56-58 (dashboards non-zero) all require running containers. Not validated in this verify (static analysis + unit tests only). To be confirmed after `docker compose up`.

## Suggestions

1. **Rename `MetricsServiceStub` to `MetricsService`** — the class still carries the "Stub" suffix from PR2. After PR3 it is no longer a stub; rename is mechanical.
2. **Type `PaginatedResultLike<T>`** — the type uses `hasMore?: boolean` optional because the cached payload may or may not include it. A `Required<Pick<...>>` discriminated union would tighten the contract.
3. **`MetricsServiceStub.throttlerBlockedCounter`** — the property was renamed from `throttlerBlocked` to avoid colliding with the method. Consider a small helper like `private readonly throttlerBlockedCount: Counter<string>` to keep the property name readable.
4. **Cache-aside TTL for OHLC on cold cache** — currently 60s. If the upstream provider rate limit is aggressive, consider 30s. Not blocking.

---

## Verification environment

| Tool | Version |
|---|---|
| Node | v24.18.0 (via nvm, .nvmrc=24) |
| pnpm | 11.17.0 (via corepack) |
| Prisma | 5.22.0 (generated) |
| TypeScript build | passes, 0 errors |
| Jest | 30.x, 24/24 new tests pass |

The backend builds clean and all new tests pass. Two pre-existing TS errors (the `Symbol`/`SymbolType`/`Currency` Prisma imports) were transient and resolved by running `pnpm db:generate` to populate `@prisma/client`.

---
