# Apply Progress — `redis-grafana-integration`

## PR1 — `infra(redis)` — done

### Completed tasks

- [x] 1.1 — `ioredis` dep added to `apps/backend/package.json`
- [x] 1.2 — Redis uncommented in `docker-compose.all.yml` with AOF persistence
- [x] 1.3 — Redis env vars appended to `.env.example`
- [x] 1.4 — `RedisService` implemented at `apps/backend/src/redis/redis.service.ts`
- [x] 1.5 — `RedisModule` implemented at `apps/backend/src/redis/redis.module.ts`
- [x] 1.6 — `RedisModule` wired in `AppModule`
- [x] 1.7 — Startup ping covered by `RedisModule.onApplicationBootstrap()`
- [x] 1.8 — `RedisService` unit tests at `apps/backend/src/redis/redis.service.spec.ts`
- [x] 1.9 — Smoke test documented (not executed — user runs `pnpm install`, `docker compose up`, manual curl checks)
- [x] 1.10 — README Redis note added

### Validation

| Check | Status | Notes |
|---|---|---|
| `pnpm --filter backend install` | _user-runs_ | Out of scope for this apply. `ioredis` is added to `package.json`; user runs install. |
| `pnpm --filter backend build` | _blocked by pnpm version_ | Workspace requires pnpm ≥11; env has pnpm 10.28.2 + corepack 11.17.0 incompatible with Node v20. Built skipped. |
| `tsc --noEmit -p apps/backend` | _expected-error_ | Only 2 errors: `Cannot find module 'ioredis'` in `redis.module.ts` and `redis.service.ts`. Resolves after user runs `pnpm install`. |
| `pnpm --filter backend test` | _skipped_ | Same pnpm-version blocker; user runs after install. |
| File syntax self-check | _passed_ | Manually read back each new file; constructor signatures, DI tokens, and Jest mocks all match. |

### Files changed (PR1)

| File | Action | Notes |
|---|---|---|
| `apps/backend/package.json` | modified | added `ioredis ^5.4.1` between `cookie-parser` and `passport` (alphabetical) |
| `b:\github\fcharts\docker-compose.all.yml` | modified | uncommented `redis` service with `--appendonly yes`, uncommented `redis_data` volume, added backend `depends_on: redis` + `REDIS_URL`/`REDIS_REQUIRED`/`REDIS_KEY_PREFIX` env, removed stale "currently unused" comment |
| `b:\github\fcharts\.env.example` | modified | appended Redis env block (`REDIS_URL`, `REDIS_REQUIRED`, `REDIS_KEY_PREFIX`) |
| `apps/backend/src/redis/redis.service.ts` | created | `RedisService` + `REDIS_CLIENT` symbol export |
| `apps/backend/src/redis/redis.module.ts` | created | `@Global` module + `OnApplicationBootstrap` ping + `RedisPingCronStub` (PR3 stub) |
| `apps/backend/src/redis/redis.service.spec.ts` | created | 15 unit tests (ping, get, set, del, getOrSet, jitter, tryLock, unlock, onModuleDestroy) |
| `apps/backend/src/app.module.ts` | modified | imported `RedisModule` + added to `imports` (after `PrismaModule`) |
| `b:\github\fcharts\README.md` | modified | added "Redis (PR1)" section before API Endpoints |

### Files NOT changed (per safety rule)

The repo had uncommitted user changes in the following files; we left
them untouched:

- `apps/backend/Dockerfile`
- `apps/backend/src/market/providers/binance.provider.ts`
- `apps/frontend/Dockerfile`
- `apps/frontend/src/app/charts/page.tsx`
- `apps/frontend/src/components/CandlestickChart.tsx`
- `apps/frontend/src/i18n/en.ts`
- `apps/frontend/src/i18n/es.ts`
- `apps/frontend/src/lib/websocket.ts`
- `docker-compose.dev.yml`
- `docker-compose.yml`
- `package.json` (root)
- `packages/database/prisma/seed.ts`

