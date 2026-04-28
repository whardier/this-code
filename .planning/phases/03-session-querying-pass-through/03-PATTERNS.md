# Phase 3: Session Querying + Pass-Through — Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 5 (2 new, 3 modified)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `cli/src/db.rs` | service / data layer | CRUD (read) | `cli/src/shim.rs` — only existing module with external I/O + error propagation | role-partial |
| `cli/src/query.rs` | command handler | request-response | `cli/src/install.rs` — closest analog: `pub(crate) fn run_*(config) -> Result<()>` command handler | role-exact |
| `cli/src/main.rs` | entrypoint / dispatch | request-response | itself — add one arm to existing `match cli.command` | self-modify |
| `cli/src/cli.rs` | CLI definition | request-response | itself — add `Query` arm to `Commands` enum following `Install` pattern | self-modify |
| `cli/src/config.rs` | config struct + loader | request-response | itself — add `db_path` field following `code_path` field pattern | self-modify |

---

## Pattern Assignments

### `cli/src/db.rs` (NEW — service, CRUD read)

**Analog:** `cli/src/shim.rs` (closest for I/O + error propagation + `pub(crate)` API surface)
**Secondary analog:** `cli/src/install.rs` (BaseDirs resolution pattern)

**Imports pattern** — copy this exact import block as the file header:
```rust
use anyhow::Result;
use rusqlite::{Connection, OpenFlags, OptionalExtension as _};
use std::path::Path;
```

Note: `OptionalExtension as _` — the `as _` suppresses the unused-import warning since only the `.optional()` method is used, not the trait name itself. This is the project's established pattern for trait imports where only methods are needed.

**Visibility pattern** — from `cli/src/shim.rs` lines 13, 21, 34, 74, 91, 105 and `cli/src/config.rs` lines 11–19:
```rust
// ALL public items use pub(crate), never pub.
// Cargo.toml [lints.rust] unreachable_pub = "warn" fires on bare pub in a single-binary crate.
pub(crate) struct Session { ... }
pub(crate) fn open_db(...) -> Result<Connection> { ... }
pub(crate) fn query_latest_session(...) -> Result<Option<Session>> { ... }
```

**BaseDirs / home_dir error pattern** — from `cli/src/install.rs` line 94 and `cli/src/shim.rs` line 107:
```rust
BaseDirs::new().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
```

**`#[allow(dead_code)]` placement rule** — from `cli/src/config.rs` lines 17–18:
```rust
// Add #[allow(dead_code)] to struct fields that are introduced before first use.
// Remove the annotation when the field is consumed.
// Place the allow directly above the field, NOT on the struct.
#[allow(dead_code)]
pub(crate) open_files: String,
```
The `Session` struct fields `remote_name`, `remote_server_path`, `server_bin_path`, and `local_ide_path` are not consumed in Phase 3 output; add `#[allow(dead_code)]` to those fields until a future phase uses them.

**`is_ok_and` / `is_some_and` clippy pedantic pattern** — from `cli/src/shim.rs` line 14 and `cli/src/main.rs` lines 27–31:
```rust
// Use is_ok_and() / is_some_and() — Clippy pedantic requires these over .map(|v| v == x).is_ok()
std::env::var("THIS_CODE_ACTIVE").is_ok_and(|v| v == "1")
```
Apply this pattern in any Option/Result predicate checks inside `db.rs` and `query.rs`.

**anyhow error propagation** — from `cli/src/install.rs` lines 1, 99, 104 and `cli/src/shim.rs` lines 2, 53–59, 84–86:
```rust
// All errors propagate via ? to the caller's Result<()> / Result<T>.
// Use anyhow::anyhow!("message") for new errors.
// Use .context("...") on existing errors to add context.
Err(anyhow::anyhow!("exec failed: {err}").context(format!(
    "Failed to exec real `code` binary at {}",
    real_code.display()
)))
```

**`#[cfg(test)]` module placement** — from `cli/src/shim.rs` lines 129–169, `cli/src/install.rs` lines 134–164, `cli/src/config.rs` lines 55–64:
```rust
// Tests go at the BOTTOM of the file, inside a single #[cfg(test)] mod tests { ... }.
// No separate test file — all tests in the module they test.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() { ... }
}
```

---

### `cli/src/query.rs` (NEW — command handler, request-response)

