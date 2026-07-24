# Explore Report — `redis-grafana-integration`

> Phase: explore | Date: 2026-07-24 | Artifact store: file-based
> Generator: sdd-explore sub-agent (MiniMax M3)

---

## Current State (verified)

**Backend cache today**

- `MarketService.getOhlcData` does a DB-level cache check on the `candle` table with a 90%-of-requested-limit threshold, then falls back to an external provider. There is no in-process or Redis cache in front of it.
- `SymbolsService.findAll` hits Postgres on every request — paginated `findMany` + `count`, no cache.
- `AuthService` sources refresh-token validation exclusively from Postgres (`refreshToken` table, `@@index([family])` + unique `tokenHash`). Rotation + family-revocation is a correctness-critical flow with a test in `auth.service.spec.ts`.
- `IolProvider` carries an in-process OAuth token cache with an explicit comment: *"For multi-instance deployments this would need Redis; for the current single-instance dev setup it's fine"*. Precedent in the codebase for "stay in-process until multi-instance" — apply the same discipline to refresh tokens.
- `PrismaService` is a thin wrapper around `PrismaClient` — no query-event hooks, no `use()` middleware. Adding Prisma instrumentation is straightforward (`$on('query')`).

**Throttler today**

- `ThrottlerModule.forRoot([{ name: 'short', ttl: 1000, limit: 10 }, { name: 'long', ttl: 60000, limit: 100 }])` is global in `app.module.ts`. Default storage is in-process memory. Auth endpoints override per-route.
- A second backend instance would split the per-IP counters — a known problem with the in-memory default.

**Observability today**

- Zero. No `/metrics`, no Prometheus, no Grafana, no OTel, no Loki. The only visibility is `Logger` calls and Swagger (`/api/docs`, dev-only).
- `main.ts` does not register any global interceptor, middleware, or filter — greenfield for adding an HTTP duration interceptor.

**Compose files today**

| File | Redis block | Production-shaped |
|---|---|---|
| `docker-compose.yml` | enabled, port 8103, healthcheck | no (2 services) |
| `docker-compose.dev.yml` | enabled, port 8103, healthcheck | no (2 services) |
| `docker-compose.all.yml` | **commented out** with note "currently unused — the backend does not wire CacheModule" | yes (backend + frontend + postgres) |
| All three | — | share `fc-network` as default |

**`.env.example`** already documents `REDIS_URL=redis://localhost:8103` but nothing reads it.

**Existing test coverage** (`apps/backend/src/test/prisma.mock.ts`) uses a hand-rolled in-memory `Map`-backed Prisma mock. Adding a Redis mock for the new code follows the same pattern.

---

## Affected Areas

| Path | Why |
|---|---|
| `apps/backend/src/app.module.ts` | Wire `ThrottlerModule` with Redis storage; add `PrometheusModule`; import new `RedisModule`. |
| `apps/backend/src/main.ts` | Observability mounts via Nest module; no `use()` needed. |
| `apps/backend/src/market/market.service.ts` | Add Redis `getOrSet` wrapper around the response of `getOhlcData` (key = `ohlc:{symbol}:{interval}:{limit}:{startTime}`). |
| `apps/backend/src/market/market.gateway.ts` | Add "last known price" cache lookup on `handleSubscribe`. |
| `apps/backend/src/symbols/symbols.service.ts` | Wrap `findAll` with a short-TTL Redis cache keyed on the full query string. |
| `apps/backend/src/prisma/prisma.service.ts` | Add `$on('query')` instrumentation → `prisma_query_duration_seconds` histogram. |
| `apps/backend/src/common/` | New `metrics/` (counters + helpers) and `cache/` (RedisModule provider + decorator). |
| `apps/backend/package.json` | Add `ioredis`, `@nestjs/throttler-storage-redis`, `@willsoto/nestjs-prometheus`, `prom-client`. |
| `docker-compose.yml`, `docker-compose.all.yml` | Uncomment Redis in `.all.yml`; add healthcheck; both add `redis-exporter` sidecar. |
| `docker-compose.observability.yml` (new) | Prometheus + Grafana overlay; bind 9090 / 8300 to 127.0.0.1 in dev. |
| `ops/grafana/provisioning/` (new) | Datasources + dashboards YAML/JSON, mounted into the Grafana container. |
| `ops/prometheus/prometheus.yml` (new) | Scrape config for backend (`9464`), redis-exporter (`9121`), and self. |
| `b:\github\fcharts\.env.example` | Document `REDIS_URL`, `REDIS_PASSWORD` (optional), `GRAFANA_ADMIN_PASSWORD`, `PROMETHEUS_PORT`. |
| `docs/sdd/redis-grafana-integration/` | This file + proposal/spec/design/tasks/apply-progress/verify-report. |

