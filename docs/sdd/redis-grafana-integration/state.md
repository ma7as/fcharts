<!-- gentle-ai:state -->
# redis-grafana-integration — SDD state

## Change

- **name:** `redis-grafana-integration`
- **scope:** wire Redis as a real caching layer in the NestJS backend
  (candles OHLC front-layer, rate-limit storage, possibly auth/refresh-token
  storage) + add Grafana + Prometheus observability stack with `/metrics`
  endpoint and OTel-friendly instrumentation.
- **artifact_store:** file-based at `docs/sdd/redis-grafana-integration/`
- **mode:** automatic (no pauses between phases once init finishes)

## Cached session settings

| Setting | Value | Notes |
|---|---|---|
| `delivery_strategy` | `chained-pr` | Decided at `sdd-tasks`: 3 PRs, ~860 total lines, ~190/~370/~300 per PR. All under 400-line budget individually. |
| `chain_strategy` | `stacked-to-main` | Each PR merges to main. No integration branch needed because PR2 does not require PR1 to be live in a long-running branch. |
| `strict_tdd` | `false` | Backend has jest 30 + 4 spec files, coverage shallow (DTOs + 2 services). New code ships with unit + integration tests but not strict red-green-refactor per task. |
| `sub_agent_model` | `MiniMax M3 (minimax)` | Per `CLAUDE.md` — only valid identifier in this repo. |

## Planning summary (1-page brief)

### What we're building

Three chained PRs, stacked to main:

1. **PR1 — `infra(redis)`** (~190 lines): uncomment Redis in `.all.yml`,
   add `RedisModule` + `RedisService` (ioredis direct), `REDIS_URL` env,
   startup ping, AOF persistence, unit tests.

2. **PR2 — `feat(cache)`** (~370 lines): `CacheService` wrapper (typed
   per namespace), OHLC + Symbols + WS-last-price caches with stampede
   lock, Throttler Redis storage swap (with TTL-unit-gotcha comment),
   unit + integration tests.

3. **PR3 — `feat(observability)`** (~300 lines): `MetricsModule` +
   `/internal/metrics` + 9 metrics, Prisma instrumentation, auth events,
   WS gauge, Redis ping cron, throttler metrics filter; Prometheus +
   redis-exporter + Grafana containers in `.all.yml`; provisioned
   dashboards (overview / cache / auth); new
   `docker-compose.observability.yml` dev overlay; README update.

### Key load-bearing decisions

- Redis client = **`ioredis` direct** (not `cache-manager`).
- Throttler storage = **`ThrottlerStorageRedisService` v5** (official NestJS adapter).
- Cache surface = **OHLC 60s + Symbols 300s ±10% jitter + WS last-price 2s**.
- Refresh tokens stay **Postgres-only** (precedent: `IolProvider` OAuth token).
- Observability = **`@willsoto/nestjs-prometheus`** over raw `prom-client`.
- Compose topology = Redis uncommented in `.all.yml`; new `docker-compose.observability.yml` overlay for dev port publishing.
- 9 metrics on day one: HTTP req duration + counter, cache hit/miss per ns, throttler blocks, prisma query duration, auth events, ws active connections, redis ping latency.

### Spec coverage

66 AC-N requirements across tags `infra (8)`, `cache (13)`, `throttler (6)`,
`observability (18)`, `ops (18)`, `docs (3)`. Mapping in `tasks.md`.

### Top 5 risks + mitigations

1. Redis SPOF → AOF persistence + future Sentinel migration documented.
2. Cache stampede → NX lock + TTL jitter in PR2.
3. Throttler TTL-unit gotcha (ms vs s) → integration test + comment block.
4. Grafana default admin → required env var + 127.0.0.1 bind in `.all.yml`.
5. Prometheus scrape secrets → N/A in v1 (no auth on scrape targets).

## Phase log

| Phase | Status | Started | Finished | Artifact |
|---|---|---|---|---|
| init | done | 2026-07-24 | 2026-07-24 | this file |
| explore | done | 2026-07-24 | 2026-07-24 | `docs/sdd/redis-grafana-integration/explore.md` |
| propose | done | 2026-07-24 | 2026-07-24 | `docs/sdd/redis-grafana-integration/proposal.md` |
| spec | done | 2026-07-24 | 2026-07-24 | `docs/sdd/redis-grafana-integration/spec.md` |
| design | done | 2026-07-24 | 2026-07-24 | `docs/sdd/redis-grafana-integration/design.md` |
| tasks | done | 2026-07-24 | 2026-07-24 | `docs/sdd/redis-grafana-integration/tasks.md` |
| apply | pending — awaits user OK | — | — | `docs/sdd/redis-grafana-integration/apply-progress.md` |
| verify | pending | — | — | `docs/sdd/redis-grafana-integration/verify-report.md` |
| archive | pending | — | — | `docs/sdd/redis-grafana-integration/archive-report.md` |

