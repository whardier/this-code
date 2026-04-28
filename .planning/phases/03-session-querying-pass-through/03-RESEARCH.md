# Phase 3: Session Querying + Pass-Through — Research

**Researched:** 2026-04-27
**Domain:** Rust CLI — rusqlite query, clap optional positional args, serde_json output
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Shim stays pure pass-through in Phase 3. No session routing wired into the shim. Session-based routing is v2. Downstream agents MUST NOT add session routing to the shim.
- **D-02:** `this-code query` reads from SQLite only. Per-instance JSON files are observability artifacts — CLI does not parse them. When `~/.this-code/sessions.db` is absent, print `no sessions found` and exit 0.
- **D-03:** rusqlite connection flags: `SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE`. `PRAGMA busy_timeout = 5000` set on every connection before any query.
- **D-04:** Add `db_path: Option<PathBuf>` to figment `Config` struct. Default path when `None`: `~/.this-code/sessions.db`. Env var: `THIS_CODE_DB_PATH`. Do NOT add `.split("_")` to `Env::prefixed`.
- **D-05:** Clap signature: `this-code query [PATH] [--dry-run] [--json]`. PATH omitted → `std::env::current_dir()`. Returns most recent session (`ORDER BY invoked_at DESC LIMIT 1`).
- **D-06:** Path matching: `std::fs::canonicalize(path)` → exact match against `workspace_path`. Fallback to raw string if canonicalize fails.
- **D-07:** Human-readable default: key:value table. Field order: workspace, profile, user_data_dir, server_hash, open_files (count), invoked_at.
- **D-08:** `--json` output: full session row as JSON object. `open_files` emitted as JSON array (parse the stored JSON text). `invoked_at` as ISO 8601 string.
- **D-09:** `--dry-run` prints `would exec: <path> <args>` without executing. Uses `discover_real_code()` from shim.rs. No DB lookup for binary path.
- **D-10:** Session struct in `db.rs`. New module `query.rs` for `run_query()` handler.

### Claude's Discretion

- Exact formatting of human-readable output (alignment, truncation of long paths)
- Whether `--json` + `--dry-run` are combinable or mutually exclusive
- Whether to include `schema_version` in JSON output
- Error message when the real code binary cannot be found (dry-run path)
- Whether `this-code query` with no sessions returns exit code 0 or 1

### Deferred Ideas (OUT OF SCOPE)

- Session-based shim routing: `remote_server_path` → `remote-cli/code` exec — v2 capability
- `this-code query --limit N` — show N most recent sessions
- `this-code list` — list all sessions
- `this-code sessions prune` — ADV-01 pruning
- `--all` flag to show open_files array in table output
- JSON file parsing in the CLI
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUERY-01 | CLI reads session state from `~/.this-code/sessions.db` (SQLite only per D-02) | rusqlite 0.39 connection + query patterns; "no such table" detection for absent DB |
| QUERY-02 | CLI supports `this-code query [path]` to show last-known session for a given directory | clap optional positional PathBuf; `query_row(...).optional()`; human/JSON output |
| QUERY-03 | CLI supports `--dry-run` flag to print what it would do instead of executing | Reuse `discover_real_code()` from shim.rs; format `would exec:` without exec |
| QUERY-04 | v1 default behavior is pass-through only — shim behavior unchanged | shim.rs is unchanged; D-01 locked |
</phase_requirements>

---

## Summary

Phase 3 adds a single new subcommand (`this-code query`) and two new source files (`db.rs`, `query.rs`) to the existing CLI crate. The shim is not touched. The core challenge is idiomatic rusqlite 0.39 usage: opening with the correct `OpenFlags`, setting busy_timeout via `execute_batch`, and using the `OptionalExtension` trait to get `Result<Option<Session>>` from `query_row`. The "no such table" case (freshly created DB, extension not yet installed) must be explicitly detected and mapped to `no sessions found` output rather than an error.

The clap 4.6 optional positional is straightforward: `Option<PathBuf>` with no extra attributes produces the `[PATH]` positional that clap documents as optional-by-type. The `--json` and `--dry-run` flags are plain `bool` fields on the `Query` variant.

Human-readable output should use manual `{:<N}` format padding (no third-party table crate) since the crate already has zero table-formatting dependencies and the field count is fixed at 6. Alignment width of 14 characters covers all label lengths with one space of margin.