---

## Decision 1 — Redis client integration

| Option | Pros | Cons | Effort |
|---|---|---|---|
| **(a)** `@nestjs/cache-manager` + `cache-manager` v5 + `cache-manager-ioredis-yet` | NestJS-idiomatic; tiny API (`@CacheKey`, `@CacheTTL`, `CacheService.get/set`). | The `ioredis-yet` adapter is the **last** "yet" adapter — community is migrating to Keyv (cache-manager v6+). No `MULTI`/`EXEC` API exposed. Two `RedisClient` instances in the same process (one for cache-manager, one for throttler) → double connections, no namespace sharing. | Low |
| **(b)** `ioredis` direct via a custom `RedisModule` | One connection pool, shared across Throttler + AppCache + future consumers. Full `MULTI`/`EXEC`, Lua scripts, pub/sub. First-class TypeScript types. Mature. | We write ~50 lines of provider boilerplate. We build the cache decorator ourselves. | **Medium** |
| **(c)** `Keyv` | Multi-backend — future-proof if we want a different store. | One more abstraction layer. Throttler storage doesn't accept Keyv natively (needs an `ioredis` client). Over-engineering for a single-store project. | Medium |

**Recommendation: (b) `ioredis` direct.** One `RedisModule` exposing `REDIS_CLIENT` (a shared `ioredis.Redis` instance) and `REDIS_SUBSCRIBER` (a separate connection for pub/sub if we ever need it). Throttler storage, OHLC cache, symbols cache, and any future Lua scripts all consume the same client. Namespace isolation via key prefixes (`fc:cache:ohlc:*`, `fc:cache:symbols:*`, `fc:throttle:*`, `fc:metrics:*`).

---

## Decision 2 — Throttler storage swap

**Recommendation: YES, swap to `ThrottlerStorageRedisService` from `@nestjs/throttler-storage-redis` v5.**

- It's the official NestJS 11 storage adapter, takes an `ioredis` client directly.
- Per-IP counters become globally consistent across backend instances — the single most important reason to wire Redis.
- Keys are auto-namespaced by the adapter (`throttle:*`) so they won't collide with our app cache.
- Failure mode: if Redis is down, the storage falls back to a wrapped exception → NestJS returns 500. Acceptable for v1.

**Rejection of "keep in-memory":** Per-IP counters diverging across instances is a security regression. The cost of the swap is one line in `app.module.ts`.

---

## Decision 3 — What to cache (TTL strategy)

