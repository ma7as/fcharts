# Tasks — `redis-grafana-integration`

> Mechanical breakdown of `design.md` into ordered, atomic, testable work items.
> Each task is ≤30 min of focused work.
> Spec IDs reference `spec.md`. File paths are absolute.

## Conventions

- `- [ ]` not done, `- [x]` done.
- Each task has a `**AC:**` line referencing spec.md AC-N.
- Each task has a `**Files:**` line with absolute paths.
- Each task has a `**Verify:**` line with concrete commands.

---

## Review Workload Forecast

| Metric | Value | Threshold | Status |
|---|---|---|---|
| Total changed lines (PR1+PR2+PR3) | ~860 | 1200 | ok |
| PR1 changed lines | ~190 | 400 | ok |
| PR2 changed lines | ~370 | 400 | ok |
| PR3 changed lines | ~300 | 400 | ok |
| Public API changes | 0 | 0 | ok |
| Database migrations | 0 | 0 | ok |
| New env vars | 4 (REDIS_URL, REDIS_REQUIRED, REDIS_KEY_PREFIX, GRAFANA_ADMIN_PASSWORD) | 5 | ok |

**Chain strategy:** `stacked-to-main` — each PR merges to main. Reason: PR2 does not require PR1 to be live in a long-running branch; the dev workflow is `docker compose -f docker-compose.all.yml -f docker-compose.observability.yml up`, which boots the full set anyway. PR3 similarly.

---

## PR1 — `infra(redis): wire Redis container + NestJS RedisModule`

### 1.1 Add `ioredis` dep

- [ ] **AC:** AC-1, AC-4
      **Files:** `apps/backend/package.json`
      **Verify:** `pnpm --filter backend install` exits 0; `pnpm-lock.yaml` updated.
      **Work:** Add to `dependencies`: `ioredis` (^5.4.1). Do NOT add `@nestjs/cache-manager`, `cache-manager`, or `keyv` — all rejected per Decision 1.

### 1.2 Uncomment Redis in `docker-compose.all.yml`

- [ ] **AC:** AC-1, AC-2
      **Files:** `b:\github\fcharts\docker-compose.all.yml`
      **Verify:** `docker compose -f docker-compose.all.yml config` shows `fc-redis` service with healthcheck.
      **Work:** Uncomment the `redis:` block at the top of the file; ensure healthcheck is intact; ensure `redis_data` volume is declared. Add `--appendonly yes` to the `command:` list (AOF persistence for R1 mitigation).

### 1.3 Add Redis env to `.env.example`

- [ ] **AC:** AC-4, AC-65
      **Files:** `b:\github\fcharts\.env.example`
      **Verify:** `Select-String -Pattern '^REDIS_' .env.example` returns 3 lines.
      **Work:** Append `REDIS_URL=redis://localhost:8103`, `REDIS_REQUIRED=false`, `REDIS_KEY_PREFIX=fc:` with comments.

### 1.4 Implement `RedisService`

- [ ] **AC:** AC-5, AC-7, AC-8
      **Files:** `apps/backend/src/redis/redis.service.ts` (new)
      **Verify:** `pnpm --filter backend test redis.service` passes.
      **Work:** Per `design.md §3`. Public API: `ping()`, `get<T>()`, `set()`, `del()`, `getOrSet()` (with `opts.jitter`), `tryLock()`, `unlock()`. All keys prefixed with `REDIS_KEY_PREFIX` at boundary. `get`/`set` swallow errors and log at warn level.

### 1.5 Implement `RedisModule`

- [ ] **AC:** AC-5, AC-6
      **Files:** `apps/backend/src/redis/redis.module.ts` (new)
      **Verify:** `pnpm --filter backend build` exits 0.
      **Work:** Per `design.md §2`. `@Global()`. Providers: `RedisService`, `REDIS_CLIENT` (useFactory over `ConfigService`), and `RedisPingCron` (a stub for PR1 — full implementation lands in PR3 task 3.9). Exports `REDIS_CLIENT` + `RedisService`.

### 1.6 Wire `RedisModule` in `AppModule`

- [ ] **AC:** AC-2, AC-3
      **Files:** `apps/backend/src/app.module.ts`
      **Verify:** `pnpm --filter backend build` exits 0; backend logs `Redis connected` on startup when `REDIS_URL` is reachable.
      **Work:** Add `RedisModule` to `imports`.

### 1.7 Redis ping log on startup