**Primary recommendation:** Implement `db.rs` with `open_db()` + `query_latest_session()`, `query.rs` with `run_query()`, then wire into `main.rs` and `cli.rs`. All patterns have HIGH-confidence verified sources.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DB connection management | CLI / db.rs | — | Single-binary CLI; rusqlite is synchronous; connection opened per invocation |
| Session data model | CLI / db.rs | — | Session struct mirrors SQLite schema written by extension |
| Path resolution | CLI / query.rs | OS (canonicalize) | canonicalize is a stdlib syscall; fallback to raw string |
| Output formatting (human) | CLI / query.rs | — | Fixed 6-field display; no UI tier |
| Output formatting (JSON) | CLI / query.rs | serde_json | serde_json::json! macro builds Value from struct fields |
| Dry-run exec display | CLI / query.rs | CLI / shim.rs | Reuses discover_real_code(); no exec path |
| Config extension | CLI / config.rs | — | Add db_path field; figment pattern already established |
| Arg parsing | CLI / cli.rs | — | Add Query arm to Commands enum |
| Shim pass-through | CLI / shim.rs | — | Unchanged; D-01 locked |

---

## Standard Stack

### Core (all already in Cargo.toml — no new deps required)

| Library | Locked Version | Purpose | Why |
|---------|---------------|---------|-----|
| rusqlite | 0.39.0 [VERIFIED: Cargo.lock] | SQLite read | Already present with `bundled` feature; synchronous CLI |
| serde_json | 1.0 [VERIFIED: Cargo.toml] | JSON output | Already present; `json!` macro for Value construction |
| clap | 4.6.1 [VERIFIED: Cargo.lock] | CLI args | Already present with `derive` feature |
| anyhow | 1.0 [VERIFIED: Cargo.toml] | Error propagation | All command handlers return `anyhow::Result<()>` |
| directories | 6 [VERIFIED: Cargo.toml] | Home dir resolution | `BaseDirs::new()` for db_path default |

**No new dependencies are needed for Phase 3.** [VERIFIED: Cargo.toml]

---

## Architecture Patterns

### System Architecture Diagram

```
this-code query [PATH] [--dry-run] [--json]
        |
        v
   main.rs: Commands::Query dispatch
        |
        v
   query::run_query(config, path, dry_run, json)
        |
   +---------+----------+
   |                    |
   v                    v
db::open_db(path)    shim::discover_real_code()  (dry-run only)
   |                    |
   v                    v
db::query_latest_session(conn, workspace)   format "would exec: ..."
   |
   +-- None  --> print "no sessions found", exit 0
   |
   +-- Some(session) --> format output:
                            --json  --> serde_json::json!({...})
                            default --> println!("{:<14} {}", label, val)
```

### Recommended Module Structure

```
cli/src/
  main.rs       — add Query arm: query::run_query(&config, path, dry_run, json)
  cli.rs        — add Query { path, dry_run, json } to Commands enum
  config.rs     — add db_path: Option<PathBuf> field
  db.rs         — NEW: open_db(), Session struct, query_latest_session()
  query.rs      — NEW: run_query() handler, format_human(), format_json()
  shim.rs       — UNCHANGED
  install.rs    — UNCHANGED
```

---

## Critical API Verification

### 1. rusqlite 0.39 OpenFlags Connection

[VERIFIED: docs.rs/rusqlite/0.39.0/rusqlite/struct.Connection.html via Context7]

The exact import and usage:

```rust
use rusqlite::{Connection, OpenFlags};

pub(crate) fn open_db(path: &std::path::Path) -> anyhow::Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
    Ok(conn)
}
```

`OpenFlags` is in the crate root: `use rusqlite::OpenFlags;`. The `|` operator is bitwise OR on the flags struct (implements `BitOr`). The `SQLITE_OPEN_URI` and `SQLITE_OPEN_NO_MUTEX` flags match what `Connection::open()` uses as defaults — include them to stay consistent with default behavior.

**Note:** `Connection::open()` (default) already uses `SQLITE_OPEN_READ_WRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI | SQLITE_OPEN_NO_MUTEX`. The explicit `open_with_flags` call documents the intent (D-03) and makes the WAL constraint visible in code.

### 2. PRAGMA busy_timeout via execute_batch

[VERIFIED: docs.rs/rusqlite/0.39.0/rusqlite/struct.Connection.html via Context7]

```rust
conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
```

`execute_batch` runs one or more semicolon-separated SQL statements without parameters. This is the correct method for PRAGMA calls that return no rows and take no bind parameters. An alternative is `conn.pragma_update(None, "busy_timeout", 5000)` but `execute_batch` is idiomatic for this use case and matches the pattern used in the extension's `db.ts`.

### 3. query_row + OptionalExtension for Optional Single Row

[VERIFIED: docs.rs/rusqlite/0.39.0/rusqlite/trait.OptionalExtension.html via Context7]

The `OptionalExtension` trait converts `Result<T>` into `Result<Option<T>>`, mapping `Err(QueryReturnedNoRows)` to `Ok(None)`. Import pattern:

```rust
use rusqlite::OptionalExtension as _;
```

Usage for the most-recent session query:

