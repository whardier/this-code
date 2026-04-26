# Phase 1: Extension Core + Storage Foundation - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

VS Code extension silently records session metadata wherever VS Code runs (local or SSH remote) — workspace path, server commit hash, `--user-data-dir`, `--profile`, and open file manifest — into per-instance JSON files and a queryable SQLite index at `~/.this-code/sessions.db`. The CLI, shell integration, and routing logic are out of scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Profile Detection (TRACK-03)
- **D-01:** Extract profile ID by parsing `globalStorageUri` path segments (e.g., `.../profiles/{hash}/globalStorage/...`). Best-effort: if path parsing yields nothing, record `null` in the `profile` column. This empirically validates the workaround during Phase 1 rather than deferring to v2.

### Open File Tracking (TRACK-04)
- **D-02:** On every `onDidOpenTextDocument` and `onDidCloseTextDocument` event, rebuild `open_files` by reading from `vscode.workspace.textDocuments` (the authoritative live list) rather than incrementally adding/removing URIs. Eliminates false positives from language mode changes (which fire close+open for the same document) without any debouncing complexity.

### Configuration Surface (EXT-05)
- **D-03:** Expose exactly two VS Code settings:
  - `thisCode.enable` (boolean, default `true`) — enable/disable all session recording
  - `thisCode.logLevel` (`"off" | "info" | "debug"`, default `"info"`) — output channel verbosity
  No additional settings in Phase 1. `thisCode.dbPath` and exclusion patterns are deferred.

### Session JSON Path — Local Sessions (STOR-01)
- **D-04:** For local (non-SSH) VS Code sessions, the per-instance JSON file lives at `~/.this-code/sessions/{hash}.json` where `{hash}` is derived from `vscode.env.appRoot` or VS Code version string. All local JSON files live under the same `~/.this-code/` tree as the SQLite DB.
- **D-05:** For SSH remote sessions, per-instance JSON lives at `~/.vscode-server/bin/{commit-hash}/this-code-session.json` — collocated with the VS Code Server binary, zero locking, easy to glob. Filename is `this-code-session.json` (not `which-code-session.json`).

### Storage Paths — Global Rename (All Phases)
- **D-06:** All storage paths use `~/.this-code/` (not `~/.which-code/`), consistent with the project rename to "This Code":
  - SQLite index: `~/.this-code/sessions.db`
  - Local session JSON dir: `~/.this-code/sessions/`
  - CLI install dir (Phase 2): `~/.this-code/bin/`
  - Home directory created on first activation: `~/.this-code/`
  - Environment variable guard (Phase 2): `THIS_CODE_ACTIVE=1`
  - Figment config file (Phase 2): `~/.this-code/config.toml`
  - **Note:** `.planning/REQUIREMENTS.md` and `.planning/PROJECT.md` still say `~/.which-code/` — downstream agents should treat D-06 as the authoritative correction.

### Schema Column Names and STOR-03 Columns (STOR-03)
- **D-07:** The invocations table uses `invoked_at` as the timestamp column name (not `recorded_at` as written in REQUIREMENTS.md STOR-03). `invoked_at` matches the STACK.md locked schema and is what the Rust CLI (Phase 2) reads. Additionally, `server_commit_hash TEXT` and `server_bin_path TEXT` are retained as explicit nullable columns in the schema per STOR-03 — they are NOT dropped or derived from other columns. Final 11-column schema:
  - `id`, `invoked_at`, `workspace_path`, `user_data_dir`, `profile`, `local_ide_path`, `remote_name`, `remote_server_path`, `server_commit_hash`, `server_bin_path`, `open_files`

### Claude's Discretion
- Startup scan aggressiveness for STOR-04 (incremental scan that skips already-indexed paths is preferred over a full rescan)
- Exact log lines emitted per event to the output channel
- Schema migration implementation detail (idempotent `CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version` check in `activate()`)
- Hash derivation strategy for local session JSON filename (collision-safe, stable across restarts)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Full requirement list; EXT-01 through EXT-05, STOR-01 through STOR-05, TRACK-01 through TRACK-05, PLAT-01 are all in scope for Phase 1. Note: all `~/.which-code/` paths in this file are superseded by D-06 above (`~/.this-code/`). Column name `recorded_at` in STOR-03 is superseded by D-07 (`invoked_at`).

### Research
- `.planning/research/SUMMARY.md` — Resolved decisions, architecture approach, confidence assessment
- `.planning/research/STACK.md` — Technology stack with version pinning; SQLite schema definition; esbuild config; tsconfig; `.vscodeignore` template; package.json manifest skeleton
- `.planning/research/PITFALLS.md` — 12 pitfalls; directly relevant to Phase 1: Pitfall 1 (globalStorageUri remote path), Pitfall 2 (SQLite native module packaging), Pitfall 4 (SQLite concurrent access + WAL), Pitfall 7 (activation overhead), Pitfall 8 (esbuild native module bundling), Pitfall 9 (extensionKind misconfiguration), Pitfall 11 (schema migrations)
- `.planning/research/FEATURES.md` — Feature expectations for Phase 1 (table stakes vs differentiators vs deferred)

### External references
- VS Code Extension API: `vscode.workspace.textDocuments`, `vscode.env.remoteName`, `vscode.env.appRoot`, `onStartupFinished`
- VS Code profile API gap: github.com/microsoft/vscode/issues/177463 — no public API for profile name; workaround is `globalStorageUri` path parsing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No source files exist yet — this is a greenfield project. `package.json` exists at root but only contains the GSD dependency.

### Established Patterns
- Reference project: `../periphore/` — Rust conventions for Phase 2+ (clap 4.6, figment 0.10, edition 2024, tracing, thiserror, anyhow, clippy pedantic). Not directly used in Phase 1 (TypeScript) but the CLI conventions carry forward.
- Commitizen + prek hooks: `.prek.toml` exists at project root — conventional commits required from the first commit in Phase 1.
- `@vscode/sqlite3` async API requires a small Promise wrapper (~20 lines) as shown in STACK.md.

### Integration Points
- Phase 1 creates the SQLite schema that Phase 2 (Rust CLI) reads without modification. Schema must be finalized here.
- Activation sequence: `activate()` → ensure `~/.this-code/` exists → open/create `~/.this-code/sessions.db` → set WAL mode + `PRAGMA busy_timeout=5000` → run schema migration → insert invocation row → register document event listeners → update `open_files` on events.

</code_context>

<specifics>
## Specific Ideas

- Per-instance JSON filename for SSH remote: `this-code-session.json` (not `which-code-session.json` from the pre-rename planning docs)
- The STACK.md schema uses `invocations` table with `local_ide_path` and `remote_server_path` columns — keep these; they help the CLI distinguish local vs remote invocations without needing to re-parse `remote_name`

</specifics>

<deferred>
## Deferred Ideas

- `thisCode.dbPath` config override — held for when CLI also needs configurable DB path (Phase 2)
- `thisCode.excludePatterns` (glob array to skip tracking certain files) — v2
- Startup scan aggressiveness tuning — Claude's discretion in Phase 1; revisit post-Phase 1 if performance is a concern

</deferred>

---

*Phase: 01-extension-core-storage-foundation*
*Context gathered: 2026-04-25*
*Revised: 2026-04-25 — added D-07 (invoked_at column name + server_commit_hash/server_bin_path retained per STOR-03)*
