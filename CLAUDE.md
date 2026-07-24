# fcharts — local override

This file overrides `~/.claude/CLAUDE.md` for the `fcharts` workspace only.
Git-trackable; lives inside the repo so the team can review or extend it.

## Models — MiniMax M3 only

- All sub-agent delegations in this repo MUST use a **MiniMax M3** variant.
- **Do NOT** honor the `gentle-ai:sdd-model-assignments` table from the global
  CLAUDE.md. Its aliases (`sonnet`, `opus`, `haiku`) are not valid identifiers
  in this environment's catalog and `sonnet` / `haiku` failed with
  "Requested model 'sonnet' not found".
- Concrete model string to pass to `runSubagent`:
  - `model: "MiniMax M3 (minimax)"`
- No fallback to Anthropic / OpenAI / Google / Nvidia variants for this repo.
- Sub-agent delegation **is available and encouraged** per the global rules
  (4-file rule, multi-file write rule, PR rule, etc.). Do not collapse to
  inline execution "because of the model" — M3 has no per-call credit limit
  in this environment (the Copilot credit error from earlier sessions was an
  account-level cap, not a model restriction).

## SDD execution policy (overrides global)

| Setting | This repo |
|---|---|
| All SDD phases (init → archive) | delegate to sub-agent with `MiniMax M3 (minimax)` |
| Artifact store | file-based at `docs/sdd/<change>/` (engram / openspec MCPs are NOT configured) |
| Execution mode | default to **interactive** unless user explicitly says "automático" / "auto" / "sin pausas" |
| Skill registry | `.atl/skill-registry.md` in this repo; read once per session, pass matching SKILL.md paths to sub-agents |
| Strict TDD | only when `strict_tdd: true` is cached for this project; otherwise Standard Mode |
| Apply-progress continuity | orchestrator searches for `sdd/<change>/apply-progress` before re-launching `sdd-apply` |

## Project facts (verified 2026-07-24)

- Redis 8-alpine is declared in `docker-compose.yml` and `docker-compose.dev.yml`
  (port 8103) but **commented out** in `docker-compose.all.yml` with the note
  "currently unused — the backend does not wire CacheModule".
- `apps/backend/package.json` has NO `@nestjs/cache-manager`, NO `ioredis`,
  NO `cache-manager`. Redis is a dead container today.
- No Grafana / Prometheus / Loki / OpenTelemetry in any compose file. Backend
  has no `/metrics` endpoint.
- Backend: NestJS 11, Prisma 5.22.0, Socket.io, Throttler wired globally in
  `app.module.ts` (10 req/s + 100 req/min per IP).
- Auth: short-lived access JWT (15m) + httpOnly refresh cookie (7d), with
  refresh-token rotation and family-revocation on replay.
- `MarketService.getOhlcData` already does DB-level caching (Postgres `candle`
  table) with a 90% threshold check. Strong candidate for adding Redis as a
  fast front layer.
- Dockerfile: `node:24-bookworm-slim` + pnpm 11.17.0 via corepack.

## Active SDD change

- **name:** `redis-grafana-integration`
- **scope:** Redis caching integration in NestJS backend + Grafana / Prometheus
  observability stack (single combined change).
- **phase:** init