**Analog:** `cli/src/install.rs` (exact role match: `pub(crate) fn run_*(config) -> Result<()>` top-level command handler)

**Function signature pattern** — from `cli/src/install.rs` line 93:
```rust
// install.rs:
pub(crate) fn run_install(fish: bool) -> Result<()> {

// query.rs follows the same pattern, accepting config by reference and all CLI flags:
pub(crate) fn run_query(
    config: &Config,
    path: Option<std::path::PathBuf>,
    dry_run: bool,
    json: bool,
) -> Result<()> {
```

**Imports pattern** — model after `cli/src/install.rs` lines 1–3 and `cli/src/shim.rs` lines 1–7:
```rust
use crate::{config::Config, db, shim};
use anyhow::Result;
use directories::BaseDirs;
use serde_json::json;
use std::path::PathBuf;
```

**BaseDirs home_dir resolution** — from `cli/src/install.rs` line 94 and `cli/src/shim.rs` lines 107–110:
```rust
let base = BaseDirs::new().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
let home = base.home_dir();
let own_bin_dir = home.join(".this-code/bin");
```
For `db_path` default, use the `unwrap_or_else` fallback pattern (no `?` since `BaseDirs::new()` returns `Option`):
```rust
let db_path = config.db_path.clone().unwrap_or_else(|| {
    BaseDirs::new()
        .map(|b| b.home_dir().join(".this-code/sessions.db"))
        .unwrap_or_else(|| PathBuf::from(".this-code/sessions.db"))
});
```

**tracing::debug! pattern** — from `cli/src/install.rs` lines 56, 100, 106, 114 and `cli/src/shim.rs` lines 38, 42, 125:
```rust
// Use structured tracing macros, not eprintln!
tracing::debug!(path = %db_path.display(), "resolved db_path");
tracing::debug!(%workspace, "query workspace");
// %field = Display, ?field = Debug
```

**println! for user-facing output** — from `cli/src/install.rs` lines 121–130:
```rust
// All user-facing output goes to stdout via println!.
// Errors go via anyhow propagation (not eprintln!).
println!("no sessions found");
println!("{:<14} {}", "workspace:", session.workspace_path);
```

**early-return Ok(())** — from `cli/src/install.rs` (no early returns, but `cli/src/shim.rs` lines 118–121 shows the pattern):
```rust
if is_recursion_guard_active() {
    tracing::debug!("...");
    let real_code = discover_real_code(config, &own_bin_dir)?;
    return exec_real_code(&real_code, args);
}
// query.rs uses same early-return pattern:
if !db_path.exists() {
    println!("no sessions found");
    return Ok(());
}
```

**discover_real_code reuse** — from `cli/src/shim.rs` lines 34–60 (function signature and call in `run_shim` lines 119, 124):
```rust
// Do NOT duplicate discover_real_code() — call shim::discover_real_code(config, &own_bin_dir)
let real_code = shim::discover_real_code(config, &own_bin_dir)?;
println!("would exec: {} {}", real_code.display(), workspace);
return Ok(());
```

---

### `cli/src/main.rs` (MODIFY — add Query dispatch arm)

**Analog:** itself, lines 39–48

**Existing dispatch pattern** — `cli/src/main.rs` lines 39–48:
```rust
match cli.command {
    Some(Commands::Install { fish }) => install::run_install(fish),
    None => {
        use clap::CommandFactory as _;
        Cli::command().print_help()?;
        println!();
        Ok(())
    }
}
```

**New Query arm follows the Install arm's destructuring pattern exactly:**
```rust
match cli.command {
    Some(Commands::Query { path, dry_run, json }) => {
        query::run_query(&config, path, dry_run, json)
    }
    Some(Commands::Install { fish }) => install::run_install(fish),
    None => {
        use clap::CommandFactory as _;
        Cli::command().print_help()?;
        println!();
        Ok(())
    }
}
```

**Module declaration pattern** — `cli/src/main.rs` lines 1–4:
```rust
mod cli;
mod config;
mod install;
mod shim;
// Add: mod db; and mod query; following same order convention
mod db;
mod query;
```

**Config passed by reference** — `cli/src/main.rs` lines 19, 34:
```rust
let config = load_config()?;
// ...
return shim::run_shim(&config);  // reference, not move
// Query follows same pattern:
query::run_query(&config, path, dry_run, json)
```

---