| Candidate | Hit rate expectation | Risk | Ship in this change? |
|---|---|---|---|
| **(a)** `MarketService.getOhlcData` JSON | Very high on chart scroll / indicator recompute. Already does DB-cached lookup, but JSON serialization + Prisma → object mapping is the per-request cost. | Stale data up to TTL — acceptable for historical candles; **must NOT cache "indicators" or "CCL" responses**. | **YES — TTL 60s, keyed `fc:cache:ohlc:{symbol}:{interval}:{limit}:{startTime}`.** |
| **(b)** `SymbolsService.findAll` | High — catalog is read-mostly. | Catalog changes take up to TTL to propagate — fine. Cache stampede risk → mitigation: ±10% jitter. | **YES — TTL 300s with jitter, keyed on the normalized query string.** |
| **(c)** User profile lookup | Low–medium. | Stale-user bug surface (admin disables a user; cache keeps them logged in for TTL). | **DEFER.** |
| **(d)** Refresh-token validation cache | 1-hop saving on every refresh. | **DEFER.** Introduces a second source of truth for rotation flow. DB is already indexed on `tokenHash` (unique); `findUnique` is single-row. IolProvider precedent. | **DEFER (see Decision 4).** |
| **(e)** WS last-known-price cache | Low QPS, big UX win on reconnect. | Trivial TTL risk; no correctness impact. | **YES — TTL 2s, keyed `fc:cache:px:{symbol}`.** |

**Day-one ship list: (a) + (b) + (e).**

---

## Decision 4 — Refresh-token storage

**Recommendation: KEEP POSTGRES AS THE SOLE SOURCE OF TRUTH. Do NOT mirror to Redis in this change.**

1. Correctness-critical flow — rotation + family-revocation already has a non-trivial test suite.
2. Cost being saved is negligible — `findUnique({ where: { tokenHash } })` is single-row.
3. Precedent in this codebase — `IolProvider` documents the team's conscious choice to defer the same kind of migration.
4. Redis IS still a win for auth — via Throttler storage (Decision 2).

**When to revisit:** when we add a second backend replica behind a load balancer.

---

## Decision 5 — Observability stack

| Option | Pros | Cons | Pick? |
|---|---|---|---|
| **(a)** Prometheus + Grafana | Classic; pull-based; nests perfectly with single-backend topology. First-class NestJS SDKs. | Less portable to Datadog/Honeycomb. | **Day one.** |
| **(b)** OpenTelemetry SDK + OTel Collector + Prometheus + Grafana | Vendor-portable. | Two more moving parts. Empty tracing data until we add spans. | **Defer.** |
| **(c)** Loki + Grafana (logs only) | Cheap to add. | Doesn't replace metrics. | **Reject as a metrics solution.** |

**Metric SDK: `@willsoto/nestjs-prometheus` over raw `prom-client`.**

- Auto-mounts `/metrics` on the backend's own port (9464 internal).
- Decorator-style Counter/Histogram/Gauge registration matches NestJS idioms.
- Built-in HTTP request duration histogram and default Node.js process metrics.

---

## Decision 6 — Metrics to expose (day one)

| Metric | Type | Labels | Source |
|---|---|---|---|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | `PrometheusModule` auto-interceptor |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Same |
| `cache_hits_total` / `cache_misses_total` | Counter | `namespace` (`ohlc`, `symbols`, `px`) | Custom `CacheService` |
| `throttler_blocked_total` | Counter | `name`, `route` | Throttler `ExceptionFilter` |
| `prisma_query_duration_seconds` | Histogram | `model`, `action` | `prisma.$on('query')` |
| `auth_events_total` | Counter | `event` (`login_success`, `login_fail`, `refresh_rotate`, `refresh_revoke`, `register_success`) | Direct calls in `AuthService` |
| `ws_active_connections` | Gauge | `namespace` | `MarketGateway.handleConnection/Disconnect` |
| `redis_ping_latency_seconds` | Gauge | — | Cron task calling `redis.ping()` |

9 metrics. No more.

---

## Decision 7 — Grafana provisioning

**Recommendation: (b) — repo-mounted YAML/JSON under `ops/grafana/`.**

```
ops/
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── prometheus.yml          # points to prometheus:9090
│   │   └── dashboards/
│   │       └── dashboards.yml          # provider config
│   └── dashboards/
│       ├── fcharts-overview.json       # request rate, p95 latency, error rate, throttler
│       ├── fcharts-cache.json          # hit ratio, redis ping, prisma p95
│       └── fcharts-auth.json           # auth_events_total by event
├── prometheus/
│   └── prometheus.yml                  # scrape config
```

