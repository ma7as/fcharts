# Follow-up PRs — `redis-grafana-integration`

7 follow-up PRs identified during the archive phase of
`redis-grafana-integration`. Pick from this when planning the next
sprint.

Format: one section per PR with a stable ID. Cite the ID in the PR
title (e.g. `refactor(metrics): rename MetricsServiceStub → MetricsService (PR-FU-001)`).

---

## PR-FU-001 — Rename `MetricsServiceStub` → `MetricsService`

**Priority:** P1
**Effort:** 30 min
**Risk:** low
**Touches:** 5 files

### Why

The class still carries the "Stub" suffix from PR2. After PR3 it is no
longer a stub — it has real `Counter`/`Gauge`/`Histogram` injections
and a fully wired `MetricsStubModule`. The suffix misleads readers
into thinking the class is a placeholder.

### Scope

- Rename the class `MetricsServiceStub` → `MetricsService` in
  `apps/backend/src/common/metrics/metrics.stub.ts`.
- Rename the module `MetricsStubModule` → `MetricsModule` in
  `apps/backend/src/common/metrics/metrics.stub.module.ts`.
- Rename the file `metrics.stub.ts` → `metrics.service.ts`.
- Rename the file `metrics.stub.module.ts` → `metrics.module.ts`.
- Update all import sites:
  - `apps/backend/src/app.module.ts`
  - `apps/backend/src/auth/auth.service.ts`
  - `apps/backend/src/common/cache/cache.service.ts`
  - `apps/backend/src/common/metrics/metrics.controller.ts`
  - `apps/backend/src/common/metrics/throttler-metrics.filter.ts`
  - `apps/backend/src/market/market.gateway.ts`
  - `apps/backend/src/prisma/prisma.service.ts`
  - `apps/backend/src/redis/redis-ping.cron.ts`
- Update unit-test import sites.

### Acceptance criteria

- No occurrence of `MetricsServiceStub` or `MetricsStubModule` anywhere
  in the repo (`grep -r MetricsServiceStub apps/`).
- `nest build` exits 0.
- All existing tests still pass.

### Depends on

- nothing

---

## PR-FU-002 — Sync `spec.md` with design decision on AC-29 / AC-49

**Priority:** P1
**Effort:** 10 min
**Risk:** zero (docs only)
**Touches:** `docs/sdd/redis-grafana-integration/spec.md`

### Why

The original spec was written assuming a separate `:9464` port for
`/metrics`. Design §9 changed the decision: mount `/internal/metrics`
on the main app at port `8101` instead (a separate port "deferred to
v2"). The implementation matches design. The verify report flagged
this as a WARNING, not CRITICAL. The two documents now drift.

### Scope

Update `spec.md` AC-29 and AC-49 to reflect the design decision:

- **AC-29**: change "internal port 9464 (not published to host)" to
  "main app port 8101 at path `/internal/metrics` (excluded from
  Swagger and from `JwtAuthGuard`)".
- **AC-49**: change "Targets: backend (`9464`)" to "Targets:
  `fc-backend:8101` with `metrics_path: /internal/metrics`".

Optionally, append a `## Drift log` section to `spec.md` that records
this and any future spec↔design diffs.

### Acceptance criteria

- AC-29 and AC-49 in `spec.md` match the design.
- `docs/sdd/redis-grafana-integration/verify-report.md` updated
  WARNING → PASS for those two ACs (this is a docs re-verify, not a
  re-implementation).

### Depends on

- nothing

---

## PR-FU-003 — Fix `docker-compose.observability.yml` port-override bug

**Priority:** P1
**Effort:** 1-2 hours (investigate + fix)
**Risk:** medium
**Touches:** `docker-compose.all.yml`, `docker-compose.observability.yml`,
possibly `apps/backend/Dockerfile`

### Why

Docker Compose v2.20+ `include:` directive does not consistently merge
port-array overrides when the parent service has a `127.0.0.1:` prefix
on a single-element array. Result: dev overlay silently drops the host
port mappings. Current workaround: run observability containers via
direct `docker run -p`.

### Scope

Pick one of two strategies (see ISSUE-006 for full discussion):

**Option A — Drop the overlay; bind all-interfaces by default.**

- `docker-compose.all.yml`: change `127.0.0.1:9090:9090` → `9090:9090`
  (similarly for 8300, 9110).
- Production lockdown moves to reverse proxy / Docker socket options
  (documented in `README.md` "Production deployment" section).
- Delete `docker-compose.observability.yml` (no longer needed).

**Option B — Pin Compose version in CI; document the tested version.**

- Add a comment block at the top of
  `docker-compose.observability.yml` with the Compose version tested
  (run `docker compose version` and pin the major).
- Add the pinned version to a CI matrix so future Compose upgrades
  get caught.

Recommendation: **A** (simpler, no version-pinning gymnastics).

### Acceptance criteria

- `docker compose -f docker-compose.all.yml up` brings up Prometheus
  on `localhost:9090`, Grafana on `localhost:8300`, redis-exporter on
  `localhost:9110` without needing direct `docker run` workarounds.
- A second `docker compose` invocation that targets the production
  lockdown path is documented in `README.md`.

### Depends on

- nothing

---

## PR-FU-004 — `prebuild` hook with `prisma generate` + `engines` field

**Priority:** P1
**Effort:** 20 min
**Risk:** low
**Touches:** `apps/backend/package.json`,
`apps/frontend/package.json` (if needed), `package.json`

### Why

ISSUE-009 (pre-existing TS errors) will hit every new dev who clones
the repo. `prisma generate` must run before TypeScript type-checks the
backend, but it's a manual step today.