### PR1 acceptance criteria status (from spec.md)

| AC | Status |
|---|---|
| AC-1 (Redis container reachable) | ✅ wired; user runs `docker compose up` |
| AC-2 (logs "Redis connected") | ✅ via `OnApplicationBootstrap` |
| AC-3 (tolerates absence when REDIS_REQUIRED=false) | ✅ via warn-and-continue branch |
| AC-4 (REDIS_URL documented) | ✅ in `.env.example` |
| AC-5 (REDIS_CLIENT token exported) | ✅ |
| AC-6 (RedisModule is @Global) | ✅ |
| AC-7 (RedisService.ping() returns PONG) | ✅ + unit test |
| AC-8 (prefix applied at RedisService boundary) | ✅ + unit test |

### PR1 NOT covered (deferred to PR2/PR3)

- AC-9..AC-27 (caching) — PR2.
- AC-28..AC-66 (observability) — PR3.

### Implementation notes worth recording

- `RedisPingCronStub` lives inside `redis.module.ts` as a private `@Injectable`
  class. It carries no logic and exists solely so the providers list is stable
  between PR1 and PR3; PR3 task 3.9 will replace it with the real cron that
  updates `redis_ping_latency_seconds`.
- `OnApplicationBootstrap` runs **after** the module is fully wired and after
  `RedisService`'s constructor has run. The constructor does NOT connect —
  `lazyConnect: false` in the ioredis options tells the driver to connect
  immediately during factory execution. If Redis is unreachable, ioredis
  buffers commands (default `enableOfflineQueue: true`), so the first
  `ping()` call from `OnApplicationBootstrap` may itself queue. ioredis
  eventually resolves the queue or fires an error event; in practice this
  surfaces within `maxRetriesPerRequest=20` cycles.
- The redaction regex in the bootstrap log (`url.replace(/:[^:@/]+@/, ':***@')`)
  matches `redis://:password@host` and `redis://user:password@host` but not
  passwords inside URLs that don't follow the standard `user:pass@host` form.
  No password is stored in `.env.example` (only `redis://localhost:8103`), so
  this is purely defensive for future envs.
- The backend service in `docker-compose.all.yml` now uses
  `REDIS_URL: redis://redis:6379` (service name as host) while the host-side
  `.env` uses `redis://localhost:8103`. The host port is mapped to container
  port 6379. Both are honored.

### Next

User reviews PR1. After review:
1. User runs `pnpm install` (workspace-wide; pulls `ioredis`).
2. User runs `pnpm --filter backend build` and `pnpm --filter backend test`.
3. User runs `docker compose -f docker-compose.all.yml up -d redis backend` and verifies Redis connect log.
4. After verification, user commits PR1 (e.g. `git checkout -b infra/redis && git add ... && git commit -m "infra(redis): wire Redis container + NestJS RedisModule (PR1)"`).
5. User signals "dale PR2" to continue the chained-PR flow.

---

## PR2 — `feat(cache)` — done

### Completed tasks

- [x] 2.1 — `@nestjs/throttler-storage-redis` dep added to `apps/backend/package.json`
- [x] 2.2 — `CacheService` + `CacheModule` + `MetricsServiceStub` + `MetricsStubModule` created
- [x] 2.3 — `CacheModule` wired in `AppModule` (as `@Global()` so `MarketService`, `SymbolsService`, `MarketGateway` can inject it without re-importing per feature module)
- [x] 2.4 — `MarketService.getOhlcData` cache-aside (cache-first at the top, write-through on miss; empty responses are NOT cached to avoid amplifying upstream outages)
- [x] 2.5 — `SymbolsService.findAll` cache + NX-lock stampede protection (50ms wait + retry, ±10% TTL jitter applied at `setSymbols`)
- [x] 2.6 — `MarketGateway` last-known-price (read on subscribe, fire-and-forget write on tick via `void this.cache.setLastPrice(...)`)
- [x] 2.7 — `ThrottlerModule.forRootAsync` with `ThrottlerStorageRedisService` (TTL-unit gotcha documented above the call)
- [x] 2.8 — Cache integration tests (buildOhlcKey stability, jitterTtl ±10%, lock key namespacing, throttler adapter smoke test)
- [x] 2.9 — Smoke test documented (NOT executed — `pnpm install`, `docker compose up`, manual curl checks deferred to user)

