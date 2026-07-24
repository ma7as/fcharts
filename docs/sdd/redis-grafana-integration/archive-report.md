# Archive Report — `redis-grafana-integration`

## Change summary

- **Name:** `redis-grafana-integration`
- **Type:** new capability (no prior Redis/observability in the repo)
- **Scope:** wire Redis as a real caching layer for the NestJS backend
  (candles OHLC, symbols catalog, WS last-known-price) + swap Throttler
  storage to Redis + add Prometheus + Grafana observability stack.
- **Duration:** 2026-07-24 (single session)
- **Mode:** automatic (user said "automático"; no pauses between phases)
- **Delivery:** 3 chained PRs planned in `tasks.md`; landed as a single
  commit in the local working tree because the changes are coherent and
  the user opted for a single integration commit after validation.

## Final state

| Artifact | Status | Notes |
|---|---|---|
| `state.md` | ✅ updated | this archive call mutates it to `archived` |
| `explore.md` | ✅ | 10 decisions |
| `proposal.md` | ✅ | 3 PRs, stacked-to-main |
| `spec.md` | ✅ | 66 ACs across 6 tags |
| `design.md` | ✅ | 25 sections |
| `tasks.md` | ✅ | 39 tasks (10 PR1 + 9 PR2 + 20 PR3) |
| `apply-progress.md` | ✅ | PR1, PR2, PR3-A, PR3-B all done |
| `verify-report.md` | ✅ | 60 PASS / 2 WARNING / 4 SUGGESTION / 0 CRITICAL |
| `archive-report.md` | ✅ this file | |

## Runtime validation (2026-07-24)

| Check | Result |
|---|---|
| `npx nest build` | 0 TS errors |
| `npx jest --testPathPatterns='redis\|cache\|throttler'` | 24/24 pass |
| `pnpm db:generate` (Prisma client) | OK |
| `docker compose up` (full stack) | 7 containers healthy |
| `GET /internal/metrics` | 200 + Prometheus exposition body |
| `GET http://localhost:9090/-/healthy` | 200 |
| `GET http://localhost:8300/api/health` | 200 |
| Prometheus targets | 3/3 `up` (fcharts-backend, redis-exporter, prometheus) |
| Grafana provisioning | 1 datasource + 3 dashboards loaded |
| `redis_ping_latency_seconds` cron | emitting |
| `process_*` default Node metrics | emitting (9 series) |
| Custom metrics (`cache_hits_total`, `http_request_*`, etc.) | registered (values 0 until traffic) |

## Verification verdict

**READY WITH FIXES** — 0 CRITICAL, 2 WARNING, 4 SUGGESTION. The change
satisfies all 66 ACs except for 2 spec/design drifts that are documented
in `design.md §9` and were not retroactively fixed in `spec.md`.

## Issues encountered and how they were resolved

These are the load-bearing issues we hit during the run. Recording them
so future changes in this repo don't repeat the cycle.

1. **`@nestjs/throttler-storage-redis` does not exist on npm**
   - Wrong package name from `proposal.md` and `design.md`. The real
     package is `@nest-lab/throttler-storage-redis` (~4M weekly downloads,
     maintained).
   - Fix: updated `apps/backend/package.json` and `apps/backend/src/app.module.ts`.
   - Suggestion: when the design phase names an npm package, verify it
     with `npm view <name>` before locking the design.

2. **`PaginatedResultLike.totalPages` is wrong**
   - The repo's real `PaginatedResult` (in `common/dto/pagination.dto.ts`)
     has `hasMore`, not `totalPages`. My type in PR2 was wrong.
   - Fix: changed to `hasMore?: boolean`; updated `SymbolsService.fromPaginatedLike`
     to recompute when the cached payload doesn't carry it.
   - Suggestion: PR work that introduces a new type that mirrors a
     pre-existing one should `grep` the codebase for the canonical type
     first.

3. **`MetricsServiceStub.throttlerBlocked` name collision**
   - The class had a private property `throttlerBlocked: Counter` and a
     public method `throttlerBlocked(name, route)`. TS allowed the
     duplicate identifier and the method body tried to call the property
     as a function.
   - Fix: renamed the property to `throttlerBlockedCounter`.
   - Suggestion: the class still has the "Stub" suffix from PR2. Rename
     to `MetricsService` in a follow-up PR.

4. **`MetricsController` extended `PrometheusController`**
   - The upstream `PrometheusController.index(response: unknown): Promise<string>`
     signature doesn't compose with Nest's `@Res()` decorator. The
     inherited `index` returned `Promise<string>` while my override
     returned `Promise<void>`.
   - Fix: dropped inheritance. The new controller uses
     `prom-client.register` directly with `@Res({ passthrough: true })`.
   - Suggestion: prefer composition over inheritance when overriding
     upstream controllers — they usually have framework-coupled signatures
     that don't survive LSP.