- [ ] **AC:** AC-2, AC-3
      **Files:** `apps/backend/src/redis/redis.module.ts`
      **Verify:** Boot logs `Redis connected` (URL with password redacted); if `REDIS_REQUIRED=true` and Redis unreachable, process exits 1.
      **Work:** `OnApplicationBootstrap` hook in `RedisModule` calls `redisService.ping()`; if it throws AND `REDIS_REQUIRED=true`, throw; else log warn and continue.

### 1.8 Unit tests for `RedisService`

- [ ] **AC:** AC-7, AC-8
      **Files:** `apps/backend/src/redis/redis.service.spec.ts` (new)
      **Verify:** `pnpm --filter backend test redis.service` exits 0.
      **Work:** Mock `REDIS_CLIENT`. Cases: `ping` returns `PONG`; `get` JSON-parses and returns null on missing or on error; `set` JSON-serializes with TTL; `getOrSet` populates on miss; `getOrSet` jitter produces values in `0.9*ttl..1.1*ttl`; `tryLock` returns boolean from `SET NX EX`.

### 1.9 PR1 smoke test (manual)

- [ ] **AC:** AC-1, AC-2, AC-3
      **Files:** —
      **Verify:**
      1. `docker compose -f docker-compose.all.yml up -d redis backend`
      2. Backend logs include `Redis connected`.
      3. `docker exec fc-redis redis-cli ping` returns `PONG`.
      4. With `REDIS_REQUIRED=false` and Redis stopped, backend still boots and warns.
      5. With `REDIS_REQUIRED=true` and Redis stopped, backend exits 1.

### 1.10 PR1 README note

- [ ] **AC:** AC-65
      **Files:** `b:\github\fcharts\README.md`
      **Verify:** `Select-String -Pattern 'Redis' README.md` returns ≥1 hit.
      **Work:** Add a 3-line "Redis" note to the existing Observability section (PR3 will extend it).

**PR1 subtotal:** 10 tasks, ~190 lines.

---

## PR2 — `feat(cache): OHLC + Symbols + WS last-price + Throttler Redis storage`

### 2.1 Add `ThrottlerStorageRedisService` dep

- [ ] **AC:** AC-22
      **Files:** `apps/backend/package.json`
      **Verify:** `pnpm --filter backend install` exits 0.
      **Work:** Add `@nestjs/throttler-storage-redis` (^5.x compatible with `@nestjs/throttler` ^6.5).

### 2.2 Implement `CacheService`

- [ ] **AC:** AC-9, AC-10, AC-11, AC-16, AC-17, AC-18, AC-19, AC-20
      **Files:** `apps/backend/src/common/cache/cache.service.ts` (new), `apps/backend/src/common/cache/cache.module.ts` (new)
      **Verify:** Unit tests pass (stub `MetricsService` in this PR; real wiring is PR3 task 3.5).
      **Work:** Per `design.md §4`. Inject `RedisService` + `MetricsService` (use a forwardRef-shaped stub interface so PR2 compiles before PR3 exists).

### 2.3 Wire `CacheModule` in `AppModule`

- [ ] **AC:** AC-9, AC-16
      **Files:** `apps/backend/src/app.module.ts`
      **Verify:** `pnpm --filter backend build` exits 0.
      **Work:** Add `CacheModule` to imports.

### 2.4 `MarketService` cache-aside integration

- [ ] **AC:** AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15
      **Files:** `apps/backend/src/market/market.service.ts`, `apps/backend/src/market/market.service.spec.ts` (new or extended)
      **Verify:** `pnpm --filter backend test market.service` exits 0. Manual: `curl /api/v1/market/ohlc?symbol=BTCUSDT&interval=1d&limit=200` twice → second call has cache-hit log line.
      **Work:** Per `design.md §5`. Constructor injects `CacheService`. `getOhlcData` wraps the existing flow. `getImpliedCcl` and `calculateMA` untouched.

### 2.5 `SymbolsService` cache + stampede protection

- [ ] **AC:** AC-16, AC-17, AC-18, AC-19
      **Files:** `apps/backend/src/symbols/symbols.service.ts`, `apps/backend/src/symbols/symbols.service.spec.ts` (new or extended)
      **Verify:** Unit test: 5 concurrent `findAll` calls with same pagination → only 1 DB query.
      **Work:** Per `design.md §6`.

### 2.6 `MarketGateway` last-known-price cache