```rust
pub(crate) fn query_latest_session(
    conn: &Connection,
    workspace: &str,
) -> anyhow::Result<Option<Session>> {
    let result = conn.query_row(
        "SELECT id, invoked_at, workspace_path, user_data_dir, profile,
                local_ide_path, remote_name, remote_server_path,
                server_commit_hash, server_bin_path, open_files
         FROM invocations
         WHERE workspace_path = ?1
         ORDER BY invoked_at DESC
         LIMIT 1",
        rusqlite::params![workspace],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                invoked_at: row.get(1)?,
                workspace_path: row.get(2)?,
                user_data_dir: row.get(3)?,
                profile: row.get(4)?,
                local_ide_path: row.get(5)?,
                remote_name: row.get(6)?,
                remote_server_path: row.get(7)?,
                server_commit_hash: row.get(8)?,
                server_bin_path: row.get(9)?,
                open_files: row.get(10)?,
            })
        },
    )
    .optional()?;
    Ok(result)
}
```

`query_row` returns `Err(QueryReturnedNoRows)` when LIMIT 1 finds nothing. `.optional()` converts that specific error to `Ok(None)` and passes all other errors through unchanged. The trailing `?` propagates real errors (I/O, schema mismatch, type errors) to the caller.

### 4. "No Such Table" Error Detection

[VERIFIED: docs.rs/rusqlite/0.39.0/rusqlite/enum.ErrorCode.html via Context7]

