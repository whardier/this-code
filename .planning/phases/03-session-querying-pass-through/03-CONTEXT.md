# Phase 3: Session Querying + Pass-Through — Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `this-code query [path]` subcommand to the Rust CLI. The subcommand reads from `~/.this-code/sessions.db` (SQLite, WAL mode) and returns the most recent session for the given workspace path. The shim remains pure pass-through (Phase 2 behavior unchanged). No session-based routing in Phase 3 — that is v2.

Requirements in scope: QUERY-01, QUERY-02, QUERY-03, QUERY-04.

</domain>

<decisions>
## Implementation Decisions

### Shim Behavior (QUERY-04)

- **D-01:** The shim (`code` symlink → `this-code`) stays pure pass-through in Phase 3. It still uses the Phase 2 D-04 discovery chain (env var → config → PATH stripping + which) and execs the real binary with all original args. **No session lookup is wired into the shim in Phase 3.** Session-based routing (resolving `remote_server_path` from the DB to construct the `remote-cli/code` path) is a v2 capability. Downstream agents MUST NOT add session routing to the shim.

### Data Source (QUERY-01 narrowed)

- **D-02:** `this-code query` reads from SQLite **only**. The per-instance JSON files at `~/.vscode-server/bin/{hash}/this-code-session.json` are observability artifacts — the CLI does not parse them. QUERY-01's "and/or text files" clause is superseded: SQLite is the sole source. When `~/.this-code/sessions.db` is absent (extension not yet installed), `this-code query` prints `no sessions found` and exits 0. No error, no crash.

### DB Connection

- **D-03:** rusqlite connection flags: `SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE` (never `SQLITE_OPEN_READONLY`). WAL mode requires write access to the `-shm` file even for SELECT queries. Consistent with the WAL note in CLAUDE.md and STATE.md decision log. `PRAGMA busy_timeout = 5000` set on every connection before any query.

### Config Extension

- **D-04:** Add `db_path: Option<PathBuf>` to the figment `Config` struct. Default path when `None`: `~/.this-code/sessions.db`. Env var: `THIS_CODE_DB_PATH` → strips prefix → `DB_PATH` → lowercase → `db_path`. Same `.split("_")`-omission rule applies as for `code_path` (see Phase 2 D-07 / config.rs comment). Remove `#[allow(dead_code)]` from `code_path` when it is no longer unused (it is consumed in shim.rs — the annotation may already be gone).

### `this-code query` Subcommand (QUERY-02)

- **D-05:** Clap signature:
  ```
  this-code query [PATH] [--dry-run] [--json]
  ```
  - `PATH` — optional positional. If omitted, defaults to `std::env::current_dir()`.
  - `--dry-run` — print the exec command that would be constructed (real `code` binary path + all args) without executing. Satisfies QUERY-03.
  - `--json` — switch output to machine-readable JSON. Default output is human-readable key:value table.
  - Returns the **most recent** matching session (`ORDER BY invoked_at DESC LIMIT 1`).

- **D-06:** Path matching: call `std::fs::canonicalize(path)` on the query arg before SQL lookup. Match against `workspace_path` column with exact string equality. If `canonicalize` fails (path does not exist on disk), use the raw path string as provided.

### Output Formats

- **D-07:** Human-readable default (no flag):
  ```
  workspace:     /home/user/myproject
  profile:       default
  user_data_dir: /home/user/.config/Code
  server_hash:   abc123def456
  open_files:    3
  invoked_at:    2026-04-27 20:24
  ```
  Field order: workspace, profile, user_data_dir, server_hash, open_files (count), invoked_at.

- **D-08:** `--json` output: serialize the full session row as a JSON object. `open_files` emitted as a JSON array (already stored as JSON text in the DB — parse and re-emit). `invoked_at` emitted as ISO 8601 string.

### `--dry-run` Semantics (QUERY-03)

- **D-09:** `--dry-run` prints the exec command the shim would run for this session's workspace, formatted as:
  ```
  would exec: /usr/local/bin/code /home/user/myproject [additional args]
  ```
  Uses the Phase 2 `discover_real_code()` discovery chain (no DB lookup for the binary — binary path comes from PATH stripping, not session data). In v1 the session data informs context display only, not the exec target. Exits 0 without execing.

### Session Struct

- **D-10:** Define a `Session` struct in the new `db` module with fields matching the SQLite schema from STOR-03 / Phase 1 01-CONTEXT.md D-07:
  ```rust
  pub(crate) struct Session {
      pub id: i64,
      pub invoked_at: String,       // ISO 8601 text
      pub workspace_path: String,
      pub user_data_dir: Option<String>,
      pub profile: Option<String>,
      pub local_ide_path: Option<String>,
      pub remote_name: Option<String>,
      pub remote_server_path: Option<String>,
      pub server_commit_hash: Option<String>,
      pub server_bin_path: Option<String>,
      pub open_files: String,       // JSON text — parse when needed
  }
  ```
  All optional columns match the Phase 1 schema. `open_files` is stored as JSON text and parsed at display time, not in the struct.