### `cli/src/cli.rs` (MODIFY — add Query variant to Commands enum)

**Analog:** itself, lines 17–25

**Existing Install variant pattern** — `cli/src/cli.rs` lines 17–25:
```rust
#[derive(Subcommand)]
pub(crate) enum Commands {
    /// Install this-code shell integration (bash/zsh env file + code symlink).
    Install {
        /// Also write ~/.config/fish/conf.d/this-code.fish (idempotent).
        #[arg(long)]
        fish: bool,
    },
}
```

**New Query variant follows the exact same struct-variant style:**
```rust
#[derive(Subcommand)]
pub(crate) enum Commands {
    /// Show the last-known session for a workspace path.
    Query {
        /// Workspace path to look up (default: current directory).
        path: Option<std::path::PathBuf>,
        /// Print what would be executed without running it.
        #[arg(long)]
        dry_run: bool,
        /// Output as JSON instead of human-readable table.
        #[arg(long)]
        json: bool,
    },
    /// Install this-code shell integration (bash/zsh env file + code symlink).
    Install {
        /// Also write ~/.config/fish/conf.d/this-code.fish (idempotent).
        #[arg(long)]
        fish: bool,
    },
}
```

Key rules extracted from the existing pattern:
- `path: Option<PathBuf>` with NO `#[arg(...)]` annotation = optional positional. Clap derives `[PATH]` from the `Option` wrapper.
- `dry_run: bool` with `#[arg(long)]` = `--dry-run` flag. Clap converts snake_case to kebab-case automatically.
- `json: bool` with `#[arg(long)]` = `--json` flag.
- Variant doc comment on the `///` line above the variant name.
- Field doc comments on `///` lines above each field.

**PathBuf import** — `cli/src/cli.rs` currently has no use imports (bare `use clap::{Parser, Subcommand}`). Add `use std::path::PathBuf;` or use the full path `Option<std::path::PathBuf>` inline. Inline is acceptable for a single use.

---

### `cli/src/config.rs` (MODIFY — add db_path field)

**Analog:** itself, lines 11–19

**Existing code_path field pattern** — `cli/src/config.rs` lines 11–19:
```rust
#[derive(Deserialize, Default, Debug, Clone)]
pub(crate) struct Config {
    /// Explicit path to the real `code` binary.
    ///
    /// Set via `THIS_CODE_CODE_PATH` env var or `code_path` key in `~/.this-code/config.toml`.
    /// When `None`, the shim auto-discovers via PATH stripping + `which`.
    #[allow(dead_code)]
    pub(crate) code_path: Option<PathBuf>,
}
```

**New db_path field follows the identical pattern:**
```rust
#[derive(Deserialize, Default, Debug, Clone)]
pub(crate) struct Config {
    /// Explicit path to the real `code` binary.
    ///
    /// Set via `THIS_CODE_CODE_PATH` env var or `code_path` key in `~/.this-code/config.toml`.
    /// When `None`, the shim auto-discovers via PATH stripping + `which`.
    #[allow(dead_code)]
    pub(crate) code_path: Option<PathBuf>,

    /// Explicit path to the sessions SQLite database.
    ///
    /// Set via `THIS_CODE_DB_PATH` env var or `db_path` key in `~/.this-code/config.toml`.
    /// When `None`, defaults to `~/.this-code/sessions.db`.
    pub(crate) db_path: Option<PathBuf>,
}
```

**Critical rule** — from `cli/src/config.rs` lines 43–48 (the CRITICAL comment):
```rust
// Do NOT add .split("_") to Env::prefixed(...).
// THIS_CODE_DB_PATH → strip "THIS_CODE_" → "DB_PATH" → lowercase → "db_path"
// Adding .split("_") would map "DB_PATH" → "db.path" (nested key) — silently ignored.
.merge(Env::prefixed("THIS_CODE_"))
```

**`#[allow(dead_code)]` removal rule**: `code_path` is consumed in `shim.rs` (line 43: `if let Some(ref p) = config.code_path`). If the `#[allow(dead_code)]` annotation is still present on `code_path`, remove it when adding `db_path` — the field is no longer dead. `db_path` is consumed in `query.rs` immediately in Phase 3, so it does NOT need `#[allow(dead_code)]`.

