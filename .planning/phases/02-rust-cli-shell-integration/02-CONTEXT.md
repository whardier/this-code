# Phase 2: Rust CLI + Shell Integration - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a Rust binary (`this-code`) that: prints help/version, installs into `~/.this-code/bin/`, creates a `code` shim symlink, generates shell integration artifacts for bash/zsh/fish, detects and prevents recursive self-invocation, and passes through to the real VS Code `code` binary. The CLI does NOT read or write the SQLite database in this phase — DB interaction is Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Shim Setup — `this-code install` Command (SHELL-01 superseded)

- **D-01:** `this-code install` creates two artifacts and prints usage instructions:
  1. `~/.this-code/env` — a POSIX `/bin/sh` script (like `~/.cargo/env`) that prepends `~/.this-code/bin` to PATH using the case-colon guard pattern. Users add `. "$HOME/.this-code/env"` to their `~/.bashrc` or `~/.zshrc` manually.
  2. `~/.this-code/bin/code` — a symlink pointing to `~/.this-code/bin/this-code`. The shim is invoked as `code` once PATH is set.
  The command does NOT modify the user's shell rc files; it only creates the artifacts and prints the source-line instruction.

- **D-02:** `this-code install --fish` creates `~/.config/fish/conf.d/this-code.fish` directly (fish's conf.d is designed for tool-dropped files; fish auto-sources it). Contents: `fish_add_path --prepend "$HOME/.this-code/bin"`.

- **D-03:** The `this-code init <shell>` subcommand design from REQUIREMENTS.md SHELL-01 is **superseded** by the `install` + flags approach. Downstream agents MUST treat this decision as authoritative over SHELL-01. The consolidated interface is:
  - `this-code install` — bash/zsh setup (env file + symlink)
  - `this-code install --fish` — fish setup (conf.d file + symlink if not already created)
  No separate `init bash`, `init zsh`, or `init fish` subcommands.

### Real `code` Binary Discovery (CLI-05)

- **D-04:** Discovery order when shim is invoked as `code`:
  1. `THIS_CODE_CODE_PATH` env var — explicit override, checked first
  2. `code_path` key in `~/.this-code/config.toml` — user-configured path
  3. PATH stripping + pure-Rust `which` crate — remove `~/.this-code/bin/` from the current `PATH` env var, then use the `which` crate (crates.io) to locate `code` in the remaining PATH entries. No shelling out to the system `which` command (not portable).

- **D-05:** Recursion guard: if `THIS_CODE_ACTIVE=1` is already set in the environment when the shim runs, exec the real binary immediately using the same D-04 discovery mechanism. Skip setting `THIS_CODE_ACTIVE` again (it's already set). This is the fast-path for any nested `code` invocations.

### v1 Pass-Through Behavior

- **D-06:** Phase 2 shim is pure pass-through: set `THIS_CODE_ACTIVE=1` in the child process environment, discover the real binary via D-04, exec with original args. No logging to DB, no JSON file writes. The extension (Phase 1) owns all DB writes; the CLI reads the DB starting in Phase 3.

### Config Scaffolding (Phase 2 subset)

- **D-07:** Phase 2 implements figment config infrastructure at `~/.this-code/config.toml` with a single key: `code_path` (string, optional). figment merge order: env var `THIS_CODE_CODE_PATH` → config file → default (PATH stripping). `db_path` config key is **deferred to Phase 3** — the CLI doesn't touch the DB in Phase 2, so there's nothing to configure yet.

### Claude's Discretion

- Exact format of usage output printed by `this-code install` (what instructions to display, whether to include the `. "$HOME/.this-code/env"` line verbatim)
- Whether `this-code install` is idempotent (safe to re-run — it should be, overwriting env file and symlink)
- Error handling when the real `code` binary cannot be found (exit code, error message format)
- Clap subcommand structure (whether `install` is a subcommand or a flag on the root command)
- tracing/logging verbosity for the shim's pass-through path

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` — CLI-01 through CLI-06, SHELL-01 through SHELL-04, PLAT-02 are in scope for Phase 2. **Note:** SHELL-01's `init <shell>` design is superseded by D-03 above (`install` + flags). All `~/.this-code/` paths in this file are correct per D-06 from Phase 1 context.

### Phase 1 Decisions

- `.planning/phases/01-extension-core-storage-foundation/01-CONTEXT.md` — D-06 (path rename to `~/.this-code/`), D-07 (SQLite schema column names). The Rust CLI must be compatible with the schema the extension writes.

### Research

- `.planning/research/STACK.md` — Rust CLI Cargo.toml template, figment config pattern, shell integration scripts, `which` crate usage note (use pure-Rust `which` crate, not system `which`), recursion guard env var pattern
- `.planning/research/PITFALLS.md` — Review for any CLI-relevant pitfalls
- `.planning/research/SUMMARY.md` — Architecture decisions and confidence assessment

### External

- `which` crate on crates.io — pure-Rust PATH search, no system command dependency
- Cargo's `~/.cargo/env` as the reference for the `~/.this-code/env` file format

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- No Rust code exists yet — Phase 2 is greenfield for the CLI crate.
- Extension TypeScript code exists in `extension/` from Phase 1, but is not directly reusable for the Rust CLI.

### Established Patterns

- Reference: `../periphore/` (Rust conventions): clap 4.6 derive API, figment 0.10 with TOML + env providers, edition 2024, tracing + tracing-subscriber, thiserror + anyhow, clippy pedantic with `module_name_repetitions = "allow"`.
- Commitizen + prek hooks apply to the Rust crate's commits.
- Single binary crate (`cargo init --name this-code`), not a workspace.

### Integration Points

- The CLI crate lives at `cli/` (or `this-code/`) inside the repo, parallel to `extension/`.
- `this-code install` creates `~/.this-code/bin/code → this-code` symlink — the directory `~/.this-code/bin/` must be created if absent (parallel to how Phase 1 creates `~/.this-code/`).
- `~/.this-code/config.toml` is read by figment on every CLI invocation — fast, no caching needed for a short-lived CLI process.

</code_context>

<specifics>
## Specific Ideas

- The `~/.this-code/env` file should follow the exact cargo pattern: `#!/bin/sh`, case-colon guard on `$PATH`, `export PATH="$HOME/.this-code/bin:$PATH"`. Variable name for the home dir: `THIS_CODE_HOME` (consistent with env var naming convention from D-06, replacing the `WHICH_CODE_HOME` name still in STACK.md).
- Fish conf.d file written by `install --fish`: `~/.config/fish/conf.d/this-code.fish` with `fish_add_path --prepend "$HOME/.this-code/bin"`.
- STACK.md uses `WHICH_CODE_HOME` in its shell snippets — treat `THIS_CODE_HOME` as the authoritative name (the project was renamed from which-code to this-code).

</specifics>

<deferred>
## Deferred Ideas

- `db_path` config key in `~/.this-code/config.toml` — Phase 3 (when CLI reads the DB)
- `this-code install --modify-rc` flag (auto-appending to `~/.zshrc`/`~/.bashrc`) — possible future convenience, not needed for v1
- `this-code uninstall` — remove env file + symlink; deferred until packaging phase
- Windows PATH integration (`%USERPROFILE%\.this-code\bin` + PowerShell profile) — PLAT-02 best-effort; defer specifics to Phase 4

</deferred>

---

_Phase: 02-rust-cli-shell-integration_
_Context gathered: 2026-04-27_