Bake nothing into the Grafana image. Bind-mount both `ops/grafana/provisioning` and `ops/grafana/dashboards` into the container. Adding a dashboard is a JSON commit + PR.

---

## Decision 8 — Compose topology

| File | Postgres | Redis | Backend | Frontend | Prometheus | Grafana | redis-exporter |
|---|---|---|---|---|---|---|---|
| `docker-compose.yml` | ✅ | ✅ | — | — | — | — | — |
| `docker-compose.dev.yml` | ✅ | ✅ | — | — | — | — | — |
| `docker-compose.all.yml` | ✅ | ✅ (uncomment) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `docker-compose.observability.yml` (new dev overlay) | inherits | inherits | inherits | — | ✅ | ✅ | ✅ |

Ports:

- `fc-redis`: 8103 (existing)
- `fc-redis-exporter`: 9110
- `fc-prometheus`: 9090
- `fc-grafana`: 8300
- `fc-backend /metrics`: 9464 (internal only — not published to host)

In `.all.yml`, **do NOT publish Prometheus (9090) or Grafana (8300) to host** — bind to `127.0.0.1` only or skip `ports:` entirely. The `docker-compose.observability.yml` overlay is the dev escape hatch for port mapping.

Healthchecks:

- `redis`: `redis-cli ping` (already present)
- `prometheus`: `wget -qO- http://localhost:9090/-/healthy`
- `grafana`: `wget -qO- http://localhost:8300/api/health`
- `redis-exporter`: no HTTP healthcheck — instead `depends_on: redis: condition: service_healthy`

---

## Decision 9 — Risk surface (top 5)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Redis is a single point of failure.** If it dies, Throttler returns 500, OHLC cache misses fall through to Postgres (OK), but auth throttling loses all rate limiting. | AOF persistence (`--appendonly yes`); document future `redis-sentinel` migration; accept trade-off for v1. |
| 2 | **Cache stampede on symbol catalog expiry.** Hundreds of requests pile into Postgres simultaneously. | Add ±10% TTL jitter. Request-coalescing lock (`SET NX EX 5`). |
| 3 | **Prometheus scrape config leaks secrets** if carelessly shared. | No `basic_auth` blocks in v1. If we add remote-write, store creds via `secrets:` not `environment:`. |
| 4 | **Grafana exposed publicly** with default `admin/admin` credentials. | `GRAFANA_ADMIN_PASSWORD` required env var; `GF_SECURITY_ADMIN_PASSWORD__USEFILE` mount; bind to `127.0.0.1:8300` in `.all.yml`. |
| 5 | **Throttler storage swap silently regresses rate limits** (e.g. namespace collision, TTL unit mismatch — `ioredis` uses SECONDS, Throttler uses MS). | Integration test. Add `throttler_blocked_total` counter. Convert MS→S in storage adapter config explicitly. |

---

## Decision 10 — Chained PRs preview

**Forecast: ~750-950 lines of new code + ~150 lines of changes to existing files. Above the 400-line PR budget → chained PRs.**

**Chain strategy: `stacked-to-main`.** Each PR merges to main. The change is independent slices, no integration branch needed.