## Current phase

- **current:** `tasks` (planning complete)
- **next:** `apply` — only after user explicitly approves the plan and the
  chained-PR strategy.
- **next_recommended_action:** user reviews the four artifacts
  (`explore.md`, `proposal.md`, `spec.md`, `design.md`, `tasks.md`) and
  either approves `apply` for PR1 only, or asks for adjustments.
- **planning_complete_at:** 2026-07-24
- **planning_loc:** all artifacts are committable under `docs/sdd/redis-grafana-integration/`.

## Detected project context

### Stack

- **Monorepo:** pnpm workspaces (`apps/*`, `packages/*`)
- **Backend:** NestJS 11.1.16 + Prisma 5.22.0 + Socket.io 4.8 + Throttler 6.5
- **Frontend:** Next.js 16.1.6 + React 19 + ECharts 6 + zustand 5 + TanStack Query 5
- **Database:** Prisma 5.22.0 / PostgreSQL 17, schema at `packages/database/prisma/schema.prisma`
- **Compose files:** `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.all.yml`

### Testing capabilities

| Package | Runner | Command | Has tests | `strict_tdd` eligible |
|---|---|---|---|---|
| `apps/backend` | jest 30 (ts-jest) | `pnpm --filter backend test` | yes — 4 spec files (`portfolios.service`, `auth.service`, `create-transaction.dto`, `ohlc-query.dto`) | **maybe** — runner is in place, coverage is shallow (DTO validators + 2 service tests). Suitable for strict TDD on new code; existing code can adopt gradually. |
| `apps/frontend` | _none_ | _none_ | no | no |
| `packages/database` | _none_ | _none_ | no | no |

### Known baseline (pre-change)

- Redis 8-alpine container declared in `docker-compose.yml` and
  `docker-compose.dev.yml` (port 8103) but **commented out** in
  `docker-compose.all.yml` ("currently unused — the backend does not wire
  CacheModule").
- `apps/backend/package.json` has NO `@nestjs/cache-manager`, NO `ioredis`,
  NO `cache-manager`. Redis is a dead container today.
- No Grafana / Prometheus / Loki / OpenTelemetry in any compose file.
- Backend has no `/metrics` endpoint.
- Backend has Throttler wired globally in `app.module.ts` (10 req/s + 100 req/min per IP).
- Auth: short-lived access JWT (15m) + httpOnly refresh cookie (7d), with
  refresh-token rotation and family-revocation on replay.
- `MarketService.getOhlcData` already does DB-level caching (Postgres `candle`
  table) with a 90% threshold check. Strong candidate for adding Redis as a
  fast front layer.
- Dockerfile: `node:24-bookworm-slim` + pnpm 11.17.0 via corepack.

## Recommended explore questions for next phase

1. Which Redis client: `ioredis` directly vs `@nestjs/cache-manager` +
   `cache-manager-ioredis-yet` adapter vs `Keyv`?
2. Which cache invalidation strategy: TTL-only, write-through, write-behind,
   or lazy + event-driven invalidation?
3. Where does the throttler store its counters today (in-memory vs redis)?
   Plan to swap to redis-backed when Redis is wired.
4. Should refresh tokens move from DB-only to redis (with DB as durable
   mirror) or stay DB-only? Confirm replay-revocation flow.
5. Observability: prom-client + `/metrics`, OTel SDK with Prometheus
   exporter, or `@willsoto/nestjs-prometheus`?
6. Grafana provisioning: bake dashboards into the image, or fetch from a
   repo-mounted path? Prometheus scrape config location?
7. Compose topology: keep Redis commented out in `.all.yml`, or uncomment +
   add a healthcheck? Add a `redis-exporter` sidecar for Prometheus?

## Risks / blockers

- _none yet_ — init succeeded cleanly. Risks will surface in `explore` once
  we know which Redis client + which observability SDK the team prefers.

## Created

- `created_at`: 2026-07-24
- `created_by`: `sdd-init` (model `MiniMax M3 (minimax)`)