**Existing test to extend** — `cli/src/config.rs` lines 58–63:
```rust
#[test]
fn test_config_default_is_all_none() {
    let config = Config::default();
    assert!(config.code_path.is_none());
    // Extend: add assertion for db_path
    assert!(config.db_path.is_none());
}
```

---

## Shared Patterns

### `pub(crate)` Visibility
**Source:** `cli/src/config.rs` line 11, `cli/src/shim.rs` lines 13, 21, 34, 74, 105, `cli/src/install.rs` line 93
**Apply to:** All new structs, functions, and impl blocks in `db.rs` and `query.rs`
```rust
// Every exported item uses pub(crate).
// bare pub fires unreachable_pub lint (Cargo.toml [lints.rust] unreachable_pub = "warn").
pub(crate) struct Session { ... }
pub(crate) fn open_db(...) -> Result<Connection> { ... }
pub(crate) fn query_latest_session(...) -> Result<Option<Session>> { ... }
pub(crate) fn run_query(...) -> Result<()> { ... }
```

### `anyhow::Result<()>` Return Type
**Source:** `cli/src/install.rs` line 93, `cli/src/shim.rs` lines 34, 74, 91, 105
**Apply to:** All top-level command handler functions (`run_query`), all I/O functions (`open_db`, `query_latest_session`)
```rust
use anyhow::Result;

pub(crate) fn run_query(...) -> Result<()> { ... }
pub(crate) fn open_db(path: &Path) -> Result<Connection> { ... }
pub(crate) fn query_latest_session(conn: &Connection, workspace: &str) -> Result<Option<Session>> { ... }
```

### `#[cfg(test)] mod tests` at File Bottom
**Source:** `cli/src/shim.rs` lines 129–169, `cli/src/install.rs` lines 134–164, `cli/src/config.rs` lines 55–64
**Apply to:** `cli/src/db.rs`, `cli/src/query.rs`, extended `cli/src/config.rs`
```rust
#[cfg(test)]
mod tests {
    use super::*;
    // imports needed only in test context
    #[test]
    fn test_name() { ... }
}
```

### tracing::debug! for Internal Logging
**Source:** `cli/src/shim.rs` lines 38, 42, 55, 125, `cli/src/install.rs` lines 56, 100, 106
**Apply to:** `db.rs` connection open, `query.rs` path resolution and execution path decisions
```rust
// Structured fields use % (Display) or ? (Debug)
tracing::debug!(path = %db_path.display(), "resolved db_path");
tracing::debug!(%workspace, "querying for session");
// Boolean / simple flags use the bare field name
tracing::debug!(dry_run, json, "query flags");
```

### `is_ok_and` / `is_some_and` (Clippy Pedantic)
**Source:** `cli/src/shim.rs` line 14, `cli/src/main.rs` line 29
**Apply to:** Any predicate on `Option` or `Result` in `db.rs` and `query.rs`
```rust
// Correct (clippy pedantic):
some_option.is_some_and(|v| v == expected)
some_result.is_ok_and(|v| v > 0)
// Not: some_option.map(|v| v == expected).unwrap_or(false)
```

### BaseDirs Home Resolution
**Source:** `cli/src/install.rs` line 94, `cli/src/shim.rs` lines 107–110
**Apply to:** `query.rs` for db_path default resolution and own_bin_dir for dry-run
```rust
let base = BaseDirs::new()
    .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
let home = base.home_dir();
```
When `?` is not available (inside a closure or `unwrap_or_else`), use `.map(|b| b.home_dir().join(...)).unwrap_or_else(|| PathBuf::from(...))`.

---

## No Analog Found

No files in this phase lack a codebase analog. All patterns are covered by the existing `install.rs`, `shim.rs`, and `config.rs` modules.

The rusqlite-specific patterns (`Connection::open_with_flags`, `OptionalExtension`, `execute_batch`) have no codebase analog (Phase 3 introduces the first DB access in the Rust crate). These are covered by the verified API patterns in `03-RESEARCH.md` §Critical API Verification items 1–4.

---

## Metadata

**Analog search scope:** `cli/src/` (all 4 existing source files read in full)
**Files scanned:** 6 (`main.rs`, `cli.rs`, `config.rs`, `install.rs`, `shim.rs`, `Cargo.toml`)
**Pattern extraction date:** 2026-04-27
**Lint configuration:** `[lints.rust] unreachable_pub = "warn"` and `[lints.clippy] pedantic = "warn"` — both active and enforced
