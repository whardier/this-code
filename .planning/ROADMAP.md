# Roadmap: This Code

## Overview

This Code ships in four phases following the data flow: extension writes session state (Phase 1), CLI reads it (Phase 2), querying exposes it (Phase 3), packaging distributes it (Phase 4). The extension must come first because it creates the SQLite schema and populates the database that everything downstream depends on. Each phase delivers a complete, independently verifiable capability.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Extension Core + Storage Foundation** - VS Code extension records session metadata to per-instance JSON and SQLite index
- [x] **Phase 2: Rust CLI + Shell Integration** - CLI binary reads session database, shell scripts prepend it to PATH (completed 2026-04-27)
- [x] **Phase 3: Session Querying + Pass-Through** - CLI queries session state and passes through to real code binary (completed 2026-04-28)
- [ ] **Phase 4: Packaging + Distribution** - Platform-specific VSIX builds with bundled CLI, CI matrix, Marketplace publish

## Phase Details

### Phase 1: Extension Core + Storage Foundation

**Goal**: Extension silently records session metadata wherever VS Code runs, producing inspectable JSON files and a queryable SQLite database
**Depends on**: Nothing (first phase)
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, TRACK-01, TRACK-02, TRACK-03, TRACK-04, TRACK-05, PLAT-01
**Success Criteria** (what must be TRUE):

1. After opening a workspace in VS Code, a JSON file exists at `~/.vscode-server/bin/{hash}/this-code-session.json` (SSH remote) or `~/.this-code/sessions/{hash}.json` (local) containing workspace path, server commit hash, user-data-dir, profile, and open files
2. After opening a workspace, `~/.this-code/sessions.db` contains a row with matching session data queryable via `sqlite3` CLI
3. Opening and closing files in the editor updates the `open_files` array in the SQLite row within seconds
4. Extension produces no visible UI — only an Output Channel entry appears under "This Code" with activation and event diagnostics
5. Extension activates on both local and SSH Remote workspaces (extensionKind workspace behavior confirmed)
   **Plans**: 7 plans

Plans:

- [ ] 01-01-PLAN.md — Scaffold extension/ directory: package.json, tsconfig, esbuild, test infrastructure, npm install
- [ ] 01-02-PLAN.md — Database layer: @vscode/sqlite3 Promise wrapper, WAL mode, schema migration (STOR-02, STOR-03, STOR-05)
- [ ] 01-03-PLAN.md — Session recording: collectSessionMetadata, getSessionJsonPath, writeSessionJson (STOR-01, STOR-05, TRACK-01–03)
- [ ] 01-04-PLAN.md — Document tracking: updateOpenFiles, onDidOpen/Close handlers, rebuild from textDocuments (TRACK-04, TRACK-05)
- [ ] 01-05-PLAN.md — Startup scan: scanExistingRemoteSessions fire-and-forget (STOR-04)
- [ ] 01-06-PLAN.md — Output channel + config gating: logLevel, thisCode.enable early exit, globalStorageUri logging (EXT-04, EXT-05)
- [ ] 01-07-PLAN.md — CI matrix: GitHub Actions macOS-latest + ubuntu-latest, typecheck + build + manifest verify (PLAT-01)

### Phase 2: Rust CLI + Shell Integration

**Goal**: A Rust binary installs into `~/.this-code/bin/` and shell integration scripts make it available as the leftmost `code` in PATH
**Depends on**: Phase 1
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, SHELL-01, SHELL-02, SHELL-03, SHELL-04, PLAT-02
**Success Criteria** (what must be TRUE):

1. Running `this-code` from a terminal prints help/version output confirming the Rust binary is functional
2. After running `this-code install` and sourcing `~/.this-code/env`, `code` resolves to `~/.this-code/bin/code` (the shim symlink)
3. Running the `code` shim invokes the real VS Code `code` binary without infinite recursion, even when called repeatedly
4. Running the `code` shim with `THIS_CODE_ACTIVE=1` already set correctly passes through without double-processing (D-05 guard)
5. On macOS with zsh, the shim remains leftmost in PATH even after opening a new terminal (survives `path_helper` — env file sourced from `~/.zshrc`)
   **Plans**: 6 plans

Plans:

- [x] 02-01-PLAN.md — Scaffold CLI crate: cli/Cargo.toml, cli/clippy.toml, cli/src/main.rs skeleton (CLI-02)
- [x] 02-02-PLAN.md — Clap argument structure + tracing: Cli struct, Commands enum, tracing subscriber init (CLI-01)
- [x] 02-03-PLAN.md — Config infrastructure: figment Config struct, load_config(), THIS_CODE_CODE_PATH → code_path (CLI-05)
- [x] 02-04-PLAN.md — Real code discovery + recursion guard + pass-through: run_shim(), discover_real_code(), exec (CLI-03, CLI-04, CLI-05, PLAT-02)
- [x] 02-05-PLAN.md — this-code install command: env file, symlink, fish conf.d, idempotent (CLI-06, SHELL-02, SHELL-03, SHELL-04)
- [x] 02-06-PLAN.md — Rust CI: GitHub Actions matrix ubuntu-latest + macos-latest, fmt + clippy + build + test (PLAT-02)

### Phase 3: Session Querying + Pass-Through

**Goal**: CLI can query session history and route code invocations through to the real binary with full context awareness
**Depends on**: Phase 2
**Requirements**: QUERY-01, QUERY-02, QUERY-03, QUERY-04
**Success Criteria** (what must be TRUE):

1. Running `this-code query /path/to/project` returns the last-known session for that directory (workspace, profile, user-data-dir, timestamp)
2. Running `this-code query /path/to/project --dry-run` prints what the CLI would do without executing anything
3. Running `code /path/to/project` via the shim passes through to the real `code` binary with original arguments (v1 default behavior)
4. CLI reads session data from `~/.this-code/sessions.db` (SQLite only per D-02)
   **Plans**: 2 plans

Plans:

- [x] 03-01-PLAN.md — Data layer: db.rs (Session struct, open_db, query_latest_session) + config.rs db_path field (QUERY-01)
- [x] 03-02-PLAN.md — Query command: query.rs handler, cli.rs Query variant, main.rs wiring (QUERY-02, QUERY-03, QUERY-04)

### Phase 4: Packaging + Distribution

**Goal**: Users can install This Code from the VS Code Marketplace or GitHub Releases on any supported platform
**Depends on**: Phase 3
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04
**Success Criteria** (what must be TRUE):

1. Running `vsce package --target darwin-arm64` (and the other 3 targets) produces a valid VSIX file containing the correct native SQLite binary and Rust CLI binary for that platform
2. A GitHub Actions workflow builds all 4 platform VSIX packages on a tagged release without manual intervention
3. The extension is installable from the VS Code Marketplace as `whardier.this-code` and activates correctly on the target platform
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase                                  | Plans Complete | Status      | Completed |
| -------------------------------------- | -------------- | ----------- | --------- |
| 1. Extension Core + Storage Foundation | 0/7            | Planned     | -         |
| 2. Rust CLI + Shell Integration        | 6/6 | Complete   | 2026-04-27 |
| 3. Session Querying + Pass-Through     | 2/2 | Complete   | 2026-04-28 |
| 4. Packaging + Distribution            | 0/?            | Not started | -         |

## Backlog

### Phase 999.1: this-code which subcommand (BACKLOG)

**Goal:** Add a `this-code which [PATH]` subcommand that prints the real `code` binary path (and matched workspace) for a given path, without displaying session data. Cleaner separation of concerns from `--dry-run` on `query` — `which` answers "what binary would launch?" while `query` answers "what session exists?".
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
