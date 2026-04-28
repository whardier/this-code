---
phase: 04-this-code-which-subcommand
plan: "04-01"
subsystem: cli
tags: [rust, clap, rusqlite, sqlite, which, session-store]

requires:
  - phase: 03-rust-cli-query
    provides: find_session_by_ancestry, db::open_db, shim::discover_real_code, Config

provides:
  - "this-code which [PATH] subcommand — prints real code binary path and matched workspace"
  - "pub(crate) find_session_by_ancestry in query.rs (reusable across modules)"

affects:
  - 04-this-code-which-subcommand
  - future CLI phases that need session-aware binary resolution

tech-stack:
  added: [tempfile = "3" (dev-dependency)]
  patterns:
    - "Graceful DB fallback: DB-not-found and no-such-table are both silent None returns, not errors"
    - "lookup_workspace isolates error swallowing so run_which propagates real errors (binary discovery)"

key-files:
  created:
    - cli/src/which.rs
  modified:
    - cli/src/cli.rs
    - cli/src/main.rs
    - cli/src/query.rs
    - cli/Cargo.toml
    - cli/Cargo.lock

key-decisions:
  - "find_session_by_ancestry promoted to pub(crate) — shared query layer concern, not query-command-specific"
  - "lookup_workspace swallows all DB errors at debug level — which is a convenience command; binary path is the primary contract"
  - "tempfile is dev-only — no release binary impact"

patterns-established:
  - "Session-optional commands: binary discovery is hard-required (propagates errors); session lookup is best-effort (returns None)"

requirements-completed: [WHICH-01, WHICH-02, WHICH-03, WHICH-04]

duration: 15min
completed: 2026-04-28
---

# Phase 04 Plan 01: which subcommand — handler + CLI wiring Summary

**`this-code which [PATH]` subcommand printing real code binary path via discover_real_code and optional matched workspace via ancestry walk over the SQLite session store**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-28T16:30:00Z
- **Completed:** 2026-04-28T16:44:56Z
- **Tasks:** 7
- **Files modified:** 6 (5 modified + 1 created)

## Accomplishments

- Created `cli/src/which.rs` with `run_which` (human and JSON output) and `lookup_workspace` (graceful DB fallback)
- Promoted `find_session_by_ancestry` to `pub(crate)` in `query.rs` for cross-module reuse
- Wired `Commands::Which` variant into `cli.rs` and `main.rs`
- Added `tempfile = "3"` dev-dependency; 3 new unit tests in `which.rs` including a full integration test with a real on-disk SQLite DB
- All 23 tests pass, `cargo clippy -- -D warnings` clean

## Task Commits

All tasks landed in a single feature commit (plan specified single commit):

1. **Tasks 1-7: all which subcommand work** — `aa072c5` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `/Users/spencersr/src/github/whardier/which-code/cli/src/which.rs` — new module: run_which, lookup_workspace, 3 unit tests
- `/Users/spencersr/src/github/whardier/which-code/cli/src/cli.rs` — added Which variant to Commands enum
- `/Users/spencersr/src/github/whardier/which-code/cli/src/main.rs` — added `mod which;` and Commands::Which arm
- `/Users/spencersr/src/github/whardier/which-code/cli/src/query.rs` — promoted find_session_by_ancestry to pub(crate); fixed redundant closure lint
- `/Users/spencersr/src/github/whardier/which-code/cli/Cargo.toml` — added [dev-dependencies] tempfile = "3"
- `/Users/spencersr/src/github/whardier/which-code/cli/Cargo.lock` — updated with tempfile and transitive deps

## Decisions Made

- `find_session_by_ancestry` promoted to `pub(crate)` — it is a pure DB query-layer operation; keeping it private to `query.rs` would force code duplication in `which.rs`
- `lookup_workspace` intentionally swallows all DB errors at `tracing::debug!` level — the `which` command's primary contract is binary path resolution; workspace lookup is opportunistic
- `tempfile` added as dev-only dependency — the third test (`test_lookup_workspace_with_explicit_db_path`) requires a real on-disk SQLite file to exercise `db::open_db` + WAL path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed redundant closure clippy lint in query.rs**
- **Found during:** Task 6 (cargo clippy run)
- **Issue:** `search.parent().map(|p| p.to_path_buf())` triggered `clippy::redundant_closure_for_method_calls` (pedantic, `-D warnings` active)
- **Fix:** Changed to `search.parent().map(std::path::Path::to_path_buf)`
- **Files modified:** `cli/src/query.rs` line 89
- **Verification:** `cargo clippy -- -D warnings` passes with no output
- **Committed in:** `aa072c5` (feat commit)

**2. [Rule 1 - Bug] Removed unused import in which.rs test**
- **Found during:** Task 6 (`cargo test` warning pass)
- **Issue:** `use std::path::PathBuf;` in `test_lookup_workspace_with_explicit_db_path` was unused after `db_path` type was inferred
- **Fix:** Removed the unused import line
- **Files modified:** `cli/src/which.rs`
- **Verification:** `cargo test` produces zero warnings
- **Committed in:** `aa072c5` (feat commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — pre-existing lint + test warning in task scope)
**Impact on plan:** Both fixes are correctness/cleanliness requirements under the active `clippy::pedantic -D warnings` configuration. No scope creep.

## Issues Encountered

None beyond the two auto-fixed clippy/warning items above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `this-code which` is fully wired and tested
- `find_session_by_ancestry` is now `pub(crate)` and available to any future CLI module needing ancestry-based session lookup
- No blockers

---
*Phase: 04-this-code-which-subcommand*
*Completed: 2026-04-28*