### Claude's Discretion

- Exact formatting of the human-readable output (alignment, truncation of long paths)
- Whether `--json` + `--dry-run` are combinable or mutually exclusive
- Whether to include `schema_version` in JSON output
- Error message when the real code binary cannot be found (dry-run path)
- Whether `this-code query` with no sessions returns exit code 0 or 1

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` — QUERY-01 through QUERY-04 are in scope. QUERY-01 narrowed by D-02 (SQLite only, no JSON parsing). QUERY-04 confirmed: pass-through in v1.

### Prior Phase Decisions

- `.planning/phases/01-extension-core-storage-foundation/01-CONTEXT.md` — D-07 (SQLite column names, `invoked_at` not `recorded_at`). Rust `Session` struct field names must match.
- `.planning/phases/02-rust-cli-shell-integration/02-CONTEXT.md` — D-04 (real code discovery chain), D-05 (recursion guard), D-06 (pass-through behavior), D-07 (figment config). Phase 3 extends Config, does not replace it.

### Codebase

- `cli/src/config.rs` — figment merge order and `.split("_")` note. Add `db_path` field following the same pattern as `code_path`.
- `cli/src/shim.rs` — `discover_real_code()` and `exec_real_code()` are reusable for `--dry-run` path. Do not duplicate.
- `cli/src/cli.rs` — Add `Query` arm to `Commands` enum.
- `cli/Cargo.toml` — `rusqlite = { version = "0.39", features = ["bundled"] }` already present; `serde_json = "1.0"` already present. No new deps required.

### Research

- `.planning/research/STACK.md` — rusqlite usage patterns, WAL mode setup
- `.planning/research/PITFALLS.md` — Review for SQLite / CLI-relevant pitfalls

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `shim::discover_real_code()` — reuse for `--dry-run` exec path construction
- `config::load_config()` + `Config` struct — extend with `db_path` field, do not replace
- `cli::Commands` enum — add `Query { path, dry_run, json }` arm

### Established Patterns

- `pub(crate)` on all new structs and functions (unreachable-pub lint fires on `pub` in single-binary crate)
- `#[allow(dead_code)]` pattern: add only when a field is introduced before first use; remove when field is consumed
- `is_ok_and()` / `is_some_and()` for clippy pedantic compliance
- Return `anyhow::Result<()>` from all top-level command handlers
- All tests in `#[cfg(test)]` mod at bottom of each file

### Module Structure (add `db` module)

```
cli/src/
  main.rs       — add Query arm dispatch → query::run_query(...)
  cli.rs        — add Query { path, dry_run, json } to Commands enum
  config.rs     — add db_path: Option<PathBuf>
  db.rs         — NEW: open_db(), Session struct, query_latest_session()
  query.rs      — NEW: run_query() handler, output formatting
  shim.rs       — unchanged
  install.rs    — unchanged
```

</code_context>

<specifics>
## Specific Implementation Notes

- `open_db()` in `db.rs`: use `rusqlite::Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE)`. Set `PRAGMA busy_timeout = 5000` immediately after open. If the file does not exist but `CREATE` flag is set, rusqlite creates an empty DB — in that case `query_latest_session()` gets "no such table" on the first query, which should be caught and treated as "no sessions found" (same as absent DB).
- `query_latest_session()`: `SELECT ... FROM sessions WHERE workspace_path = ?1 ORDER BY invoked_at DESC LIMIT 1`. Use parameterized query, not string interpolation.
- `db_path` resolution: `config.db_path.clone().unwrap_or_else(|| BaseDirs::new()?.home_dir().join(".this-code/sessions.db"))`. Match the pattern already used in `config.rs` and `install.rs`.
- `--json` serialization: use `serde_json::to_string_pretty(&session_as_value)` where `session_as_value` is a `serde_json::Value` built from the `Session` fields. No need to `#[derive(Serialize)]` on `Session` — a manual `Value` map avoids leaking internal struct to the serialization surface.

</specifics>

<deferred>
## Deferred Ideas

- Session-based shim routing: `remote_server_path` → `remote-cli/code` exec — v2 capability, not Phase 3
- `this-code query --limit N` — show N most recent sessions; deferred, v1 returns only the most recent
- `this-code list` — list all sessions (all workspaces); not in QUERY-01–04, deferred
- `this-code sessions prune` — ADV-01 pruning (90-day max age); v2
- `--all` flag to show open_files array in table output — deferred for simplicity
- JSON file parsing in the CLI — explicitly dropped; JSON files are observability-only in v1
- `this-code query --modify-rc` / any shell modification — stays in Phase 2 deferred list

</deferred>

---

_Phase: 03-session-querying-pass-through_
_Context gathered: 2026-04-27_