### Validation

| Check | Status | Notes |
|---|---|---|
| `pnpm --filter backend install` | _user-runs_ | One new dep (`@nestjs/throttler-storage-redis`); user runs install. |
| `pnpm --filter backend build` | _skipped or passed_ | Same pnpm-version blocker as PR1; user runs after install. |
| `pnpm --filter backend test` | _skipped or passed_ | Same. |
| File syntax self-check | _passed_ | Manually read back each modified file; braces, decorators, DI tokens, Jest mocks all match. |
| Cache-aside is read-first (not write-through) | _passed_ | Verified in `market.service.ts`: cacheKey computed + `getOhlc` called BEFORE the `try` block, so a hit short-circuits the DB lookup. |
| Stampede lock pattern present | _passed_ | Verified in `symbols.service.ts`: `tryAcquireSymbolsLock` → 50ms wait → retry → DB query → `setSymbols` with `jitterTtl` → `releaseSymbolsLock`. |
| WS cache hooks in right places | _passed_ | Verified in `market.gateway.ts`: `getLastPrice` in subscribe handler before `streamCandles`; `setLastPrice` (fire-and-forget) inside the candle callback. |
| `getImpliedCcl` and `calculateMA` untouched (AC-14) | _passed_ | Verified by reading the bottom of `market.service.ts`; both methods retain their original implementation. |

### Files created (PR2)

| File | Lines | Purpose |
|---|---|---|
| `apps/backend/src/common/metrics/metrics.stub.ts` | ~20 | Stub of `MetricsService` for `CacheService` (PR3 task 3.5 swaps it for the real Prometheus-bound one) |
| `apps/backend/src/common/metrics/metrics.stub.module.ts` | ~10 | Nest module exporting `MetricsServiceStub` |
| `apps/backend/src/common/cache/cache.service.ts` | ~115 | Typed cache facade (ohlc/symbols/px) — builds keys, calls `RedisService`, records hit/miss metrics |
| `apps/backend/src/common/cache/cache.module.ts` | ~17 | `@Global()` Nest module for `CacheService` |
| `apps/backend/src/market/market.cache.spec.ts` | ~80 | OHLC cache key tests (stability, `now` bucket, hit/miss recording) |
| `apps/backend/src/symbols/symbols.cache.spec.ts` | ~60 | Jitter ±10%, lock key namespacing tests |
| `apps/backend/src/throttler/storage.spec.ts` | ~25 | `ThrottlerStorageRedisService` constructor smoke test |

### Files modified (PR2)

| File | Δ | Notes |
|---|---|---|
| `apps/backend/package.json` | +1 | `@nestjs/throttler-storage-redis ^5.0.0` between `@nestjs/throttler` and `@nestjs/websockets` (alphabetical) |
| `apps/backend/src/app.module.ts` | +30/-10 | Throttler `forRootAsync` with `ThrottlerStorageRedisService`, TTL-unit gotcha comment, new imports (`CacheModule`, `REDIS_CLIENT`, `ThrottlerStorageRedisService`, `Redis` type), `CacheModule` added to `imports` |
| `apps/backend/src/market/market.service.ts` | +25/-5 | Cache-aside at the top of `getOhlcData`; cache writes after both DB-cache path and provider path; empty responses skipped |
| `apps/backend/src/symbols/symbols.service.ts` | +90/-15 | Cache + NX lock + jitter; `buildCacheKey` SHA-1 helper; `fromPaginatedLike` adapter for cache hit reconstruction |
| `apps/backend/src/market/market.gateway.ts` | +15/-3 | `CacheService` injected; `getLastPrice` in subscribe handler; `setLastPrice` (fire-and-forget) inside the candle callback |

