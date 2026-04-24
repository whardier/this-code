# Which Code

## What This Is

Which Code is a VS Code launch interceptor and session tracker. A lightweight VS Code extension (`whardier.which-code`) records each `code` invocation — workspace path, `--user-data-dir`, `--profile`, IDE paths, and open file manifest — into a local SQLite database. A companion CLI tool (`which-code`, written in Rust) sits leftmost in the user's PATH as `code`, captures launch context, avoids recursive self-invocation, and reads the session database to route subsequent `code` and `remote-code` calls to the right VS Code instance and profile.

## Core Value

Developers using VS Code remote development (SSH, Dev Containers) with multiple profiles should never have to think about which VS Code instance or `--user-data-dir` to use — which-code remembers and routes automatically.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Extension records one entry per `code` invocation (timestamp, workspace path, --user-data-dir, --profile, IDE paths, open file manifest)
- [ ] Extension stores data in VS Code `globalStorageUri` (stable across updates, writable)
- [ ] Extension uses SQLite as the storage backend
- [ ] Extension tracks file open/close events (not every save) as the manifest
- [ ] Extension has no UI — config-only with an Output Channel for diagnostics
- [ ] Extension is published to the VS Code Marketplace as `whardier.which-code`
- [ ] CLI (`which-code`) intercepts the `code` command when placed leftmost in PATH
- [ ] CLI self-detects recursive invocation and strips itself from PATH before calling real `code`
- [ ] CLI can be sourced from bash/zsh/fish to inject itself into PATH from a dedicated install directory
- [ ] CLI reads the session database to support routing decisions
- [ ] CLI is installable separately and also bundled with the extension for convenience

### Out of Scope

- IPC socket manipulation — `remote-code` works without this; deferred to future
- File-save triggers — open/close events are sufficient for v1
- CLI intercepting the `claude` command — `code` interception is the primary use case
- GUI or configuration UI for the extension — config file + output channel only
- Multi-cursor / Settings Sync profile mapping — out of scope for v1
- Windows support — macOS and Linux only

## Context

- The extension namespace is `whardier.which-code`; marketplace name is "Which Code"
- VS Code extensions should NOT write to their own install directory (clobbered on updates); `context.globalStorageUri` is the correct stable location
- The session database schema: one record per `code` invocation, immutable append log
- Record fields: `invoked_at` (ISO timestamp), `workspace_path`, `user_data_dir`, `profile`, `local_ide_path`, `remote_server_path`, `open_files` (JSON array)
- The periphore project (`../periphore/`) is a reference for Rust conventions: single workspace, clap v4, figment, tokio, conventional commits via commitizen, prek hooks
- The Rust binary for v1 is a single crate (not a full workspace), but follows periphore tooling conventions
- which-code CLI must be installed in its own dedicated directory (e.g., `~/.which-code/bin/`) so it doesn't inadvertently pull other programs into the leftmost PATH position
- Shell integration is via `source` / eval — the shell function wrapper handles the self-detection and PATH manipulation

## Constraints

- **Platform**: macOS and Linux only — Windows is out of scope
- **Extension API**: VS Code Extension API v1.75+ (for profile support and `globalStorageUri`)
- **Language (extension)**: TypeScript, matching VS Code extension conventions
- **Language (CLI)**: Rust, single binary crate, clap v4 + figment
- **Storage**: SQLite via the extension's `globalStorageUri` — readable by both extension and CLI
- **No accessibility permissions required**: Extension uses standard VS Code APIs only
- **Commits**: Conventional commits via commitizen, prek hooks (matching periphore conventions)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| globalStorageUri for SQLite | Extension install dir is clobbered on update; globalStorageUri is stable and shared across workspaces | — Pending |
| Single record per invocation (append log) | Simpler than live-updated session state; launch history is the most useful query | — Pending |
| Open/close events only (not saves) | Reduces noise; workspace + opened files captures enough context for routing | — Pending |
| Single Rust crate (not workspace) | CLI stays small; workspace overhead not justified at v1 | — Pending |
| Dedicated install directory for CLI | Prevents accidental PATH pollution from other binaries | — Pending |

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
*Last updated: 2026-04-24 after initialization*