5. **`MetricsStubModule` not `@Global()`**
   - `PrismaService` couldn't inject `MetricsServiceStub` because
     `PrismaModule` doesn't import `MetricsStubModule` and the latter
     wasn't global. The backend crashed at boot with
     `PrismaService ... dependencies: [class MetricsServiceStub]`.
   - Fix: added `@Global()` to `MetricsStubModule`.
   - Suggestion: metrics/auth/cross-cutting services should be global by
     default to avoid this category of bug.

6. **`docker compose` `include:` + `ports:` override didn't apply**
   - `docker-compose.observability.yml` was meant to override the
     production-strict port bindings in `.all.yml` for dev use. The
     merge silently dropped the host-side bindings — containers ran
     without any published port.
   - Workaround: ran Prometheus / Grafana / redis-exporter via direct
     `docker run -p 127.0.0.1:9090:9090 …` calls.
   - Suggestion: when the `include:` + `ports:` override pattern is
     needed, document the exact compose version tested. Compose v2.20+
     `include:` is known to be inconsistent with port-array overrides.
     A simpler pattern is to have `.all.yml` publish on all interfaces
     by default and rely on a reverse proxy / Docker socket options for
     production lockdown.

7. **Node 20 + pnpm 11.17.0 incompatibility**
   - The environment had Node 20.20 (the user's nvm4w default), but
     pnpm 11.17.0 (the version pinned in `package.json` engines and the
     Dockerfile) requires Node ≥ 22.13.
   - Fix: installed Node 24.18 via `nvm install 24`, activated pnpm 11
     via `corepack prepare pnpm@11.17.0 --activate`. Added
     `.nvmrc` with `24` so future sessions align automatically.
   - Suggestion: pin Node via `.nvmrc` (now done) and consider a
     `volta` or `engines.node` field in `package.json` for non-nvm
     users.

8. **Lockfile out of date after `package.json` edits**
   - The Dockerfile runs `pnpm install --frozen-lockfile`. PR2 and PR3
     added 5 deps to `apps/backend/package.json` but the host didn't
     update `pnpm-lock.yaml` before the container build.
   - Fix: `pnpm install --no-frozen-lockfile` (host), which regenerates
     the lockfile. The container then succeeds on `--frozen-lockfile`.
   - Suggestion: PR work that adds deps should run `pnpm install`
     before commit; the lockfile is part of the change set.

9. **Pre-existing TS errors in code not touched by this change**
   - `SymbolType` / `Currency` / `Symbol` not exported from `@prisma/client`
     and a `tx: any` in `portfolios.service.ts` line 223. None of these
     were introduced by this change — they were latent because
     `prisma generate` had never been run against the local checkout.
   - Fix: `pnpm db:generate` once. The errors then disappear.
   - Suggestion: add a `postinstall` script or a `prebuild` hook that
     runs `prisma generate` so the local checkout is always
     self-consistent.

## Spec ↔ design drift (carried forward)

Two ACs differ between `spec.md` (written first) and `design.md §9` (the
design later moved the metrics endpoint to `/internal/metrics` on the
main app at port 8101 instead of a separate port 9464):

- **AC-29**: spec says `/metrics` on internal port `9464`; design/implementation
  uses `/internal/metrics` on the main app at `8101`.
- **AC-49**: spec says backend target `:9464`; design/implementation
  targets `fc-backend:8101/internal/metrics`.

A follow-up hygiene PR should update `spec.md` to match the design so
the two documents don't drift. The verify-report flags this as a
WARNING, not a CRITICAL, because the implementation is coherent and
verified at runtime.

## What shipped in source files

### Backend (apps/backend)

- `src/redis/redis.module.ts` — `@Global()` module with `ioredis` factory
  + `OnApplicationBootstrap` startup ping
- `src/redis/redis.service.ts` — typed cache-aside + lock helpers
- `src/redis/redis.service.spec.ts` — 15 unit tests
- `src/redis/redis-ping.cron.ts` — every-30s Redis PING → metric
- `src/common/cache/cache.service.ts` — typed per-namespace facade
- `src/common/cache/cache.module.ts` — module for the cache service
- `src/common/metrics/metrics.stub.ts` — `MetricsServiceStub` with 7
  metric tokens (real Prometheus counters/gauges/histograms)
- `src/common/metrics/metrics.stub.module.ts` — `@Global()` module
- `src/common/metrics/metrics.controller.ts` — `/internal/metrics` endpoint
- `src/common/metrics/throttler-metrics.filter.ts` — global filter that
  increments `throttler_blocked_total` on 429
- `src/market/market.cache.spec.ts` — OHLC cache tests
- `src/market/market.service.ts` — cache-aside in `getOhlcData`
- `src/market/market.gateway.ts` — last-known-price cache (read on
  subscribe, write on tick)
- `src/symbols/symbols.cache.spec.ts` — jitter + stampede tests
- `src/symbols/symbols.service.ts` — cache + NX-lock stampede protection
- `src/auth/auth.service.ts` — 5 auth event call sites
- `src/prisma/prisma.service.ts` — `$on('query')` → histogram + slow log
- `src/throttler/storage.spec.ts` — adapter instantiation smoke test
- `src/app.module.ts` — `ThrottlerModule.forRootAsync` with
  `ThrottlerStorageRedisService`, `CacheModule`, `MetricsStubModule`,
  `ScheduleModule.forRoot()`
- `package.json` — added `ioredis ^5.4.1`, `@nest-lab/throttler-storage-redis ^1.2.0`,
  `@nestjs/schedule ^4.1.0`, `@willsoto/nestjs-prometheus ^6.0.0`,
  `prom-client ^15.1.0`

### Infra (ops/)

- `ops/prometheus/prometheus.yml` — 3 scrape jobs (fcharts-backend,
  redis-exporter, prometheus)
- `ops/grafana/provisioning/datasources/prometheus.yml` — datasource
  auto-provisioning
- `ops/grafana/provisioning/dashboards/dashboards.yml` — dashboard
  provider config
- `ops/grafana/dashboards/fcharts-overview.json` — HTTP / latency /
  errors / throttler (4 panels)
- `ops/grafana/dashboards/fcharts-cache.json` — cache hit ratio /
  redis ping / prisma p95 / OHLC hits+misses (4 panels)
- `ops/grafana/dashboards/fcharts-auth.json` — login success/fail rate /
  refresh rotate vs revoke (3 panels)

### Docker / config

- `docker-compose.all.yml` — Redis uncommented with AOF; backend depends
  on `redis` healthcheck; `REDIS_URL`/`REDIS_REQUIRED`/`REDIS_KEY_PREFIX`
  env; `fc-prometheus` + `fc-redis-exporter` + `fc-grafana` services
  with `127.0.0.1` port bindings; new `prometheus_data` and
  `grafana_data` volumes
- `docker-compose.observability.yml` — dev overlay (note: `include:` +
  port-override doesn't work cleanly on Docker Compose v2.20+; current
  workaround is to run the observability containers via `docker run -p`
  directly with the same env/network)
- `.env.example` — added `REDIS_URL`, `REDIS_REQUIRED`, `REDIS_KEY_PREFIX`,
  `GRAFANA_ADMIN_PASSWORD`
- `README.md` — added `## Redis (PR1)` and `## Observability (PR3)`
  sections

### Project meta

- `.nvmrc` — `24` (aligns local dev with container)
- `CLAUDE.md` — local override forcing MiniMax M3 for sub-agent calls
- `.atl/skill-registry.md` — project skill index
- `docs/sdd/redis-grafana-integration/*` — 9 planning artifacts

## Suggested follow-up PRs (sorted by impact)

1. **Rename `MetricsServiceStub` to `MetricsService`** — mechanical,
   high cleanup value. ~5 files touched.
2. **Update `spec.md` to match the design decision on AC-29 / AC-49**
   (port 9464 → `/internal/metrics` on main app 8101). Documentation
   drift only.
3. **Investigate the `docker-compose.observability.yml` port-override
   bug** — either drop the overlay in favor of an explicit `ports:`
   block per env, or pin to a Compose version that handles the merge
   correctly.
4. **Add `prebuild` script in `apps/backend/package.json` running
   `prisma generate`** so the local checkout is always self-consistent
   (addresses issue #9 above).
5. **Cache invalidation API for symbols** — when admins add a new
   symbol, the 5-minute TTL means the catalog cache can be stale for
   up to 5 minutes. A `POST /api/v1/admin/symbols` endpoint that calls
   `cache.del('fc:cache:symbols:' + hash)` would close the gap.
6. **Alerting rules** — `auth_events_total{event="login_fail"}` rate
   spike detection, `redis_ping_latency_seconds > 0.1`, `5xx rate > 1/s`.
   Out of scope for v1 but the metrics are now in place to wire them.
7. **Strict TDD mode for new code** — `strict_tdd: false` in
   `state.md`. Now that the metrics/cache layer has solid test
   coverage, the project could flip to `strict_tdd: true` for the next
   change.

## Sign-off

The change `redis-grafana-integration` is archived. The working tree
contains a coherent, tested, runtime-validated set of changes. The
planning artifacts under `docs/sdd/redis-grafana-integration/` are
committable to the repo and serve as the post-mortem record for this
change.

**Status:** ARCHIVED
**Archived at:** 2026-07-24