- [ ] **AC:** AC-20, AC-21
      **Files:** `apps/backend/src/market/market.gateway.ts`
      **Verify:** Manual: subscribe to a symbol, emit a tick, kill the connection, reconnect, observe `last_known_price` event within 2s.
      **Work:** Per `design.md §7`. Constructor injects `CacheService`. Hook A in tick-emit path. Hook B in subscribe handler.

### 2.7 Throttler storage swap

- [ ] **AC:** AC-22, AC-23, AC-24, AC-25, AC-26, AC-27
      **Files:** `apps/backend/src/app.module.ts`
      **Verify:** Manual: from same IP, fire 101 requests in 60s → 101st returns 429. Auth endpoints still throttle tighter.
      **Work:** Per `design.md §8`. Replace `ThrottlerModule.forRoot([...])` with `forRootAsync({ ..., useFactory: (redis) => ({ storage: new ThrottlerStorageRedisService(redis) }) })`. Add comment block above the call documenting the TTL unit gotcha (AC-24).

### 2.8 Cache integration tests

- [ ] **AC:** AC-10, AC-12, AC-13, AC-16, AC-18, AC-19
      **Files:** `apps/backend/src/market/market.integration.spec.ts` (new), `apps/backend/src/symbols/symbols.integration.spec.ts` (new)
      **Verify:** All tests pass.
      **Work:** Use `ioredis-mock`. Cases: cache populated on miss; hit returns identical payload; TTL respected within ±2s; stampede lock coalesces 5 concurrent identical requests into 1 DB call.

### 2.9 PR2 smoke test (manual)

- [ ] **AC:** AC-22, AC-25
      **Files:** —
      **Verify:**
      1. `docker compose -f docker-compose.all.yml up -d backend`
      2. `curl -i http://localhost:8101/api/v1/market/ohlc?symbol=BTCUSDT&interval=1d&limit=200` twice → second call faster (cache-hit log).
      3. Hammer 101 requests in 60s → 429 returned.
      4. `docker exec fc-redis redis-cli KEYS 'fc:cache:*'` shows populated keys.

**PR2 subtotal:** 9 tasks, ~370 lines.

---

## PR3 — `feat(observability): Prometheus + Grafana + /metrics + first dashboards`

### 3.1 Add observability deps

- [ ] **AC:** AC-28
      **Files:** `apps/backend/package.json`
      **Verify:** `pnpm --filter backend install` exits 0.
      **Work:** Add `@willsoto/nestjs-prometheus` (^6.x), `prom-client` (^15.x), `@nestjs/schedule` (^4.x — for `@Cron`).

### 3.2 Implement `MetricsService`

- [ ] **AC:** AC-31..AC-45
      **Files:** `apps/backend/src/common/metrics/metrics.service.ts` (new)
      **Verify:** `pnpm --filter backend build` exits 0.
      **Work:** Per `design.md §9`. Inject 8 metric tokens. Implement 8 typed helper methods: `cacheHit(ns)`, `cacheMiss(ns)`, `throttlerBlocked(name, route)`, `authEvent(event)`, `wsConnect(ns)`, `wsDisconnect(ns)`, `prismaQueryDuration(model, action, sec)`, `setRedisPingLatency(sec)`.

### 3.3 Implement `MetricsController` + `MetricsModule`

- [ ] **AC:** AC-28, AC-29, AC-30
      **Files:** `apps/backend/src/common/metrics/metrics.controller.ts` (new), `apps/backend/src/common/metrics/metrics.module.ts` (new)
      **Verify:** `curl http://localhost:8101/internal/metrics` returns Prometheus exposition.
      **Work:** Per `design.md §9`. Mount path `/internal/metrics`. `@ApiExcludeController()` to hide from Swagger.

### 3.4 Wire `MetricsModule` + `ScheduleModule` in `AppModule`

- [ ] **AC:** AC-28, AC-29, AC-44, AC-45
      **Files:** `apps/backend/src/app.module.ts`
      **Verify:** `pnpm --filter backend build` exits 0; `/internal/metrics` returns 200.
      **Work:** Add `MetricsModule` to imports. Add `ScheduleModule.forRoot()` (required for `@Cron`).

### 3.5 Replace `CacheService` `MetricsService` stub with real injection

- [ ] **AC:** AC-34, AC-35
      **Files:** `apps/backend/src/common/cache/cache.service.ts`
      **Verify:** `curl /internal/metrics | Select-String cache_hits_total` shows non-zero after warm-up.
      **Work:** Remove the stub from §2.2; inject the real `MetricsService`.