### Scope

- Add `"prebuild": "prisma generate --schema=../../packages/database/prisma/schema.prisma"`
  to `apps/backend/package.json` `scripts`.
- Optionally add the same to `apps/frontend/package.json` if it
  imports from `@prisma/client`.
- Add `"engines": { "node": ">=22.13", "pnpm": ">=11.0.0" }` to root
  `package.json`. The Node floor matches the pnpm 11.17
  requirement; the pnpm floor matches what the Dockerfile uses.
- Update `.nvmrc` comment block (or add a sibling `engines.md` if
  `.nvmrc` doesn't accept comments) with a one-liner that points to
  the engines field for non-nvm users.

### Acceptance criteria

- Cloning the repo fresh + `pnpm install` + `pnpm --filter backend build`
  succeeds without manually running `prisma generate`.
- `engines` field causes `corepack` to complain loudly when a
  developer tries to use a too-old Node (instead of crashing later in
  a less obvious way).

### Depends on

- nothing

---

## PR-FU-005 — Admin cache-invalidation API for symbols catalog

**Priority:** P2
**Effort:** 1-2 hours
**Risk:** low
**Touches:** `apps/backend/src/symbols/symbols.service.ts`,
`apps/backend/src/symbols/symbols.controller.ts` (new)

### Why

The symbols catalog is cached with a 5-minute TTL. When an admin adds
a new symbol, it can be invisible in the catalog for up to 5 minutes.
A real admin endpoint lets the admin explicitly bust the cache.

### Scope

- Add `CacheService.delSymbols(cacheKey)` and a `CacheService.invalidateAllSymbols()` that
  scans a known prefix (`fc:cache:symbols:*`).
- For PR scope: keep it simple — add a `POST /api/v1/admin/symbols/refresh`
  that:
  - requires `JwtAuthGuard` + a new `AdminRoleGuard` (or just hardcode
    the first registered user as admin for v1; revisit in a follow-up).
  - calls `cacheService.invalidateAllSymbols()`.
  - returns `{ invalidated: <count> }`.
- Optional: a `Last-Modified` header on `/api/v1/symbols` so the
  frontend can know to refetch.

### Acceptance criteria

- After calling the endpoint, the next `/api/v1/symbols?page=1`
  request returns a fresh DB result (not the cached one).
- Endpoint is auth-gated; anonymous calls return 401.
- Unit test: mock `RedisService.del` and assert it's called for every
  key in the prefix.

### Depends on

- nothing (but consider running after PR-FU-001 to avoid renaming the
  same module twice)

---

## PR-FU-006 — Alerting rules (Prometheus alertmanager)

**Priority:** P2
**Effort:** 2-3 hours
**Risk:** medium (alerting noise / fatigue if thresholds are wrong)
**Touches:** `ops/prometheus/alerts.yml` (new),
`ops/prometheus/prometheus.yml`, possibly a new
`docker-compose.alertmanager.yml`

### Why

The metrics are in place but no one watches them 24/7. The
first-cut alerts that matter:

- `auth_events_total{event="login_fail"}` rate > 1/s for 5 min →
  possible credential-stuffing attack
- `redis_ping_latency_seconds` > 0.1 for 2 min → Redis is sick
- `5xx` rate > 1/s for 5 min → backend is broken
- `throttler_blocked_total` rate > 0.5/s globally for 10 min → a
  client is misbehaving (or we have a runaway loop)

### Scope

- Create `ops/prometheus/alerts.yml` with the 4 alert rules above.
- Add `rule_files: ['/etc/prometheus/alerts.yml']` to
  `ops/prometheus/prometheus.yml`.
- Add the file as a `:ro` volume mount in
  `docker-compose.all.yml` for `fc-prometheus`.
- Decide: run alertmanager or just rely on Prometheus UI for now?
  For v1: skip alertmanager; the rules emit a `firing` state that
  Prometheus UI shows. Add alertmanager in a follow-up.

### Acceptance criteria

- `curl http://localhost:9090/api/v1/rules` returns the 4 rules.
- Triggering a rule (e.g. force a 429 storm from a test script) flips
  the rule to `firing` within 1 minute.

### Depends on

- PR-FU-003 (so that the dev overlay works cleanly)

---

## PR-FU-007 — Flip to `strict_tdd: true` for next change

**Priority:** P3
**Effort:** trivial (config change)
**Risk:** low (applies only to NEW code)
**Touches:** `docs/sdd/redis-grafana-integration/state.md` (template for
the next change), possibly `.atl/skill-registry.md`

### Why

The `strict_tdd` flag in `state.md` was set to `false` for the
`redis-grafana-integration` change because the repo's existing test
coverage was shallow (mostly DTO validators). Now that the
cache/metrics/throttler layer has solid test coverage (24 new tests,
all passing), the project can flip to `strict_tdd: true` for the next
change. The flag is per-change (it's part of the state.md template,
not a global setting), so flipping it doesn't change past behavior.

### Scope

- For the next SDD change in this repo, set `strict_tdd: true` in
  the `## Cached session settings` block of `state.md` when
  delegating to `sdd-apply`. The flag propagates as a mandatory
  instruction in the sub-agent prompt.

### Acceptance criteria

- The next change's `sdd-apply` runs explicitly mention TDD in every
  task and require a failing test before the implementation commit.

### Depends on

- nothing

---

## Tracking

When a PR from this list lands, update the entry:

- `Status: open` → `Status: ready-to-pr` → `Status: merged`
- Move the entry from "Open" to "Merged" at the bottom of this file.
- Add a one-line "Merged in commit: `<sha>`" reference.

## Merged

(none yet)