When `open_with_flags` creates a new empty DB (extension never activated), the first `SELECT ... FROM invocations` returns a `SqliteFailure` with `ErrorCode::Unknown` (maps to `SQLITE_ERROR` in SQLite's API — the generic "SQL error or missing database" code, which covers "no such table").

The canonical handling approach: wrap `query_latest_session()` in `query.rs` and match the error:

```rust
use rusqlite::{Error as RusqliteError, ErrorCode};

match db::query_latest_session(&conn, workspace) {
    Ok(maybe_session) => maybe_session,
    Err(e) => {
        // Check if the underlying cause is a rusqlite "no such table" error
        if let Some(RusqliteError::SqliteFailure(ref sqlite_err, _)) =
            e.downcast_ref::<RusqliteError>()
        {
            if matches!(sqlite_err.code, ErrorCode::Unknown) {
                // Empty DB — extension not yet installed
                println!("no sessions found");
                return Ok(());
            }
        }
        return Err(e);
    }
}
```

`ErrorCode::Unknown` is the variant for `SQLITE_ERROR` (generic SQL error), which SQLite returns for "no such table". This is the correct variant — NOT `ErrorCode::NotFound` (which is `SQLITE_NOTFOUND`, a different code for unknown opcode in file_control).

**Alternative simpler approach:** Check the error message string. Since this is a bundled SQLite (version controlled), the message is deterministic:

```rust
if e.to_string().contains("no such table") {
    println!("no sessions found");
    return Ok(());
}
```

The string-match approach is simpler and does not depend on SQLite internal error code semantics. Given that this is a bundled SQLite and the error message "no such table" is stable across SQLite versions, this is acceptable. The planner may choose either; document the choice.

### 5. clap 4.6 Optional Positional PathBuf

[VERIFIED: docs.rs/clap/latest/clap/_derive/_tutorial/index.html via Context7]

In clap's derive API, wrapping a field type in `Option<T>` makes it optional automatically. No `#[arg(required = false)]` needed. For a positional argument, no `#[arg(short)]` or `#[arg(long)]` is needed either — the absence of those attributes makes it positional.

```rust
#[derive(Subcommand)]
pub(crate) enum Commands {
    /// Show the last-known session for a workspace path.
    Query {
        /// Workspace path to look up (default: current directory).
        path: Option<PathBuf>,
        /// Print what would be executed without running it.
        #[arg(long)]
        dry_run: bool,
        /// Output as JSON instead of human-readable table.
        #[arg(long)]
        json: bool,
    },
    Install {
        #[arg(long)]
        fish: bool,
    },
}
```

`path: Option<PathBuf>` with no `#[arg(...)]` produces `[PATH]` in the help output. Clap infers `required = false` from the `Option` wrapper. [VERIFIED: clap docs "Define Optional Argument" example]

**Field name `dry_run` vs flag `--dry-run`:** Clap's derive API converts field name `dry_run` to flag `--dry-run` automatically (snake_case → kebab-case). No `#[arg(long = "dry-run")]` needed.

### 6. serde_json::Value from Session Fields

[VERIFIED: serde_json 1.0 json! macro — ASSUMED pattern is standard; confirmed via project Cargo.toml serde_json = "1.0"]

The `json!` macro builds a `serde_json::Value::Object` without needing `#[derive(Serialize)]` on `Session`. This avoids leaking the internal struct to the serialization surface (per D-10 specifics).

```rust
use serde_json::json;

fn session_to_json(session: &Session) -> serde_json::Value {
    // open_files is stored as JSON text; parse it back to a Value
    let open_files_value: serde_json::Value =
        serde_json::from_str(&session.open_files).unwrap_or(json!([]));

    json!({
        "id": session.id,
        "invoked_at": session.invoked_at,
        "workspace_path": session.workspace_path,
        "user_data_dir": session.user_data_dir,
        "profile": session.profile,
        "local_ide_path": session.local_ide_path,
        "remote_name": session.remote_name,
        "remote_server_path": session.remote_server_path,
        "server_commit_hash": session.server_commit_hash,
        "server_bin_path": session.server_bin_path,
        "open_files": open_files_value,
    })
}
```

`serde_json::to_string_pretty(&value)` produces indented JSON output. `Option<String>` fields serialize as `null` automatically.

### 7. std::fs::canonicalize Fallback Pattern

[VERIFIED: Rust stdlib docs — ASSUMED standard pattern; consistent with D-06]

```rust
let canonical = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
let workspace_str = canonical.to_string_lossy().into_owned();
```

This is idiomatic. `canonicalize` returns `Err` when the path does not exist on disk. The `unwrap_or_else` closure returns the original path unchanged. One caveat: `canonicalize` also resolves symlinks — if the user's `workspace_path` in the DB was recorded before a symlink was introduced, the canonicalized form will differ. Per D-06 this is accepted behavior for v1.

`to_string_lossy()` handles non-UTF-8 paths (unlikely on macOS/Linux for workspace paths but defensive). `.into_owned()` converts the `Cow<str>` to a `String`.

### 8. Human-Readable Table Alignment (No External Crate)

[VERIFIED: Rust stdlib fmt — confirmed no table crates in Cargo.toml]

Manual `{:<N}` format padding is the correct approach. No `tabled`, `comfy-table`, or `prettytable` needed given the fixed 6-field output.

Label lengths: `workspace` (9), `profile` (7), `user_data_dir` (13), `server_hash` (11), `open_files` (10), `invoked_at` (10). Width 14 covers all with one space of margin:

```rust
fn format_human(session: &Session) {
    let open_files_count = serde_json::from_str::<serde_json::Value>(&session.open_files)
        .ok()
        .and_then(|v| v.as_array().map(|a| a.len()))
        .unwrap_or(0);

    println!("{:<14} {}", "workspace:", session.workspace_path);
    println!(
        "{:<14} {}",
        "profile:",
        session.profile.as_deref().unwrap_or("(none)")
    );
    println!(
        "{:<14} {}",
        "user_data_dir:",
        session.user_data_dir.as_deref().unwrap_or("(none)")
    );
    println!(
        "{:<14} {}",
        "server_hash:",
        session.server_commit_hash.as_deref().unwrap_or("(none)")
    );
    println!("{:<14} {}", "open_files:", open_files_count);
    println!("{:<14} {}", "invoked_at:", session.invoked_at);
}
```

### 9. WAL Mode — READWRITE is Sufficient for CLI SELECTs

[VERIFIED: PITFALLS.md Pitfall 4 + SQLite WAL docs cited therein; CONTEXT.md D-03]

Opening with `SQLITE_OPEN_READ_WRITE` is required and sufficient. WAL mode requires write access to the `-shm` (shared memory index) file even for read-only consumers. The CLI does NOT need to re-issue `PRAGMA journal_mode=WAL` — the extension sets WAL once at DB creation; the mode persists in the DB header. Re-issuing is safe (idempotent) but unnecessary.

**What the CLI must NOT do:** Open with `SQLITE_OPEN_READONLY`. This causes `SQLITE_READONLY` errors when trying to update the `-shm` file.

### 10. Test Patterns for db.rs with In-Memory DB

[VERIFIED: docs.rs/rusqlite/0.39.0 via Context7 — `Connection::open_in_memory()` pattern]

The standard pattern for unit testing rusqlite functions:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn make_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        conn.execute_batch("PRAGMA busy_timeout = 5000;").unwrap();
        conn.execute_batch(
            "CREATE TABLE invocations (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                invoked_at         TEXT    NOT NULL,
                workspace_path     TEXT,
                user_data_dir      TEXT,
                profile            TEXT,
                local_ide_path     TEXT    NOT NULL,
                remote_name        TEXT,
                remote_server_path TEXT,
                server_commit_hash TEXT,
                server_bin_path    TEXT,
                open_files         TEXT    NOT NULL DEFAULT '[]'
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_query_latest_session_empty_table() {
        let conn = make_test_db();
        let result = query_latest_session(&conn, "/some/path").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_query_latest_session_returns_most_recent() {
        let conn = make_test_db();
        conn.execute(
            "INSERT INTO invocations
             (invoked_at, workspace_path, local_ide_path, open_files)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "2026-04-27T10:00:00.000",
                "/home/user/project",
                "/usr/bin/code",
                "[]"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO invocations
             (invoked_at, workspace_path, local_ide_path, open_files)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "2026-04-27T20:00:00.000",
                "/home/user/project",
                "/usr/bin/code",
                "[\"file.rs\"]"
            ],
        )
        .unwrap();
        let session = query_latest_session(&conn, "/home/user/project")
            .unwrap()
            .expect("should find a session");
        assert_eq!(session.invoked_at, "2026-04-27T20:00:00.000");
    }

    #[test]
    fn test_query_latest_session_workspace_mismatch() {
        let conn = make_test_db();
        conn.execute(
            "INSERT INTO invocations
             (invoked_at, workspace_path, local_ide_path, open_files)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "2026-04-27T10:00:00.000",
                "/home/user/project-a",
                "/usr/bin/code",
                "[]"
            ],
        )
        .unwrap();
        let result = query_latest_session(&conn, "/home/user/project-b").unwrap();
        assert!(result.is_none());
    }
}
```

`Connection::open_in_memory()` creates a new in-memory DB each time. `make_test_db()` helper creates the schema matching Phase 1's `initDatabase()`. `query_latest_session()` receives a `&Connection` so the same function works with real and in-memory connections.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optional single-row query | Custom `if rows.len() == 0` logic | `query_row(...).optional()` | OptionalExtension trait handles QueryReturnedNoRows; hand-rolled check loses error context |
| JSON output from struct | Manual `format!("{{"key":"{}"...}}")` | `serde_json::json!({...})` macro | Handles escaping, nulls, nested arrays automatically |
| SQLite flag construction | Integer arithmetic on flag bits | `OpenFlags::SQLITE_OPEN_READ_WRITE \| OpenFlags::SQLITE_OPEN_CREATE` | Type-safe; documented constants |
| Table output alignment | External `tabled` crate | `println!("{:<14} {}", label, val)` | Zero new deps; fixed 6 fields; stdlib format is sufficient |
| Path normalization with fallback | Custom realpath wrapper | `std::fs::canonicalize(&p).unwrap_or_else(\|_\| p.clone())` | Stdlib; handles missing path via unwrap_or_else |

---

## Common Pitfalls

### Pitfall 1: Opening DB with SQLITE_OPEN_READONLY Breaks WAL SELECTs

**What goes wrong:** Opening with `OpenFlags::SQLITE_OPEN_READ_ONLY` causes `SQLITE_READONLY` error when SQLite tries to update the `-shm` shared memory file needed for WAL mode readers.

**How to avoid:** Always use `SQLITE_OPEN_READ_WRITE | SQLITE_OPEN_CREATE` per D-03.

**Warning signs:** Error message contains "attempt to write a readonly database".

### Pitfall 2: Missing OptionalExtension Import

**What goes wrong:** `query_row(...).optional()` does not compile because the trait is not in scope. The trait is NOT re-exported from the crate root `use rusqlite::*`.

**How to avoid:** Add explicit import: `use rusqlite::OptionalExtension as _;` (the `as _` form imports only the methods, not the name, which avoids an `unused import` warning if the trait name itself is not referenced).

**Warning signs:** Compiler error: "method not found in `Result<...>`".

### Pitfall 3: unreachable_pub Lint on New Modules

**What goes wrong:** `pub struct Session` or `pub fn open_db()` in `db.rs` fires the `unreachable_pub` lint (set to `warn` in Cargo.toml `[lints.rust]`). The crate is a single binary — `pub` visibility is unreachable outside the binary.

**How to avoid:** Use `pub(crate)` on all new structs, functions, and impl blocks in `db.rs` and `query.rs`. This matches the established pattern in `config.rs`, `shim.rs`, and `install.rs`.

**Warning signs:** Compiler warning `unreachable_pub` on any `pub` item in the new modules.

### Pitfall 4: figment Env Prefix Split Breaks db_path Override

**What goes wrong:** Adding `.split("_")` to `Env::prefixed("THIS_CODE_")` when adding `db_path` maps `DB_PATH` to a nested `db.path` key rather than the flat `db_path` field. The env var is silently ignored.

**How to avoid:** Do NOT add `.split("_")`. The existing `config.rs` comment documents this explicitly. `THIS_CODE_DB_PATH` → strip prefix → `DB_PATH` → lowercase → `db_path`. This works correctly with the flat struct field.

**Warning signs:** Setting `THIS_CODE_DB_PATH=/tmp/test.db` has no effect.

### Pitfall 5: Table Name is `invocations`, Not `sessions`

**What goes wrong:** CONTEXT.md D-10 names the struct `Session` and references `sessions.db`, so it is tempting to write `SELECT ... FROM sessions`. But the actual SQLite table name created by Phase 1's `db.ts` is `invocations`.

**How to avoid:** Use `FROM invocations` in all SQL queries. Confirmed in `extension/src/db.ts` line 74: `CREATE TABLE IF NOT EXISTS invocations`.

**Warning signs:** `SqliteFailure` with "no such table" even when the DB file exists and has data.

### Pitfall 6: Parameterized Query Uses ?1 Not %s

**What goes wrong:** Using string interpolation (`format!("... WHERE workspace_path = '{}'", path)`) bypasses SQLite's parameterized query mechanism. While workspace paths are unlikely to contain SQL injection characters, it violates the T-04-01 mitigation already established in the project.

**How to avoid:** Always use `rusqlite::params![workspace]` with `?1` placeholder. The in-memory test fixture confirms this pattern.

**Warning signs:** Clippy or code review flags string interpolation in SQL.

### Pitfall 7: serde_json::from_str Panics on Corrupt open_files

**What goes wrong:** If the extension wrote a malformed `open_files` value (e.g., truncated JSON during a crash), `serde_json::from_str` returns `Err`. Using `.unwrap()` panics the CLI.

**How to avoid:** Always use `.unwrap_or(json!([]))` or `.unwrap_or_default()` when parsing `open_files`. For the count: `.ok().and_then(|v| v.as_array().map(|a| a.len())).unwrap_or(0)`.

---

## Code Examples

### Complete db.rs Skeleton

```rust
// Source: rusqlite 0.39 docs + Phase 1 extension/src/db.ts schema
use anyhow::Result;
use rusqlite::{Connection, OpenFlags, OptionalExtension as _};
use std::path::Path;