### 3.6 `PrismaService` instrumentation

- [ ] **AC:** AC-37, AC-38, AC-39
      **Files:** `apps/backend/src/prisma\prisma.service.ts`
      **Verify:** Slow query log fires on a deliberate `SELECT pg_sleep(1)`.
      **Work:** Per `design.md §10`.

### 3.7 `AuthService` events

- [ ] **AC:** AC-40, AC-41
      **Files:** `apps/backend/src/auth/auth.service.ts`
      **Verify:** After login + deliberate fail, `curl /internal/metrics | Select-String auth_events_total` shows both events.
      **Work:** Per `design.md §11`. 5 call sites: `login_success`, `login_fail` (both validateUser and explicit bcrypt path), `refresh_rotate`, `refresh_revoke`, `register_success`.

### 3.8 `MarketGateway` WS gauge

- [ ] **AC:** AC-42, AC-43
      **Files:** `apps/backend/src/market/market.gateway.ts`
      **Verify:** Connect + disconnect a WS client → `ws_active_connections` returns to 0.
      **Work:** Per `design.md §12`. Inject `MetricsService` (already injects `CacheService` from PR2).

### 3.9 Redis ping cron

- [ ] **AC:** AC-44, AC-45
      **Files:** `apps/backend/src/redis/redis-ping.cron.ts` (new), `apps/backend/src/redis/redis.module.ts` (replace PR1 stub)
      **Verify:** `redis_ping_latency_seconds` appears in `/internal/metrics` and updates every 30s.
      **Work:** Per `design.md §13`. Provider in `RedisModule`.

### 3.10 Throttler metrics

- [ ] **AC:** AC-36
      **Files:** `apps/backend/src/common/metrics/throttler-metrics.filter.ts` (new), `apps/backend/src/app.module.ts`
      **Verify:** Force a 429 → `throttler_blocked_total` increments.
      **Work:** Global `ExceptionFilter` catching `ThrottlerException`, calling `metrics.throttlerBlocked(name, route)`. Register via `APP_FILTER`.

### 3.11 Prometheus container in `.all.yml`

- [ ] **AC:** AC-46, AC-47, AC-50
      **Files:** `b:\github\fcharts\docker-compose.all.yml`
      **Verify:** `docker compose -f docker-compose.all.yml config` shows `fc-prometheus` service.
      **Work:** Per `design.md §14`. Add `prometheus_data` volume.

### 3.12 Prometheus config

- [ ] **AC:** AC-48, AC-49
      **Files:** `b:\github\fcharts\ops\prometheus\prometheus.yml` (new)
      **Verify:** `docker exec fc-prometheus promtool check config /etc/prometheus/prometheus.yml` exits 0.
      **Work:** Per `design.md §15`.

### 3.13 redis-exporter container

- [ ] **AC:** AC-61, AC-62, AC-63
      **Files:** `b:\github\fcharts\docker-compose.all.yml`
      **Verify:** `docker compose -f docker-compose.all.yml up -d fc-redis-exporter` runs clean.
      **Work:** Per `design.md §16`.

### 3.14 Grafana container in `.all.yml`

- [ ] **AC:** AC-51, AC-52, AC-53
      **Files:** `b:\github\fcharts\docker-compose.all.yml`, `b:\github\fcharts\.env.example`
      **Verify:** `docker compose -f docker-compose.all.yml up -d fc-grafana` runs clean; healthcheck passes.
      **Work:** Per `design.md §17`. Add `grafana_data` volume. Document `GRAFANA_ADMIN_PASSWORD` in `.env.example`.

### 3.15 Grafana datasource provisioning

- [ ] **AC:** AC-54
      **Files:** `b:\github\fcharts\ops\grafana\provisioning\datasources\prometheus.yml` (new)
      **Verify:** Grafana UI shows Prometheus datasource after first boot.
      **Work:** Per `design.md §18`.

### 3.16 Grafana dashboard provider

- [ ] **AC:** AC-55
      **Files:** `b:\github\fcharts\ops\grafana\provisioning\dashboards\dashboards.yml` (new)
      **Verify:** Grafana UI shows the `fcharts` folder.
      **Work:** Per `design.md §19`.

### 3.17 Generate three dashboard JSONs

