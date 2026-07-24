# Resolved issues — `redis-grafana-integration`

9 issues that came up while building the `redis-grafana-integration`
change. All were resolved before merge, but the resolution context is
preserved here so future debugging in this area doesn't redo the
investigation.

Format: one section per issue with a stable ID. Cite the ID in commit
messages and PR descriptions when touching related code.

---

## ISSUE-001 — `@nestjs/throttler-storage-redis` does not exist on npm

**Status:** resolved
**Surface:** `apps/backend/package.json`, `apps/backend/src/app.module.ts`
**Found during:** PR2 build (Node 24, pnpm 11.17)

### What happened

The `proposal.md` and `design.md` both named
`@nestjs/throttler-storage-redis` as the Throttler storage adapter. The
package does **not** exist in the npm registry.

### Resolution

The real package is `@nest-lab/throttler-storage-redis` (~4M weekly
downloads, actively maintained, compatible with `@nestjs/throttler` v6).

```jsonc
// apps/backend/package.json
"@nest-lab/throttler-storage-redis": "^1.2.0"
```

```ts
// apps/backend/src/app.module.ts
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
```

### Lesson

When the design phase names an npm package, verify it with
`npm view <name>` or `npm search <name>` before locking the design. The
proposal had no such gate.

---

## ISSUE-002 — `PaginatedResultLike.totalPages` is wrong

**Status:** resolved
**Surface:** `apps/backend/src/common/cache/cache.service.ts`,
`apps/backend/src/symbols/symbols.service.ts`
**Found during:** PR2 `nest build` (Node 24)

### What happened

PR2 introduced a new `PaginatedResultLike<T>` type for the symbols
cache payload. It declared `totalPages: number` as a required field.
The repo's actual `PaginatedResult<T>` (in
`apps/backend/src/common/dto/pagination.dto.ts`) has `hasMore: boolean`
instead. TS caught the mismatch in `SymbolsService.fromPaginatedLike`.

### Resolution

`PaginatedResultLike` now mirrors the real shape with `hasMore?: boolean`
(optional because the cache payload may not carry it; `fromPaginatedLike`
recomputes it from `page * limit < total` when missing).

### Lesson

When PR work introduces a new type that mirrors a pre-existing one,
grep the codebase for the canonical type first. The PR2 task brief
said "PaginatedResult" but didn't include the literal source file
path.

---

## ISSUE-003 — `MetricsServiceStub.throttlerBlocked` name collision

**Status:** resolved
**Surface:** `apps/backend/src/common/metrics/metrics.stub.ts`,
`apps/backend/src/common/metrics/throttler-metrics.filter.ts`
**Found during:** PR3 `nest build`

### What happened

The class had a private property `throttlerBlocked: Counter<string>` and
a public method `throttlerBlocked(name, route): void`. TS allowed the
duplicate identifier and the method body called `this.throttlerBlocked.inc(...)`
which TypeScript resolved to the property (a `Counter` instance, not a
function) → `Type 'Counter<string>' has no call signatures`.

### Resolution

Renamed the private property to `throttlerBlockedCounter`. The public
method keeps the friendly name; the property is internal.

### Lesson

When a class has both a metric token (private property) and a typed
helper (public method) on the same domain, suffix the property with
`Counter`/`Gauge`/`Histogram` to disambiguate. Better: split the
metric registration into a separate `metricsProviders` array of
`makeCounterProvider` calls, so the property doesn't have to live
on the service at all.

This is part of `PR-FU-001` (rename `MetricsServiceStub` → `MetricsService`).

---

## ISSUE-004 — `MetricsController` extended `PrometheusController`

**Status:** resolved
**Surface:** `apps/backend/src/common/metrics/metrics.controller.ts`
**Found during:** PR3 `nest build`

### What happened

PR3 mounted `/internal/metrics` by extending
`@willsoto/nestjs-prometheus`'s upstream `PrometheusController`. The
upstream class signature is:

```ts
class PrometheusController {
  index(response: unknown): Promise<string>;
}
```

The override I wrote used `@Res()` and returned `Promise<void>`. TS
rejected it: `Type 'Promise<void>' is not assignable to type 'Promise<string>'`.

### Resolution

Dropped inheritance. The new controller composes a `prom-client` global
registry directly:

```ts
@ApiExcludeController()
@Controller('internal/metrics')
export class MetricsController {
  @Get()
  async index(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', promRegister.contentType);
    return promRegister.metrics();
  }
}
```

Both paths share the same underlying `Registry` because `prom-client`
maintains a singleton.

### Lesson

Prefer composition over inheritance when overriding upstream Nest
controllers. Their signatures are usually framework-coupled and don't
survive LSP. If a future maintainer needs the upstream behavior
exactly, they can re-introduce the `PrometheusController` upstream
class as a sibling controller with a different path.

---

## ISSUE-005 — `MetricsStubModule` not `@Global()`

**Status:** resolved
**Surface:** `apps/backend/src/common/metrics/metrics.stub.module.ts`
**Found during:** PR3 runtime smoke test (backend crash at boot)

### What happened

`PrismaService` constructor injected `MetricsServiceStub` for query
instrumentation. `PrismaService` lives in `PrismaModule` (which is
`@Global()`), and `MetricsServiceStub` lives in `MetricsStubModule`.
`PrismaModule` does not import `MetricsStubModule`, so DI failed at
boot with:

```
PrismaService ... dependencies: [class MetricsServiceStub]
```

### Resolution

Added `@Global()` to `MetricsStubModule`. Cross-cutting concerns
(metrics, auth context, request id) should be `@Global()` by default
in this codebase.

### Lesson

Whenever a service lives outside the module that needs it AND that
service is broadly consumed (metrics, logger, request context), make
its module `@Global()`. The cost of being global is essentially zero
in a NestJS app of this size; the cost of forgetting it is a runtime
crash that only surfaces in production smoke tests.

---

## ISSUE-006 — `docker-compose.observability.yml` port override doesn't apply

**Status:** workaround in place, root cause not yet fixed
**Surface:** `docker-compose.observability.yml`,
`docker-compose.all.yml`
**Found during:** PR3 runtime bring-up

### What happened

The dev overlay was designed to override the production-strict
`127.0.0.1:9090:9090` port binding in `.all.yml` with the all-interfaces
`9090:9090`. After `docker compose -f .all.yml -f observability.yml up`,
the resulting containers had no host port mappings at all
(`"9090/tcp":[]` in `docker inspect`).

This is a known Docker Compose v2.20+ inconsistency: the `include:`
directive plus a service-level `ports:` override does not always merge
correctly when the parent service's `ports:` is a single-element array
with a `127.0.0.1:` prefix.

### Workaround in place

Prometheus / Grafana / redis-exporter are run via direct `docker run -p`
with the desired binding. Compose v2.20+.

### Resolution (candidate)

Two viable options:

1. **Drop the overlay file.** Have `.all.yml` publish observability
   ports on all interfaces by default. Production lockdown happens via
   reverse proxy / Docker socket options. Simplest; loses the
   "production-strict" posture in `.all.yml`.
2. **Pin Compose version in CI** to a known-good version (e.g.
   v2.27) where the merge works. Document the tested version at the
   top of `docker-compose.observability.yml`.

Tracked as `PR-FU-003`.

---

## ISSUE-007 — Node 20 + pnpm 11.17.0 incompatibility

**Status:** resolved (workaround in place)
**Surface:** user environment, `package.json` engines, `Dockerfile`
**Found during:** PR3 lockfile regeneration

### What happened

The repo's `package.json` declares `engines.pnpm: ">=11.0.0"` and the
Dockerfile uses `corepack prepare pnpm@11.17.0 --activate`. The user's
host had Node 20.20 (nvm4w default), but pnpm 11.17.0 requires
Node ≥ 22.13. Both `corepack enable` and `npm install -g pnpm@11.17.0`
crashed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` / `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.

### Resolution

1. Installed Node 24.18.0 via `nvm install 24`.
2. Activated pnpm 11.17.0 via `corepack`.
3. Added `b:\github\fcharts\.nvmrc` with `24` so future sessions
   align automatically.

The container itself uses `node:24-bookworm-slim` (per
`apps/backend/Dockerfile`) and works fine.

### Lesson

`.nvmrc` is the lowest-friction way to communicate the expected Node
version to other devs and to the user's own future sessions. Consider
adding `engines.node: ">=22.13"` to `package.json` for non-nvm users
(see `PR-FU-004`).

---

## ISSUE-008 — `pnpm-lock.yaml` out of date after `package.json` edits

**Status:** resolved
**Surface:** host → Dockerfile interaction
**Found during:** PR2 + PR3 container build

### What happened

The Dockerfile runs `pnpm install --frozen-lockfile`. PR2 added
`@nestjs/throttler-storage-redis` and PR3 added 4 more deps to
`apps/backend/package.json`, but the host didn't update
`pnpm-lock.yaml` before the container build. The build failed with
`ERR_PNPM_OUTDATED_LOCKFILE`.

### Resolution

`pnpm install --no-frozen-lockfile` on the host. Lockfile
regenerated, container build succeeds on subsequent `--frozen-lockfile`.

### Lesson

PR work that adds deps MUST run `pnpm install` before commit. The
lockfile is part of the change set, not an afterthought. This is
especially easy to miss when using a sub-agent that edits
`package.json` but doesn't run install.

---

## ISSUE-009 — Pre-existing TS errors from missing `prisma generate`

**Status:** resolved (one-time fix; latent risk remains)
**Surface:** `apps/backend/src/common/dto/pagination.dto.ts`,
`apps/backend/src/portfolios/dto/create-portfolio.dto.ts`,
`apps/backend/src/portfolios/portfolios.service.ts`,
`apps/backend/src/symbols/symbols.service.ts`
**Found during:** PR2 build

### What happened

Four pre-existing TS errors surfaced once the new code was in place:

- `SymbolType` not exported from `@prisma/client`
- `Currency` not exported from `@prisma/client`
- `Symbol` not exported from `@prisma/client`
- `tx: any` in `portfolios.service.ts:223`

None of these were introduced by the change. The user's local
`@prisma/client` had not been generated against the current
`schema.prisma`, so the type registry was missing `Symbol` /
`SymbolType` / `Currency`.

### Resolution

`pnpm db:generate` once. The errors disappear.

### Latent risk

The next person to clone the repo on a fresh checkout will hit the
same wall. Tracked as `PR-FU-004` (add `prebuild` hook with
`prisma generate`).