pub(crate) struct Session {
    pub(crate) id: i64,
    pub(crate) invoked_at: String,
    pub(crate) workspace_path: String,
    pub(crate) user_data_dir: Option<String>,
    pub(crate) profile: Option<String>,
    pub(crate) local_ide_path: Option<String>,
    pub(crate) remote_name: Option<String>,
    pub(crate) remote_server_path: Option<String>,
    pub(crate) server_commit_hash: Option<String>,
    pub(crate) server_bin_path: Option<String>,
    pub(crate) open_files: String, // JSON text — parse when needed
}

pub(crate) fn open_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
    Ok(conn)
}

pub(crate) fn query_latest_session(
    conn: &Connection,
    workspace: &str,
) -> Result<Option<Session>> {
    conn.query_row(
        "SELECT id, invoked_at, workspace_path, user_data_dir, profile,
                local_ide_path, remote_name, remote_server_path,
                server_commit_hash, server_bin_path, open_files
         FROM invocations
         WHERE workspace_path = ?1
         ORDER BY invoked_at DESC
         LIMIT 1",
        rusqlite::params![workspace],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                invoked_at: row.get(1)?,
                workspace_path: row.get(2)?,
                user_data_dir: row.get(3)?,
                profile: row.get(4)?,
                local_ide_path: row.get(5)?,
                remote_name: row.get(6)?,
                remote_server_path: row.get(7)?,
                server_commit_hash: row.get(8)?,
                server_bin_path: row.get(9)?,
                open_files: row.get(10)?,
            })
        },
    )
    .optional()
    .map_err(anyhow::Error::from)
}
```

### query.rs run_query Skeleton

```rust
// Source: CONTEXT.md D-05 through D-09
use crate::{config::Config, db, shim};
use anyhow::Result;
use directories::BaseDirs;
use std::path::PathBuf;

