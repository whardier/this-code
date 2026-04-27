---
phase: 02-rust-cli-shell-integration
plan: "03"
subsystem: cli
tags: [rust, figment, toml, serde, directories, config, anyhow]

# Dependency graph
requires:
  - phase: 02-01
    provides: Rust binary crate at cli/ with figment, serde, directories in Cargo.toml
  - phase: 02-02
    provides: cli/src/main.rs with tracing init, argv[0] shim detection, and clap dispatch
provides:
  - cli/src/config.rs with pub(crate) Config { code_path: Option<PathBuf> } and pub(crate) load_config()
  - figment merge: ~/.this-code/config.toml first, THIS_CODE_* env vars second
  - Missing config.toml silently falls back to Config::default() (no error)
  - load_config() called in main() before shim detection and Cli::parse()
  - Config reference passed into Install stub and shim stub arms
affects: [02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added:
    - "figment 0.10 (toml + env features) — activated from scaffold for config loading"
    - "directories 6 BaseDirs::new() — home dir resolution for config file path"
    - "serde Deserialize — derive macro on Config struct for figment extraction"
  patterns:
    - "pub(crate) visibility on Config and load_config (unreachable_pub lint, same as cli.rs)"
    - "#[allow(dead_code)] on code_path field — field consumed in Plans 02-04/02-05, not yet read"
    - "Env::prefixed without .split() — THIS_CODE_CODE_PATH lowercased to code_path directly"
    - ".unwrap_or_default() on figment extract — silently accepts missing/malformed config"
    - "tracing::debug!(?config) after load — config logged at debug level only (T-02-03-03)"

key-files:
  created:
    - cli/src/config.rs
  modified:
    - cli/src/main.rs

key-decisions:
  - "pub(crate) on Config and load_config — unreachable_pub fires on pub in single-binary crate; matches pattern from 02-02"
  - "#[allow(dead_code)] on code_path — lint fires because field is not yet consumed; will be removed when 02-04 reads it"
  - "Shim detection preserved BEFORE Cli::parse() — plan's provided code moved it after parse (unsafe for D-06); kept early-return pattern from 02-02"
  - "Env::prefixed without .split('_') — adding split maps CODE_PATH to nested code.path key, silently breaking override (per D-07 and STATE.md decision)"
  - ".unwrap_or_default() on figment extract — missing config.toml returns Config::default() rather than an error"

patterns-established:
  - "Pattern 5: figment merge order — Toml::file first (silent on absent), Env::prefixed second (env wins)"
  - "Pattern 6: config loaded before CLI parse — load_config()? fires before Cli::parse() so all subcommands see config"

requirements-completed:
  - CLI-05

# Metrics
duration: 3min
completed: "2026-04-27"
---

# Phase 02 Plan 03: figment Config Infrastructure Summary

**figment-based Config struct with code_path: Option<PathBuf> and load_config() merging ~/.this-code/config.toml with THIS_CODE_* env vars — wired into main.rs before shim detection and clap dispatch.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-27T20:00:49Z
- **Completed:** 2026-04-27T20:04:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `cli/src/config.rs` with `pub(crate) Config { code_path: Option<PathBuf> }` and `pub(crate) load_config()`
- figment merge order: `~/.this-code/config.toml` first (absent = silent), `THIS_CODE_*` env vars second (override wins)
- `Env::prefixed("THIS_CODE_")` without `.split("_")` maps `THIS_CODE_CODE_PATH` → `code_path` correctly
- Updated `main.rs` with `mod config`, `use config::load_config`, and `load_config()?` before shim detection
- All four checks pass: `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `--help` with `THIS_CODE_CODE_PATH` set

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cli/src/config.rs with Config struct and load_config()** - `09fe912` (test/feat — TDD RED+GREEN combined)
2. **Task 2: Wire load_config() into main.rs dispatch** - `c465214` (feat)

## Files Created/Modified
- `cli/src/config.rs` — `pub(crate) Config` with `code_path: Option<PathBuf>`; `pub(crate) load_config()` using figment; `test_config_default_is_all_none` unit test
- `cli/src/main.rs` — Added `mod config`, `use config::load_config`, `load_config()?` call before shim detection, `let _ = &config` in stub arms

## Decisions Made
- `pub(crate)` on `Config` and `load_config`: `unreachable_pub` lint (from Cargo.toml `[lints.rust]`) fires on `pub` items in a single-binary crate. Same fix pattern as Plan 02-02's cli.rs.
- `#[allow(dead_code)]` on `code_path` field: dead_code lint fires because no code path currently reads the field. This is intentional — the field is consumed in Plans 02-04 (shim exec) and 02-05 (install). Allow added with comment explaining the deferral.
- Shim detection preserved BEFORE `Cli::parse()`: The plan's provided `main.rs` moved `invoked_as_code` computation to after `Cli::parse()`, using a `None if invoked_as_code` match guard. This would allow `code install` to match the `Install` arm instead of passing through (violating D-06). Kept the 02-02 early-return pattern — shim detected before parse, returning `Ok(())` immediately.
- `cargo fmt` reordered provider imports in `config.rs` (`Figment` before `providers::{...}`). Applied and committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pub visibility to pub(crate) on Config and load_config**
- **Found during:** Task 1 (clippy verification)
- **Issue:** Plan-provided code used `pub` on `Config` and `load_config`, triggering `unreachable_pub` lint under `-D warnings`
- **Fix:** Changed `pub` → `pub(crate)` on both items; matches the 02-02 pattern for cli.rs
- **Files modified:** `cli/src/config.rs`
- **Verification:** `cargo clippy --all-targets -- -D warnings` exits 0
- **Committed in:** `09fe912` (Task 1 commit)

**2. [Rule 1 - Bug] Added #[allow(dead_code)] on code_path field**
- **Found during:** Task 2 (clippy verification with main.rs wired)
- **Issue:** `dead_code` lint fires on `code_path` field because no code currently reads it (only stored); required suppression for zero-warnings baseline
- **Fix:** Added `#[allow(dead_code)]` with explanatory comment (field used in 02-04/02-05)
- **Files modified:** `cli/src/config.rs`
- **Verification:** `cargo clippy --all-targets -- -D warnings` exits 0
- **Committed in:** `c465214` (Task 2 commit, config.rs re-formatted by cargo fmt)

**3. [Rule 1 - Bug] Preserved shim detection BEFORE Cli::parse()**
- **Found during:** Task 2 (reviewing plan-provided main.rs against 02-02 decision log)
- **Issue:** Plan's provided `main.rs` computed `invoked_as_code` after `Cli::parse()` using a `None if invoked_as_code` match guard — this would cause `code install` to route to the `Install` arm instead of the shim arm, violating D-06 pass-through requirement
- **Fix:** Kept the existing 02-02 structure: compute `invoked_as_code` before parse, `if invoked_as_code { return Ok(()); }` early return; added `load_config()?` call at the top
- **Files modified:** `cli/src/main.rs`
- **Verification:** Binary exits 0 when invoked with `THIS_CODE_CODE_PATH=/usr/bin/code ./this-code --help`
- **Committed in:** `c465214` (Task 2 commit)

**4. [Rule 1 - Bug] Applied cargo fmt to fix import order in config.rs**
- **Found during:** Task 2 verification (`cargo fmt --check`)
- **Issue:** `cargo fmt` reordered `providers::{Env, Format, Toml}` to appear after `Figment` in the figment import block
- **Fix:** Ran `cargo fmt` and verified `cargo fmt --check` exits 0
- **Files modified:** `cli/src/config.rs`
- **Committed in:** `c465214` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs in plan-provided code preventing clippy/fmt/correctness verification)
**Impact on plan:** All fixes required for success criteria compliance or correctness (D-06). No scope creep; no new functionality added.