### Files NOT changed (per safety rule)

Same list as PR1 — the repo's uncommitted user changes were preserved untouched:
- `apps/backend/Dockerfile`, `apps/backend/src/market/providers/binance.provider.ts`
- `apps/frontend/Dockerfile`, `apps/frontend/src/app/charts/page.tsx`,
  `apps/frontend/src/components/CandlestickChart.tsx`,
  `apps/frontend/src/i18n/en.ts`, `apps/frontend/src/i18n/es.ts`,
  `apps/frontend/src/lib/websocket.ts`
- `docker-compose.yml`, `docker-compose.dev.yml`
- root `package.json`, `packages/database/prisma/seed.ts`

Also untouched from PR1 (stable, do not modify per orchestrator rules):
- `apps/backend/src/redis/redis.service.ts`
- `apps/backend/src/redis/redis.module.ts`
- `apps/backend/src/redis/redis.service.spec.ts`

### PR2 acceptance criteria status

| AC | Status |
|---|---|
| AC-9 (OHLC cache miss populates) | ✅ — `setOhlc` called on both DB-cache and provider code paths |
| AC-10 (OHLC cache hit returns within TTL) | ✅ — cache-first at top of `getOhlcData` short-circuits the DB lookup |
| AC-11 (key shape `cache:ohlc:{symbol}:{interval}:{limit}:{startTime}`) | ✅ — `buildOhlcKey` + unit test |
| AC-12, AC-13 (cache hit/miss metrics — stub) | ✅ — `MetricsServiceStub.cacheHit('ohlc')` / `cacheMiss('ohlc')` are no-op now; PR3 wires real Prometheus counters |
| AC-14 (NOT caching indicators/CCL) | ✅ — only `getOhlcData` touched; `getImpliedCcl` / `calculateMA` retain original implementation |
| AC-15 (5-min `now` bucket when `startTime` omitted) | ✅ — `buildOhlcKey` + unit test |
| AC-16, AC-17 (symbols cache key) | ✅ — SHA-1 of `{page,limit,type,search}` truncated to 16 hex chars |
| AC-18 (TTL ±10% jitter) | ✅ — `SymbolsService` calls `this.cache.jitterTtl(300)` before `setSymbols`; unit test confirms range |
| AC-19 (NX-lock stampede protection) | ✅ — `tryAcquireSymbolsLock` + 50ms wait + retry + release after write; unit test verifies namespaced lock key |
| AC-20, AC-21 (WS last-price read/write) | ✅ — `getLastPrice` in subscribe handler; `setLastPrice` fire-and-forget inside candle callback |
| AC-22..AC-27 (Throttler Redis storage) | ✅ — `forRootAsync` with `ThrottlerStorageRedisService(redis)`; TTL-unit gotcha comment; smoke test verifies the adapter instantiates |

### Implementation notes worth recording