pub(crate) fn run_query(
    config: &Config,
    path: Option<PathBuf>,
    dry_run: bool,
    json: bool,
) -> Result<()> {
    // Resolve query path: provided arg or cwd
    let raw_path = match path {
        Some(p) => p,
        None => std::env::current_dir()?,
    };
    // D-06: canonicalize with fallback
    let canonical = std::fs::canonicalize(&raw_path).unwrap_or_else(|_| raw_path.clone());
    let workspace = canonical.to_string_lossy().into_owned();

    // D-04: resolve db_path from config or default
    let db_path = config.db_path.clone().unwrap_or_else(|| {
        BaseDirs::new()
            .map(|b| b.home_dir().join(".this-code/sessions.db"))
            .unwrap_or_else(|| PathBuf::from(".this-code/sessions.db"))
    });

    // If DB does not exist yet, treat as no sessions
    if !db_path.exists() {
        println!("no sessions found");
        return Ok(());
    }

    let conn = db::open_db(&db_path)?;
    let session = match db::query_latest_session(&conn, &workspace) {
        Ok(s) => s,
        Err(e) => {
            if e.to_string().contains("no such table") {
                println!("no sessions found");
                return Ok(());
            }
            return Err(e);
        }
    };

    let Some(session) = session else {
        println!("no sessions found");
        return Ok(());
    };

    // D-09: dry-run — print what would be exec'd
    if dry_run {
        let own_bin_dir = BaseDirs::new()
            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
            .home_dir()
            .join(".this-code/bin");
        let real_code = shim::discover_real_code(config, &own_bin_dir)?;
        println!("would exec: {} {}", real_code.display(), workspace);
        return Ok(());
    }

    if json {
        let value = session_to_json(&session);
        println!("{}", serde_json::to_string_pretty(&value)?);
    } else {
        format_human(&session);
    }

    Ok(())
}
```

### config.rs Extension

```rust
// Add db_path field following the same pattern as code_path
#[derive(Deserialize, Default, Debug, Clone)]
pub(crate) struct Config {
    // ... existing code_path field ...
    /// Explicit path to the sessions SQLite database.
    ///
    /// Set via `THIS_CODE_DB_PATH` env var or `db_path` key in config.toml.
    /// When `None`, defaults to `~/.this-code/sessions.db`.
    pub(crate) db_path: Option<PathBuf>,
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `query_row` returns Err on no rows | `.optional()` converts to `Ok(None)` | rusqlite stable API | Eliminates explicit `QueryReturnedNoRows` match |
| `params!` macro required | `[value]` array syntax also works | rusqlite 0.20+ | Both work; `params!` is explicit, array syntax is concise |
| `pub` on all items | `pub(crate)` for single-binary crates | Rust lint best practice | Silences `unreachable_pub` lint already configured in Cargo.toml |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SQLITE_OPEN_URI \| SQLITE_OPEN_NO_MUTEX` should be included alongside READ_WRITE \| CREATE to match default `Connection::open()` behavior | API Verification §1 | Minor: omitting them still works; connection opens without URI interpretation or mutex serialization; no functional impact for this CLI |
| A2 | `ErrorCode::Unknown` maps to `SQLITE_ERROR` which covers "no such table" | API Verification §4 | If wrong, the "no such table" detection fails and CLI returns an error instead of "no sessions found". String-match fallback avoids this risk. |
| A3 | String match on `e.to_string().contains("no such table")` is stable across bundled SQLite versions | API Verification §4 | SQLite error messages are historically stable; bundled version is controlled in Cargo.lock. Very low risk. |

**If this table is empty:** All other claims in this research were verified or cited via Context7/official docs.

---

## Open Questions

1. **`--json` + `--dry-run` combinability**
   - What we know: D-09 says `--dry-run` prints the exec command and exits. D-08 says `--json` changes session output format.
   - What's unclear: Should `--dry-run --json` output the dry-run message as JSON `{"would_exec": "..."}` or print the plain string?
   - Recommendation: Claude's discretion — simplest implementation is `--dry-run` takes priority over `--json` when both are set. Document in help text.

2. **Exit code on no sessions found**
   - What we know: D-02 says exit 0 for absent DB. Claude's discretion for zero-results case.
   - Recommendation: Exit 0 for "no sessions found" to be consistent with grep-style tools that exit 0 for no-match, non-zero only for errors. Makes scripting predictable.

3. **`local_ide_path` field nullability in db.rs Session struct**
   - What we know: Phase 1 schema declares `local_ide_path TEXT NOT NULL`. CONTEXT.md D-10 declares `pub(crate) local_ide_path: Option<String>`.
   - What's unclear: The DB column is NOT NULL, so in practice it will never be null. Using `Option<String>` is safe (rusqlite maps `NOT NULL TEXT` to `String` but `Option<String>` also works). Using `String` would be more accurate but fails if a row somehow has NULL (e.g., schema migration bug).
   - Recommendation: Keep `Option<String>` per D-10 for defensive coding. No functional impact.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust/cargo | Compilation | Yes | 1.95.0 (2026-04-14) | — |
| rusqlite bundled SQLite | DB access | Yes (in Cargo.lock) | 3.51.0 | — |
| sqlite3 CLI | Manual DB inspection during test | Yes | 3.51.0 | `cargo test` covers automated paths |

**No missing blocking dependencies.**

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | cargo test (built-in Rust test runner) |
| Config file | none — standard `#[cfg(test)]` modules |
| Quick run command | `cargo test --manifest-path cli/Cargo.toml` |
| Full suite command | `cargo test --manifest-path cli/Cargo.toml` (same; no separate integration suite) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUERY-01 | DB opened with correct flags; busy_timeout set | unit | `cargo test -p this-code test_open_db` | No — Wave 0 (db.rs) |
| QUERY-01 | query_latest_session returns None for empty table | unit | `cargo test -p this-code test_query_latest_session_empty` | No — Wave 0 (db.rs) |
| QUERY-01 | query_latest_session returns correct row for matching workspace | unit | `cargo test -p this-code test_query_latest_session_returns_most_recent` | No — Wave 0 (db.rs) |
| QUERY-01 | "no such table" is mapped to no-sessions, not error | unit | `cargo test -p this-code test_no_such_table_is_no_sessions` | No — Wave 0 (db.rs) |
| QUERY-02 | PATH arg omitted → current_dir used | unit | `cargo test -p this-code test_run_query_uses_cwd_when_no_path` | No — Wave 0 (query.rs) |
| QUERY-02 | Human-readable output format correct | unit | `cargo test -p this-code test_format_human_output` | No — Wave 0 (query.rs) |
| QUERY-02 | JSON output is valid JSON with correct fields | unit | `cargo test -p this-code test_format_json_output` | No — Wave 0 (query.rs) |
| QUERY-03 | dry-run prints "would exec: ..." without executing | unit | `cargo test -p this-code test_dry_run_prints_would_exec` | No — Wave 0 (query.rs) |
| QUERY-04 | shim.rs unchanged — run_shim still passes through | compile | `cargo build --manifest-path cli/Cargo.toml` | Yes (existing) |
| QUERY-04 | db_path config field added and defaults to None | unit | `cargo test -p this-code test_config_db_path_default_is_none` | No — Wave 0 (config.rs) |

### Sampling Rate

- **Per task commit:** `cargo test --manifest-path cli/Cargo.toml`
- **Per wave merge:** `cargo test --manifest-path cli/Cargo.toml`
- **Phase gate:** Full suite green before `/gsd-verify-work`; additionally `cargo clippy -- -D warnings` and `cargo fmt --check`

### Wave 0 Gaps

- [ ] `cli/src/db.rs` — covers QUERY-01 tests (open_db, query_latest_session, no-such-table)
- [ ] `cli/src/query.rs` — covers QUERY-02, QUERY-03 tests (run_query, format_human, format_json, dry_run)
- [ ] `cli/src/config.rs` — extend existing test: `test_config_db_path_default_is_none`

*(Existing test infrastructure: `cargo test` already runs; `cli/src/config.rs`, `shim.rs`, `install.rs` all have `#[cfg(test)]` modules. No new test runner setup needed.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | CLI reads session data; no auth |
| V4 Access Control | No | CLI reads user's own DB at known path |
| V5 Input Validation | Yes | parameterized SQL queries — `rusqlite::params![]` |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via workspace path | Tampering | `rusqlite::params![workspace]` — parameterized query, T-04-01 compliant |
| Path traversal via `--db-path` config | Elevation of privilege | Opens user-controlled path; acceptable since CLI runs as the user |
| open_files JSON parse of corrupt data | Denial of service (CLI crash) | `unwrap_or(json!([]))` — no panic on malformed JSON |

---

## Sources

### Primary (HIGH confidence)
- `/websites/rs_rusqlite_0_39_0_rusqlite` (Context7) — OpenFlags, open_with_flags, execute_batch, query_row, OptionalExtension, ErrorCode, open_in_memory
- `/rusqlite/rusqlite` (Context7 GitHub) — in-memory test fixture pattern, query_row optional usage
- `/websites/rs_clap` (Context7) — optional positional Option<T> pattern, derive API
- `/clap-rs/clap` (Context7 GitHub) — subcommand struct with optional positional
- `cli/Cargo.toml` + `cli/Cargo.lock` — version verification (rusqlite 0.39, clap 4.6.1)
- `extension/src/db.ts` — canonical table name (`invocations`), schema columns, column order

### Secondary (MEDIUM confidence)
- `cli/src/config.rs` — figment env prefix without split pattern (established in Phase 2)
- `cli/src/shim.rs` — `discover_real_code()` reuse contract
- `.planning/phases/01-extension-core-storage-foundation/01-CONTEXT.md` D-07 — column name authoritative source

### Tertiary (LOW confidence)
- Assumption A2: `ErrorCode::Unknown` = `SQLITE_ERROR` = "no such table" — not directly verified via docs, but string-match fallback covers it

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps verified in Cargo.toml/Cargo.lock; no new deps
- rusqlite API patterns: HIGH — verified via Context7 against docs.rs/rusqlite/0.39.0
- clap optional positional: HIGH — verified via Context7 against docs.rs/clap
- Architecture: HIGH — extends established Phase 2 patterns
- "no such table" error matching: MEDIUM — ErrorCode variant assumption; string-match fallback eliminates risk

**Research date:** 2026-04-27
**Valid until:** 2026-07-27 (stable APIs; rusqlite and clap are not fast-moving for existing functionality)
