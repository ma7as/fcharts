<!-- gentle-ai:skill-registry -->
# fcharts — Project Skill Registry

Project-specific skill index for the `fcharts` workspace. Read once per session
by the orchestrator and pass matching `SKILL.md` paths into sub-agent prompts.

## Repository overrides

| Setting | Value |
|---|---|
| Sub-agent model | `MiniMax M3 (minimax)` (only valid identifier for this repo) |
| Artifact store | file-based at `docs/sdd/<change>/` (no engram / openspec MCP) |
| Skill registry path | `.atl/skill-registry.md` (this file) |
| TDD default | Standard Mode (set `strict_tdd: true` only if testing capabilities justify it) |

## Skills

| Skill | Trigger | Source path |
|---|---|---|
| `agent-customization` | VS Code customization files (`.instructions.md`, `.prompt.md`, `.agent.md`, `SKILL.md`, `copilot-instructions.md`, `AGENTS.md`) | `c:\Users\Terraplanista\AppData\Local\Programs\Microsoft VS Code\1b6a188127\resources\app\extensions\copilot\assets\prompts\skills\agent-customization\SKILL.md` |
| `chronicle` | Session history / standup / session search / session reindexing | `c:\Users\Terraplanista\AppData\Local\Programs\Microsoft VS Code\1b6a188127\resources\app\extensions\copilot\assets\prompts\skills\chronicle\SKILL.md` |
| `work-unit-commits` | Commit planning for reviewable units, chained PRs, keeping tests+docs with code | `c:\Users\Terraplanista\.copilot\skills\work-unit-commits\SKILL.md` |
| `branch-pr` | Create Gentle AI pull requests with issue-first checks | `c:\Users\Terraplanista\.copilot\skills\branch-pr\SKILL.md` |
| `chained-pr` | Split oversized PRs into chained review slices (>400 lines) | `c:\Users\Terraplanista\.copilot\skills\chained-pr\SKILL.md` |
| `judgment-day` | Adversarial dual review (blind review, fix, re-judge) | `c:\Users\Terraplanista\.copilot\skills\judgment-day\SKILL.md` |
| `sdd-init` | Initialize SDD context (run once per project) | registered in this Copilot session as `sdd-init` agent |
| `sdd-explore` | Investigate an idea; read codebase, compare approaches | registered in this Copilot session as `sdd-explore` agent |
| `sdd-propose` | Author proposal / PRD from exploration | registered in this Copilot session as `sdd-propose` agent |
| `sdd-spec` | Author structured specs from proposal | registered in this Copilot session as `sdd-spec` agent |
| `sdd-design` | Author architecture/design from proposal | registered in this Copilot session as `sdd-design` agent |
| `sdd-tasks` | Break spec+design into mechanical tasks | registered in this Copilot session as `sdd-tasks` agent |
| `sdd-apply` | Implement tasks in batches; checks items as it goes | registered in this Copilot session as `sdd-apply` agent |
| `sdd-verify` | Validate implementation against specs (CRITICAL/WARN/SUGGEST) | registered in this Copilot session as `sdd-verify` agent |
| `sdd-archive` | Close a change and persist final state | registered in this Copilot session as `sdd-archive` agent |
| `sdd-onboard` | Guided end-to-end SDD walkthrough on real codebase | registered in this Copilot session as `sdd-onboard` agent |
| `powershell-windows` | `run_in_terminal` on Windows, PowerShell 5.1/7, `.ps1` scripts | `b:\github\fcharts\.github\skills\powershell-windows\SKILL.md` |

## Resolution rules

1. Orchestrator reads this file ONCE per session at first delegation.
2. Match skills by **code context** (file extensions/paths the sub-agent will
   touch) AND **task context** (what actions it will perform — review, PR
   creation, testing, etc.).
3. Pass matched `SKILL.md` paths into the sub-agent prompt as
   `## Skills to load before work`. Sub-agents read those exact files before
   work.
4. After any delegation returns `skill_resolution: fallback-*`, re-read this
   file immediately (compaction likely dropped the cache).
5. For SDD phases, also pass `~/.claude/skills/sdd-<phase>/SKILL.md` paths
   (orchestrator-side skills) when applicable.