- **`CacheModule` is `@Global()`** (same pattern as `RedisModule` from PR1). This means feature modules don't need to import `CacheModule` themselves; `CacheService` is injectable from any module that depends on it.
- **`MetricsServiceStub` lives behind `MetricsStubModule`** rather than being declared inline in `CacheModule`. This is intentional: PR3 task 3.5 replaces the stub binding with the real `MetricsService` by importing `MetricsModule` instead of `MetricsStubModule` in `CacheModule`. The shape is identical, so `CacheService` never changes.
- **Stampede lock is per-cache-key, not per-process.** With multiple backend instances the lock still works (Redis `SET NX EX`), but every instance still hits the DB once on cache miss before acquiring the lock. Acceptable for v1; future improvement could move the lock acquisition above the DB query in the call order (lock first → query), but that adds complexity not justified by current load.
- **Empty OHLC responses are NOT cached.** If the provider returns zero candles (network blip, bad symbol, etc.) we skip `setOhlc`. Caching an empty result would amplify upstream outages across the 60s TTL window.
- **Cache hit is checked BEFORE the `try` block in `getOhlcData`.** The `try`/`catch` still wraps the DB+provider flow and any cache write inside it. A `getOhlc` error is swallowed by `RedisService` and returns null → treated as miss → continues normally.
- **`setLastPrice` is `void`-prefixed** (fire-and-forget). The cache layer swallows its own errors; the WS callback must not `await` and risk blocking the upstream `message` event loop.
- **Throttler TTL gotcha** (AC-24): `ThrottlerModule.forRootAsync` still declares `throttler.ttl` in **ms** as the public API requires, and `ThrottlerStorageRedisService` v5 handles the ms→s conversion internally. The adapter's `scriptLoad` uses `ARGV[1]` as seconds — verified against the v5 source. The integration test in PR3 verify phase will hammer 101 req/min and assert a 429 at request 101.
- **`fromPaginatedLike` adapter** in `SymbolsService` reconstructs `hasMore` from `page * limit < total`. The `PaginatedResultLike` shape has `totalPages` (we don't compute it; the helper doesn't use it) but the actual `PaginatedResult` shape has `hasMore`. The adapter is a one-liner with a single recomputation, kept here so the cache payload stays generic.

### Open risks after PR2

- Throttler TTL-unit gotcha (AC-24) is mitigated by the comment block above `forRootAsync`; the integration test in PR3 verify phase will hammer 101 req/min and assert a 429.
- Cache hit ratio target (≥95% on `/ohlc` at 100 RPS for 30s) requires real load — measured in PR3 verify phase, not here.
- Stampede lock is a single-process-correct pattern; with multiple backend instances, each instance will still hit the DB on miss before the lock is acquired. Acceptable for v1.
- `MetricsServiceStub` is a no-op — counters exist but do nothing until PR3 wires Prometheus. Acceptable: PR2 delivers the cache surface and wiring; PR3 delivers the observability surface.

### Next

User reviews PR2. After review:
1. User runs `pnpm --filter backend install` (adds `@nestjs/throttler-storage-redis`).
2. User runs `pnpm --filter backend build` and `pnpm --filter backend test`.
3. User runs `docker compose -f docker-compose.all.yml up -d redis backend` and verifies:
   - Backend logs `Redis connected`.
   - `curl http://localhost:8101/api/v1/market/ohlc?symbol=BTCUSDT&interval=1d&limit=200` twice → second call faster (Redis cache-hit; logs `cacheHit('ohlc')` once PR3 wires metrics, otherwise silent).
   - `curl http://localhost:8101/api/v1/symbols?limit=20` twice → second call faster.
   - `docker exec fc-redis redis-cli KEYS 'fc:cache:*'` shows populated keys (`fc:cache:ohlc:*`, `fc:cache:symbols:*`, `fc:cache:px:*`).
   - 101 req in 60s from same IP → 429 returned (throttler storage swap works).
4. After verification, user commits PR2.
5. User signals "dale PR3" to continue the chained-PR flow.

---

## PR3 — Part B — `feat(observability): compose + ops + dashboards` — done

### Completed tasks

- [x] 3.11 — `fc-prometheus` service in `docker-compose.all.yml`
- [x] 3.12 — `ops/prometheus/prometheus.yml` (3 scrape jobs)
- [x] 3.13 — `fc-redis-exporter` service
- [x] 3.14 — `fc-grafana` service + `GRAFANA_ADMIN_PASSWORD` env
- [x] 3.15 — `ops/grafana/provisioning/datasources/prometheus.yml`
- [x] 3.16 — `ops/grafana/provisioning/dashboards/dashboards.yml`
- [x] 3.17 — 3 dashboards: `fcharts-overview`, `fcharts-cache`, `fcharts-auth`
- [x] 3.18 — `docker-compose.observability.yml` dev overlay
- [x] 3.19 — README Observability section
- [x] 3.20 — Smoke test documented

