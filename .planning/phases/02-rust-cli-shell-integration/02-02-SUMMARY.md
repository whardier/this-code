---
phase: 02-rust-cli-shell-integration
plan: "02"
subsystem: cli
tags: [rust, clap, tracing, tracing-subscriber, anyhow, argv0, shim-detection]

# Dependency graph
requires:
  - phase: 02-01
    provides: Rust binary crate at cli/ with all 10 dependencies in Cargo.toml
provides:
  - cli/src/cli.rs with pub(crate) Cli (Parser) and Commands (Subcommand) clap types
  - cli/src/main.rs with tracing init (RUST_LOG / stderr), argv[0] shim detection, and subcommand dispatch
  - this-code --help listing install subcommand (no init — D-03 compliant)
  - this-code --version printing 0.1.0 from Cargo.toml
  - Commands::Install { fish: bool } stub arm (real impl in 02-05)
  - Shim pass-through stub arm gated by argv[0] == "code" (real impl in 02-04)
affects: [02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added:
    - "clap 4.6 derive API (Parser + Subcommand) — activated from scaffold"
    - "tracing-subscriber 0.3 with EnvFilter (from_default_env, writing to stderr)"
    - "anyhow::Result<()> as main() return type"
  patterns:
    - "pub(crate) visibility on clap types (not pub) to satisfy unreachable-pub lint"
    - "is_some_and() instead of map().unwrap_or(false) per clippy::map_unwrap_or"
    - "argv[0] shim detection via std::env::args().next() (not current_exe — Linux resolves symlinks)"
    - "Shim detection before Cli::parse() to prevent 'code install' routing to Install arm"
    - "tracing::debug! on all stub paths for observability under RUST_LOG=debug"

key-files:
  created:
    - cli/src/cli.rs
  modified:
    - cli/src/main.rs

key-decisions:
  - "pub(crate) on Cli and Commands — unreachable-pub lint fires on pub in single-crate binary; pub(crate) is correct visibility"
  - "is_some_and() replaces map().unwrap_or(false) — clippy::map_unwrap_or fires under pedantic; is_some_and is the idiomatic form"
  - "drop(fish) replaced with let _ = fish — drop() on Copy type is a no-op; let _ correctly suppresses unused warning"
  - "cargo fmt collapses multi-line with_env_filter to single line and reorders imports — applied automatically"
  - "Shim detection before Cli::parse() — prevents 'code install' matching Install arm when invoked as shim"

patterns-established:
  - "Pattern 3: Shim detection via argv[0] — std::env::args().next().is_some_and(|a| Path::new(&a).file_name().is_some_and(|n| n == target))"
  - "Pattern 4: Stub arms use tracing::debug! for visibility — no eprintln! or todo!() in stubs"

requirements-completed:
  - CLI-01

# Metrics
duration: 2min
completed: "2026-04-27"
---

# Phase 02 Plan 02: clap CLI Structure + Tracing Init Summary

**clap Cli/Commands derive types and tracing-subscriber init wired into main.rs — this-code --help lists install, --version prints 0.1.0, clippy pedantic passes clean.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-27T19:55:13Z
- **Completed:** 2026-04-27T19:57:xxZ
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `cli/src/cli.rs` with `pub(crate) Cli` (clap Parser) and `pub(crate) Commands` (clap Subcommand) types
- Replaced skeleton `main.rs` with full entry point: tracing-subscriber init, argv[0] shim detection, and dispatch on `cli.command`
- `Commands::Install { fish: bool }` stub arm defers to Plan 02-05 with `tracing::debug!` log
- Shim stub arm (argv[0] == "code") defers to Plan 02-04 with `tracing::debug!` log
- All five cargo checks pass: build, clippy -D warnings, fmt --check, `--help` output, `--version` output

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cli/src/cli.rs with clap Cli and Commands** - `1ea7049` (feat)
2. **Task 2: Wire clap dispatch and tracing init into main.rs** - `cbc8b52` (feat)

## Files Created/Modified
- `cli/src/cli.rs` — `pub(crate) Cli` with `Option<Commands>` subcommand field; `pub(crate) Commands::Install { fish: bool }`
- `cli/src/main.rs` — tracing-subscriber init to stderr, argv[0] shim detection before parse, Cli::parse() dispatch, help-on-None fallback

## Decisions Made
- `pub(crate)` visibility on clap types: `unreachable_pub` lint (from Cargo.toml `[lints.rust]`) fires on `pub` items not reachable from crate root as external API. Single-binary crates have no external consumers, so `pub(crate)` is correct.
- `is_some_and()` over `.map().unwrap_or(false)`: clippy::map_unwrap_or fires under pedantic; `is_some_and` is the idiomatic and more efficient form.
- `let _ = fish` over `drop(fish)`: `bool` is `Copy`, so `drop()` is a no-op and rustc warns. `let _ = fish` correctly suppresses the unused variable warning.
- Shim detection before `Cli::parse()`: ensures that `code install` passes through rather than matching the `Install` arm — required by D-06 pass-through behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed three clippy pedantic violations in generated code**
- **Found during:** Task 2 (main.rs replacement + verification)
- **Issue:** Plan-provided code had three clippy issues that would fail `-D warnings`: (a) `drop(fish)` on `Copy` type, (b) `pub` on `Cli`/`Commands` triggering `unreachable_pub`, (c) `.map().unwrap_or(false)` triggering `map_unwrap_or`
- **Fix:** Changed `pub` to `pub(crate)` in cli.rs; changed `drop(fish)` to `let _ = fish` and `.map().unwrap_or(false)` to `.is_some_and()` in main.rs
- **Files modified:** `cli/src/cli.rs`, `cli/src/main.rs`
- **Verification:** `cargo clippy --all-targets -- -D warnings` exits 0 with zero diagnostics
- **Committed in:** `cbc8b52` (Task 2 commit)

**2. [Rule 1 - Bug] Applied cargo fmt to fix import order and whitespace**
- **Found during:** Task 2 verification (`cargo fmt --check`)
- **Issue:** `cargo fmt` reordered `use clap::Parser as _` before `use cli::{Cli, Commands}`, collapsed multi-line `with_env_filter(...)` to single line, and reformatted `is_some_and` closure
- **Fix:** Ran `cargo fmt` and committed formatted files
- **Files modified:** `cli/src/main.rs`
- **Verification:** `cargo fmt --check` exits 0
- **Committed in:** `cbc8b52` (Task 2 commit, files formatted before commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in plan-provided code that prevented clippy/fmt verification from passing)
**Impact on plan:** All fixes required for success criteria compliance. No scope creep; no new functionality added.

## Known Stubs
- `cli/src/main.rs:28` — `tracing::debug!("shim mode: invoked as 'code' (stub)")` — intentional per plan; real shim exec in Plan 02-04
- `cli/src/main.rs:37` — `tracing::debug!(fish, "install subcommand invoked (stub)")` — intentional per plan; real install in Plan 02-05

These stubs do not prevent plan 02-02's goal: establishing the CLI contract with `--help`, `--version`, and recognized subcommands.

## Issues Encountered
Clippy pedantic mode caught three issues in the plan-provided code (drop on Copy, unreachable pub, map_unwrap_or). All resolved on first attempt. No build failures.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `cli/src/cli.rs` exports `Cli` and `Commands` for Plans 02-04 and 02-05 to implement stub arms
- `cli/src/main.rs` dispatch structure is ready; 02-03 adds figment config reading before the dispatch
- Pedantic clippy baseline maintained at zero warnings
- No blockers for 02-03 (figment config)

---
*Phase: 02-rust-cli-shell-integration*
*Completed: 2026-04-27*