- [ ] **AC:** AC-56, AC-57, AC-58
      **Files:** `b:\github\fcharts\ops\grafana\dashboards\fcharts-overview.json` (new), `fcharts-cache.json` (new), `fcharts-auth.json` (new)
      **Verify:** Grafana UI shows all three dashboards with panels rendered; after warm-up traffic, panels show non-zero data.
      **Work:** Author JSON manually. Panels per `design.md §20`. Time range `last 6h`, refresh `30s`. Datasource: `Prometheus`.

### 3.18 Dev overlay `docker-compose.observability.yml`

- [ ] **AC:** AC-59, AC-60
      **Files:** `b:\github\fcharts\docker-compose.observability.yml` (new)
      **Verify:** `docker compose -f docker-compose.all.yml -f docker-compose.observability.yml config` resolves; ports 9090/8300/9110 published on all interfaces.
      **Work:** Per `design.md §21`. Use `include:` directive (Compose v2.20+).

### 3.19 README Observability section

- [ ] **AC:** AC-66
      **Files:** `b:\github\fcharts\README.md`
      **Verify:** `Select-String -Pattern '## Observability' README.md` returns ≥1 hit.
      **Work:** Per `design.md §23`. 3 paragraphs + bullet list.

### 3.20 PR3 smoke test (manual)

- [ ] **AC:** AC-46, AC-51, AC-56, AC-57, AC-58
      **Files:** —
      **Verify:**
      1. `docker compose -f docker-compose.all.yml -f docker-compose.observability.yml up -d`
      2. `curl http://localhost:9090/-/healthy` returns 200.
      3. `curl http://localhost:8300/api/health` returns 200.
      4. Login Grafana at http://localhost:8300 → three dashboards visible.
      5. Generate some traffic (login, /ohlc, /symbols) → all panels show data within 60s.
      6. Prometheus UI at http://localhost:9090/targets shows all 3 targets `up`.

**PR3 subtotal:** 20 tasks, ~300 lines.

---

## Mapping: AC → PR → task IDs

| AC | PR | Tasks |
|---|---|---|
| AC-1..AC-8 | PR1 | 1.1..1.8 |
| AC-64, AC-65 | PR1 | 1.3, 1.10 |
| AC-9..AC-15 | PR2 | 2.2, 2.4, 2.5 |
| AC-16..AC-19 | PR2 | 2.2, 2.5 |
| AC-20, AC-21 | PR2 | 2.2, 2.6 |
| AC-22..AC-27 | PR2 | 2.1, 2.7 |
| AC-28..AC-30 | PR3 | 3.1, 3.3, 3.4 |
| AC-31, AC-32, AC-33 | PR3 | 3.2 (auto via `@willsoto/nestjs-prometheus` HTTP interceptor) |
| AC-34, AC-35 | PR3 | 3.2, 3.5 |
| AC-36 | PR3 | 3.10 |
| AC-37..AC-39 | PR3 | 3.6 |
| AC-40, AC-41 | PR3 | 3.7 |
| AC-42, AC-43 | PR3 | 3.8 |
| AC-44, AC-45 | PR3 | 3.9 |
| AC-46, AC-47, AC-50 | PR3 | 3.11 |
| AC-48, AC-49 | PR3 | 3.12 |
| AC-51, AC-52, AC-53 | PR3 | 3.14 |
| AC-54 | PR3 | 3.15 |
| AC-55 | PR3 | 3.16 |
| AC-56, AC-57, AC-58 | PR3 | 3.17 |
| AC-59, AC-60 | PR3 | 3.18 |
| AC-61, AC-62, AC-63 | PR3 | 3.13 |
| AC-66 | PR3 | 3.19 |

---

## Risks tracked across tasks

- **R1 (Redis SPOF)** — mitigated by AOF on Redis container (PR1 §1.2 with `--appendonly yes`).
- **R2 (cache stampede)** — mitigated by NX lock (PR2 §2.5).
- **R3 (Throttler TTL unit gotcha)** — mitigated by integration test (PR2 §2.7 manual + §2.8).
- **R4 (Grafana default admin)** — mitigated by required env var (PR3 §3.14).
- **R5 (scrape config secrets)** — N/A in v1 (no auth on scrape targets).

## Open items for verify phase

- Cache hit ratio must reach ≥95% on `/ohlc` at 100 RPS for 30s.
- Cache stampede coalescing must limit DB queries to 1 under 5-concurrent stampede test.
- Throttler storage unit conversion must be verified by integration test.
- All 9 metrics must appear in `/internal/metrics` with correct labels.
- Prometheus targets `up` for backend, redis-exporter, and self.
- Grafana dashboards load with non-zero panels after warm-up.
