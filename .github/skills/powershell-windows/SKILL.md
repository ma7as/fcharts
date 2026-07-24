---
name: powershell-windows
description: "Trigger: PowerShell, run_in_terminal on Windows, PowerShell scripts, .ps1 files, Windows terminal. Run shell commands correctly in PowerShell 5.1/7 without bashisms, with proper UTF-8 BOM handling for scripts."
license: Apache-2.0
metadata:
  author: "terraplanista"
  version: "1.0"
---

## Activation Contract

Load this skill when:

- Running commands in a Windows terminal session (PowerShell 5.1 or PowerShell 7) via `run_in_terminal`.
- Writing or editing `.ps1` scripts in this repo.
- A user asks to "test" or "execute" something and the environment is Windows.
- A command worked in bash but fails or hangs in PowerShell.

Do not load this skill for:

- Git Bash / WSL / Linux shell sessions.
- Commands running inside a Docker container (the container has its own shell).
- Cmd.exe one-liners.

## Hard Rules

| Rule | Why |
|---|---|
| **PowerShell scripts MUST be saved as UTF-8 with BOM** | PowerShell 5.1 (the default on Windows 11) misreads non-ASCII characters from UTF-8-no-BOM files. The session terminal in this repo is PS 5.1 unless the user explicitly opened pwsh 7. **Every other file in the repo (source, docs, configs) uses UTF-8 without BOM** — only `.ps1` files are the exception. |
| Never use `cat`, `grep`, `find`, `sed`, `ls` | Use `Get-Content`, `Select-String`, `Get-ChildItem`, `ForEach-Object`, `eza` instead. If the user asks for a bash-style command, translate it before running. |
| Use `;` to chain commands, never `&&` | PowerShell 5.1 does not short-circuit on `&&` outside specific contexts. |
| Call `Get-Command` before using a cmdlet | Don't assume `curl`, `tar`, or `nproc` exist as native cmdlets. They are aliases that may point to the wrong binary. |
| Prefer cmdlets over aliases | `Get-ChildItem` over `dir`/`ls`. `Select-Object` over `select`. Scripts read better and lint better. |

## cmdlet-vs-Bash Translation Table

| Bash | PowerShell |
|---|---|
| `cat file` | `Get-Content file` |
| `ls -la` | `Get-ChildItem -Force` |
| `grep -r pattern .` | `Get-ChildItem -Recurse \| Select-String pattern` |
| `head -n 20` | `Get-Content file -TotalCount 20` |
| `tail -n 30` | `Get-Content file -Tail 30` |
| `wc -l` | `(Get-Content file).Count` |
| `which cmd` | `Get-Command cmd` |
| `echo $VAR` | `Write-Host $VAR` or `Write-Output $VAR` |
| `curl -s URL` | `Invoke-WebRequest -Uri URL -UseBasicParsing` |
| `xargs` | `ForEach-Object` pipeline |
| `&&` | `;` (no short-circuit) or `if ($LASTEXITCODE -eq 0) { ... }` |
| `\|\|` | `if ($LASTEXITCODE -ne 0) { ... }` |
| `2>/dev/null` | `2>&1 \| Out-Null` (loses exit code) or `try { ... } catch { }` |
| `>/dev/null` | `\| Out-Null` |
| `$(cmd)` | `$(cmd)` (works the same, but pipelines inside need `{ ... }`) |

## Quoting Gotchas

These four bite every time:

1. **Single-quoted strings are literal**. Variables do NOT expand. Use double quotes for interpolation:
   ```powershell
   $name = "BTCUSDT"
   Write-Host "Symbol: $name"   # OK
   Write-Host 'Symbol: $name'   # literal: "Symbol: $name"
   ```
2. **Bash-style backslash escapes DO NOT work in single quotes.** `'\n'` is `\n`, not a newline.
3. **Inside `docker exec ... psql -c "..."`**, the inner double quotes need `\` to survive. Easiest fix: build the SQL in a variable first, then pass the variable unquoted:
   ```powershell
   $q = 'INSERT INTO symbols (symbol, name, exchange, type) VALUES (''TEST'', ''test'', ''BINANCE'', ''crypto'') RETURNING symbol, currency, market, "dataSource";'
   docker exec fc-postgres psql -U postgres -d mydb -c $q
   ```
4. **Column names with PascalCase** (e.g. `dataSource`) need double-quoting inside psql, which conflicts with PowerShell quoting. Use a variable (see above) instead of inline `SELECT "dataSource"`.

## HTTP / Health-Check Patterns

```powershell
# Status code from a URL (no $null capture, no curl alias)
try {
    (Invoke-WebRequest -Uri "http://localhost:8100" -UseBasicParsing -TimeoutSec 5).StatusCode
} catch {
    $_.Exception.Response.StatusCode.Value__
}
```

The `try/catch` is required because `Invoke-WebRequest` throws on non-2xx; `curl` (the alias) does not.

## Background / Long-Running Commands

- Servers, watches, dev daemons: use `mode="async"` in `run_in_terminal` to keep them alive.
- One-shot builds, installs, tests: use `mode="sync"` (default) and let the tool wait for completion.
- **Never poll** with `Start-Sleep` waiting for output. `run_in_terminal` notifies you on completion.

## Encoding Decision Tree

| File type | Encoding | Why |
|---|---|---|
| Source code (`.ts`, `.js`, `.tsx`, `.java`, `.go`, `.py`, `.sql`) | UTF-8, no BOM | Cross-platform tooling assumes no BOM. |
| Markdown / docs | UTF-8, no BOM | Lint rules assume no BOM. |
| Config files (`.yml`, `.json`, `.toml`) | UTF-8, no BOM | Parsers reject BOM. |
| **`.ps1` scripts** | **UTF-8 WITH BOM** | PowerShell 5.1 misinterprets non-ASCII bytes without BOM. |
| `.psm1`, `.psd1` | UTF-8 with BOM | Same reason as `.ps1`. |

When the user asks to "create a script" in this repo, write the file using `create_file` (which writes UTF-8 no BOM) and then **re-encode it with BOM** using:

```powershell
$content = Get-Content script.ps1 -Raw
[System.IO.File]::WriteAllText("$PWD\script.ps1", $content, [System.Text.UTF8Encoding]::new($true))
```

The `[System.Text.UTF8Encoding]::new($true)` constructor emits the BOM.

## Common Pitfalls in This Repo

- `docker compose` warnings about `version: '3.9'` exit code 1 even on success. Don't panic — check `docker ps` for the actual state.
- `pnpm install` exit codes under WSL2 sometimes differ from PowerShell; trust the in-container result.
- `docker exec ... pg_isready` with `2>$null` does not work as expected because PowerShell redirects stderr to the pipeline; use `try { ... } catch { }` instead.
- `Select-String pattern *.log` does not expand the glob. Use `Get-Content file | Select-String pattern`.

## Output Contract

When you write a PowerShell command in a chat response, format it as a code block, prefix with `# filepath:` only if it's a script file (not a one-shot command), and always include the BOM-required marker when the file is `.ps1`:

```powershell
# filepath: scripts/setup.ps1
# Auto-saved as UTF-8 with BOM. PowerShell 5.1 requires the BOM for non-ASCII paths.
Write-Host "Setup complete"
```

## References

- `docs/skill-style-guide.md` (if it exists in this repo) — normative source for skill structure.
- VS Code Copilot Skill authoring: [VS Code Skills Docs](https://code.visualstudio.com/docs/copilot/customization/skills)
