# This Code

## What This Is

This Code is a VS Code launch interceptor and session tracker. A lightweight VS Code extension (`whardier.this-code`) runs wherever VS Code is running (local or SSH remote) and records session state — workspace path, `--user-data-dir`, `--profile`, server commit hash, and open file manifest — into per-instance JSON files alongside each VS Code Server binary and into a SQLite index at `~/.this-code/sessions.db`. A companion CLI tool (`this-code`, written in Rust) sits leftmost in the user's PATH as `code`, captures launch context, avoids recursive self-invocation, and reads the session store to route subsequent `code` calls to the right VS Code instance and profile.

## Core Value

Developers using VS Code remote development (SSH, Dev Containers) with multiple profiles should never have to think about which VS Code instance or `--user-data-dir` to use — this-code remembers and routes automatically.

## Requirements

### Validated

- CLI-01 through CLI-06: `this-code` binary installs, provides `--help`/`--version`, installs shell integration, passes through via shim with recursion guard — validated Phase 2
- SHELL-01 through SHELL-04: `this-code install [--fish]` creates env file (POSIX sh case-colon guard), code symlink, and fish conf.d file; instructions reference `~/.zshrc` — validated Phase 2
- PLAT-02: macOS and Linux CI matrix with `fail-fast: false` — validated Phase 2

### Active

See `.planning/REQUIREMENTS.md` for the full v1 requirement list (35 requirements across EXT, STOR, TRACK, CLI, SHELL, QUERY, PKG, PLAT categories).

Key active requirements:

- [ ] Extension (`whardier.this-code`) writes per-instance session state to `~/.vscode-server/bin/{hash}/this-code-session.json`
- [ ] Extension maintains SQLite index at `~/.this-code/sessions.db` (WAL mode)
- [ ] Extension runs with `extensionKind: ["workspace"]` — tracks files on the machine they live on
- [ ] Extension tracks file open/close events, workspace root, server commit hash, --user-data-dir, --profile
- [ ] Extension has no UI — config-only with Output Channel
- [ ] CLI (`this-code`) intercepts `code` command, self-detects recursion, passes through in v1
- [ ] CLI provides shell integration (bash/zsh/fish) via `this-code init <shell>`
- [ ] CLI bundles inside VSIX; 4-platform VSIX builds for Marketplace

### Out of Scope

- IPC socket manipulation — `remote-code` works without this; deferred to future
- File-save triggers — open/close events are sufficient for v1
- CLI intercepting the `claude` command — deferred to v2
- GUI or configuration webview — config + output channel only
- Windows as primary platform — best-effort only
- Real-time remote routing — v2

## Context

- Project renamed from "This Code" / `this-code` to "This Code" / `this-code` during initialization
- Extension ID: `whardier.this-code`; marketplace name: "This Code"
- Per-instance text files live in `~/.vscode-server/bin/{hash}/` — collocated with server binary, zero locking concerns
- SQLite index at `~/.this-code/sessions.db` aggregates across all instances for CLI querying
- `extensionKind: ["workspace"]` means extension runs on remote host during SSH sessions — this is intentional, so it tracks remote files and writes to the remote machine's `~/.this-code/`
- The `this-code` CLI installed on a machine reads that machine's `~/.this-code/sessions.db`
- The periphore project (`../periphore/`) is the Rust reference: clap v4, figment, rusqlite, conventional commits, prek hooks
- The Rust CLI is a single binary crate (not a workspace) — follows periphore tooling conventions
- `this-code` CLI installs into `~/.this-code/bin/` to avoid PATH pollution from other binaries
- Shell integration uses `this-code init <shell>` subcommand pattern (not raw sourcing)
- SQLite library for extension: `@vscode/sqlite3` (Node-API prebuilts, ABI-stable across Electron) — NOT `better-sqlite3`
- `globalStorageUri` NOT used for primary storage — resolves to different paths per profile/remote/platform

## Constraints

- **Platform**: macOS and Linux primary; Windows best-effort
- **Extension API**: VS Code Extension API v1.75+ (profile and workspace API support)
- **Language (extension)**: TypeScript + esbuild bundler + `@vscode/vsce` packaging
- **Language (CLI)**: Rust, single binary crate, clap v4 + figment + rusqlite 0.39 (bundled)
- **Storage**: per-instance JSON files (primary) + SQLite WAL index (secondary)
- **No accessibility permissions required**: Extension uses standard VS Code APIs only
- **Commits**: Conventional commits via commitizen, prek hooks (matching periphore conventions)
- **Packaging**: Platform-specific VSIX required for native SQLite binaries (4 targets)

## Key Decisions

| Decision                                                   | Rationale                                                                                                                        | Outcome   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Fixed path ~/.this-code/sessions.db (not globalStorageUri) | globalStorageUri resolves to remote host filesystem; fixed path works consistently on every machine                              | — Pending |
| extensionKind: ["workspace"]                               | Extension should run where files are (local or remote) and write state to that machine                                           | — Pending |
| Per-instance JSON files as primary storage                 | Collocated with VS Code Server binary; zero locking; easy to glob; survives SQLite failures                                      | — Pending |
| Open/close events only (not saves)                         | Reduces noise; workspace + opened files captures enough context for routing                                                      | — Pending |
| Single Rust crate (not workspace)                          | CLI stays small; workspace overhead not justified at v1                                                                          | — Pending |
| Dedicated install directory ~/.this-code/bin/              | Prevents accidental PATH pollution from other binaries                                                                           | — Pending |
| @vscode/sqlite3 over better-sqlite3                        | better-sqlite3 has NODE_MODULE_VERSION mismatches with Electron; @vscode/sqlite3 is Microsoft's own fork with Node-API prebuilts | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-27 after Phase 2 completion — Rust CLI scaffold + shell integration delivered_