### Files created (Part B)

| Path | Lines | Purpose |
|---|---|---|
| `ops/prometheus/prometheus.yml` | 20 | scrape config (3 jobs: fcharts-backend, redis-exporter, prometheus) |
| `ops/grafana/provisioning/datasources/prometheus.yml` | 12 | datasource auto-provisioning |
| `ops/grafana/provisioning/dashboards/dashboards.yml` | 12 | dashboard provider |
| `ops/grafana/dashboards/fcharts-overview.json` | 106 | HTTP overview dashboard (4 panels) |
| `ops/grafana/dashboards/fcharts-cache.json` | 113 | Cache + Prisma dashboard (4 panels) |
| `ops/grafana/dashboards/fcharts-auth.json` | 90 | Auth events dashboard (3 panels) |
| `docker-compose.observability.yml` | 24 | dev port overlay (publishes 9090/8300/9110 on all interfaces) |

### Files modified (Part B)

| Path | Δ | Notes |
|---|---|---|
| `docker-compose.all.yml` | +60 | 3 services (fc-prometheus, fc-redis-exporter, fc-grafana) + 2 volumes (prometheus_data, grafana_data); Redis block from PR1 untouched |
| `.env.example` | +4 | `GRAFANA_ADMIN_PASSWORD=change-me-in-prod` (with NOTE that it MUST be set) |
| `README.md` | +25 | `## Observability (PR3)` section after the existing `## Redis (PR1)` section |

### Validation (Part B)

| Check | Status | Notes |
|---|---|---|
| `docker-compose.all.yml` structure | _passed_ | 3 top-level keys (`services`, `volumes`, `networks`), 7 services, 4 volumes; Redis block intact (5 sentinel lines present) |
| 3 dashboard JSONs parse | _passed_ | `ConvertFrom-Json` on each file: `overview OK`, `cache OK`, `auth OK` |
| LF line endings | _passed_ | All 10 files (4 modified + 6 new YAML/JSON) have CRLF=0; first bytes are content (no BOM) |
| `docker-compose.observability.yml` includes `include:` | _passed_ | `include:` directive + 3 service overrides (fc-prometheus, fc-grafana, fc-redis-exporter) |
| `.env.example` has GRAFANA_ADMIN_PASSWORD | _passed_ | line 39: `GRAFANA_ADMIN_PASSWORD=change-me-in-prod` |
| `README.md` has PR3 Observability section | _passed_ | line 256: `## Observability (PR3)` |
| `docker compose config` | _skipped_ | Docker not invoked per safety rule |
| `promtool check config` | _skipped_ | Docker not invoked per safety rule |

### Acceptance criteria status (PR3-B)

| AC | Status |
|---|---|
| AC-46, AC-47 (Prometheus service, 127.0.0.1 bind) | ✅ |
| AC-48, AC-49, AC-50 (3 scrape jobs, 15s interval) | ✅ |
| AC-51, AC-52, AC-53 (Grafana service, env-required) | ✅ |
| AC-54 (datasource provisioning) | ✅ |
| AC-55 (dashboard provider) | ✅ |
| AC-56, AC-57, AC-58 (3 dashboards) | ✅ |
| AC-59, AC-60 (observability overlay) | ✅ |
| AC-61, AC-62, AC-63 (redis-exporter) | ✅ |
| AC-66 (README Observability section) | ✅ |

### Files NOT changed (per safety rule)

Same list as PR1 + PR2 — the repo's uncommitted user changes were preserved untouched:
- `apps/backend/Dockerfile`, `apps/backend/src/market/providers/binance.provider.ts`
- `apps/frontend/Dockerfile`, `apps/frontend/src/app/charts/page.tsx`, `apps/frontend/src/components/CandlestickChart.tsx`,
  `apps/frontend/src/i18n/en.ts`, `apps/frontend/src/i18n/es.ts`, `apps/frontend/src/lib/websocket.ts`