## Known Stubs
- `cli/src/main.rs` shim arm — `tracing::debug!("shim mode: invoked as 'code' (stub)")` — intentional per plan; real shim exec in Plan 02-04
- `cli/src/main.rs` install arm — `tracing::debug!(fish, "install subcommand invoked (stub)")` — intentional per plan; real install in Plan 02-05
- `cli/src/config.rs code_path` — field populated by figment but not yet consumed; consumed in 02-04 (shim exec via D-04 discovery) and 02-05 (install)

These stubs do not prevent plan 02-03's goal: establishing the Config infrastructure contract with correct figment merge semantics.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced beyond what the threat model covers. `config.code_path` debug logging only fires under `RUST_LOG=debug` (T-02-03-03 mitigation confirmed — `tracing::debug!(?config)` in main.rs).

## Issues Encountered
- clippy pedantic mode caught `pub` visibility, `dead_code`, and import ordering issues in plan-provided code. All resolved on first attempt within the 3-minute execution window.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `cli/src/config.rs` exports `Config` and `load_config()` for Plans 02-04 and 02-05 to consume
- `Config.code_path` is the D-04 override check: Plans 02-04 reads it as step 1 of discovery
- Pedantic clippy baseline maintained at zero warnings
- No blockers for Wave 3 (02-04 shim + exec, 02-05 install command)

---
*Phase: 02-rust-cli-shell-integration*
*Completed: 2026-04-27*
