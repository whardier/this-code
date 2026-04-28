---
phase: 04-this-code-which-subcommand
created: 2026-04-28
status: ready_to_execute
---

# Phase 4 Context: this-code which subcommand

## Goal

Add `this-code which [PATH]` — answers "what binary would launch for this path?" without
displaying full session data. Separate concern from `query --dry-run`, which answers
"what would query execute?" and includes session details.

## Separation of Concerns

| Command                  | Question answered                        | Shows session data? |
| ------------------------ | ---------------------------------------- | ------------------- |
| `query [PATH]`           | What session exists for this directory?  | Yes (full session)  |
| `query [PATH] --dry-run` | What would query execute?                | Implicit            |
| `which [PATH]`           | What binary would launch?                | No (binary only + matched workspace) |

## Requirements (New — WHICH-01 through WHICH-04)

- **WHICH-01**: `this-code which [PATH]` prints the real `code` binary path that would be used
- **WHICH-02**: When a session exists for the given PATH (via ancestry walk), `which` also prints the matched workspace path
- **WHICH-03**: `which` without a PATH argument uses the current directory as default
- **WHICH-04**: `--json` flag outputs machine-readable JSON `{"binary": "...", "workspace": "..."|null}`

## Existing Code to Reuse

| Symbol | Location | Used for |
| ------ | -------- | -------- |
| `discover_real_code(config, own_bin_dir)` | `shim.rs:34` | Binary path discovery (D-04 priority chain) |
| `find_session_by_ancestry(conn, start)` | `query.rs:80` | Ancestry walk for workspace match — needs `pub(crate)` |
| `db::open_db(path)` | `db.rs:24` | Open sessions.db |
| `Config`, `load_config()` | `config.rs` | Config struct passed through |
| `BaseDirs::new()` | via `directories` crate | Home dir resolution for own_bin_dir + db_path |

## New Files

- `cli/src/which.rs` — `pub(crate) fn run_which(config, path, json)`

## Modified Files

- `cli/src/cli.rs` — add `Which { path: Option<PathBuf>, json: bool }` to `Commands`
- `cli/src/main.rs` — add `mod which;` + `Commands::Which` arm
- `cli/src/query.rs` — make `find_session_by_ancestry` `pub(crate)`

## No New Dependencies

All required crates already in Cargo.toml: `anyhow`, `serde_json`, `directories`,
`rusqlite`, `which` (the crate), `tracing`.

## Key Design Decisions

- **Session lookup is optional** — `which` always prints the binary path; missing DB or no
  session is a graceful exit 0, not an error. The binary discovery is the primary contract.
- **Ancestry walk reused from query** — same D-06 pattern (canonicalize with fallback,
  walk up to root). `find_session_by_ancestry` is promoted to `pub(crate)` in query.rs.
- **Exit 0 for all no-session cases** — absent DB, no-such-table, no matching row all
  produce a binary-only line (no workspace line), not an error exit.
- **`--json` null for missing workspace** — JSON output always has `"binary"` key; `"workspace"`
  is `null` when no session found.
- **No `--dry-run` flag** — `which` is already inherently non-executing. No recursion guard
  or exec needed.

## Output Format