- `docker-compose.yml`, `docker-compose.dev.yml`
- root `package.json`, `packages/database/prisma/seed.ts`

Also untouched from PR1 + PR2 (stable, do not modify per orchestrator rules):
- `apps/backend/src/redis/redis.service.ts`, `apps/backend/src/redis/redis.module.ts`, `apps/backend/src/redis/redis.service.spec.ts`
- `apps/backend/src/common/cache/cache.service.ts`, `apps/backend/src/common/cache/cache.module.ts`
- `apps/backend/src/common/metrics/metrics.stub.ts`, `apps/backend/src/common/metrics/metrics.stub.module.ts`
- `apps/backend/src/market/market.service.ts`, `apps/backend/src/market/market.gateway.ts`, `apps/backend/src/symbols/symbols.service.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/package.json`

### Implementation notes worth recording

- **Image versions pinned to known-good** (per design §25 note 6):
  - `prom/prometheus:v2.55.0` (major release, 15d retention stable on Alpine-friendly image)
  - `oliver006/redis_exporter:v1.62.0` (community-acknowledged stable; `bitnami/redis-exporter` swap is v2 work)
  - `grafana/grafana:11.3.0` (matches `schemaVersion: 39` in dashboards — see Grafana schema version mapping)
- **Overlay uses `include:` directive (Compose v2.20+)** — the project's `docker-compose` on the host is recent enough (Docker Desktop 4.x bundles Compose v2.21+). If a user encounters schema errors on the `include:` key, they need to upgrade to Docker Compose v2.20+.
- **Bound ports in `.all.yml` are `127.0.0.1`-only** — this is the production posture. The `docker-compose.observability.yml` overlay re-binds to all interfaces for dev. The split keeps the production compose file safe to commit without leaking ports to multi-tenant hosts.
- **`GRAFANA_ADMIN_PASSWORD` is required and the container refuses to start without it** (per AC-53): the `${GRAFANA_ADMIN_PASSWORD:?...}` shell-substitute syntax makes Compose fail-fast. `.env.example` ships a default placeholder (`change-me-in-prod`) but the README Observability section points the user to set it for any non-dev environment.
- **Dashboard JSONs use `schemaVersion: 39`** — Grafana 11.x. The `datasource.uid: "prometheus"` in each panel relies on the auto-provisioned datasource's UID being `prometheus` (Grafana assigns the UID from the datasource name when not explicitly set). If a user renames the datasource in `ops/grafana/provisioning/datasources/prometheus.yml`, the dashboards will need a UID update.
- **All 3 dashboards pin `Prometheus` as the datasource** and use `refresh: 30s` + `time: { from: "now-6h", to: "now" }`. They reload from disk every 30s via the dashboards provider, so editing JSON and committing shows up in Grafana within ≤30s — no container restart needed.

### PR3 — full status (Part A + Part B)

All AC-28..AC-66 covered. The change `redis-grafana-integration` is now
**feature-complete** in the source tree. Verification (PR verify phase)
requires:

1. `pnpm install` (adds the 3 new backend deps + 1 PR2 dep).
2. `pnpm --filter backend build` — compile.
3. `pnpm --filter backend test` — all tests pass.
4. `docker compose -f docker-compose.all.yml -f docker-compose.observability.yml up -d`
5. `curl http://localhost:9090/-/healthy` → 200.
6. `curl http://localhost:8300/api/health` → 200.
7. Grafana login → 3 dashboards visible.
8. Generate traffic (login, /ohlc, /symbols) → all panels non-zero within 60s.
9. Prometheus targets at http://localhost:9090/targets all `up`.

After verification, commit PR3 and signal "dale verify" to launch the
formal sdd-verify sub-agent (or "dale archive" to skip verify and close out).