| PR | Title | Scope | Approx. lines | Verification |
|---|---|---|---|---|
| **PR1** | `infra(redis): wire Redis container + NestJS RedisModule` | • Uncomment Redis in `docker-compose.all.yml`<br>• New `apps/backend/src/redis/redis.module.ts` + `redis.service.ts`<br>• `REDIS_URL` env wiring + `.env.example`<br>• Smoke test: `redis.ping()` at startup | ~150-200 | `pnpm dev:backend` logs `Redis connected`. `redis-cli -p 8103 ping` → `PONG`. |
| **PR2** | `feat(cache): OHLC + symbols + WS last-price + Throttler Redis storage` | • `CacheService` wrapper<br>• `MarketService.getOhlcData` cached (TTL 60s)<br>• `SymbolsService.findAll` cached (TTL 300s + jitter)<br>• `MarketGateway` last-known-price (TTL 2s)<br>• `ThrottlerModule` storage swap<br>• Unit tests | ~300-400 | Load test: 100 RPS for 30s on `/api/v1/market/ohlc` → 95%+ cache hit. Rate-limit integration test hits 100/min → 429. |
| **PR3** | `feat(observability): Prometheus + Grafana + /metrics + first dashboards` | • `PrometheusModule` with `/metrics` on 9464<br>• All 9 metrics<br>• PrismaService instrumentation<br>• HTTP duration interceptor<br>• Auth events<br>• WS gauge<br>• `ops/prometheus/prometheus.yml`<br>• `ops/grafana/provisioning/...`<br>• `ops/grafana/dashboards/*.json`<br>• `docker-compose.all.yml` adds prometheus + grafana + redis-exporter<br>• `docker-compose.observability.yml` overlay | ~250-350 | `curl localhost:9464/metrics` returns exposition. `curl localhost:9090` shows targets `up`. `localhost:8300` shows 3 dashboards with live data. |

Each PR is reviewable in under 30 minutes, builds independently, and is reversible in one `git revert`.

**Reviewer priority order:** PR1 (infra) → PR2 (cache) → PR3 (observability). PR3 could ship FIRST if the team prefers observability-led rollout — but PR1 is the smallest and gets Redis healthy, so doing it first builds confidence.

---

## Recommendation Summary

| # | Topic | Pick | One-line reason |
|---|---|---|---|
| 1 | Redis client | **`ioredis` direct** | One shared client for cache + Throttler + future Lua; no `cache-manager` adapter churn. |
| 2 | Throttler storage | **Swap to `ThrottlerStorageRedisService`** | Per-IP counters must be globally consistent. |
| 3 | What to cache | **OHLC (60s) + Symbols (300s+jitter) + WS last-price (2s)** | High-value, low-risk; defer user profile and refresh-token caching. |
| 4 | Refresh-token storage | **Postgres stays the sole source of truth** | Correctness-critical; precedent in `IolProvider` to defer. |
| 5 | Observability stack | **Prometheus + Grafana + `@willsoto/nestjs-prometheus`** | Right-sized for a single backend; OTel is over-engineering for v1. |
| 6 | Metrics | **9 metrics listed above** | Covers HTTP, cache, throttle, Prisma, auth, WS, Redis health. |
| 7 | Grafana provisioning | **Repo-mounted YAML/JSON under `ops/grafana/`** | Diffable, code-reviewed, version-controlled. |
| 8 | Compose topology | **Redis uncommented in `.all.yml`; Prometheus+Grafana+exporter in `.all.yml` + dev overlay** | Mirrors existing minimal-vs-full split. |
| 9 | Top risks | 5 above, with mitigations | All manageable in the change. |
| 10 | PR shape | **3 chained PRs, `stacked-to-main`** | Fits the 400-line budget; each PR is independently shippable. |

---

## Return Envelope

```yaml
status: success
artifacts:
  - b:\github\fcharts\docs\sdd\redis-grafana-integration\explore.md
next_recommended: sdd-propose
risks:
  - Redis SPOF (single container, no replica) — accepted for v1, AOF + future Sentinel migration documented.
  - Cache stampede on symbols catalog — mitigated via TTL jitter + NX lock in PR2.
  - Throttler MS-vs-S unit mismatch when swapping storage — explicitly called out in PR1's smoke test.
  - Grafana default admin password risk — mitigated via required env var + 127.0.0.1 bind.
  - Prometheus scrape config secret leakage — mitigated by no-auth scrape targets in v1.
questions_for_user: none  # user said "automático" and every decision has a defensible recommendation
```
