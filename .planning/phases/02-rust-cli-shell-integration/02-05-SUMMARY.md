---
phase: 02-rust-cli-shell-integration
plan: "05"
subsystem: cli
tags: [rust, install, shell-integration, symlink, fish, posix-sh, directories, anyhow]

# Dependency graph
requires:
  - phase: 02-02
    provides: cli/src/main.rs with tracing init, argv[0] shim detection, and clap dispatch
  - phase: 02-03
    provides: cli/src/config.rs with pub(crate) Config and pub(crate) load_config()
  - phase: 02-04
    provides: cli/src/shim.rs with run_shim() and shim arm wired in main.rs
provides:
  - cli/src/install.rs with run_install(fish: bool) -> anyhow::Result<()>
  - ~/.this-code/env — POSIX sh PATH prepend script with THIS_CODE_HOME case-colon guard
  - ~/.this-code/bin/code — symlink pointing to relative target "this-code"
  - ~/.config/fish/conf.d/this-code.fish — fish_add_path --prepend (when --fish flag used)
  - main.rs Install arm wired to install::run_install(fish) (stub removed)
affects: [02-06]

# Tech tracking
tech-stack:
  added:
    - "directories 6 BaseDirs::new() — home dir resolution for artifact placement (already present from 02-04; now used in install.rs)"
  patterns:
    - "pub(crate) on run_install — unreachable_pub lint compliance, consistent with all prior modules"
    - "const ENV_FILE_CONTENT / FISH_FILE_CONTENT — static file content with no user input interpolated (T-02-05-01 tamper mitigation)"
    - "symlink_metadata().is_ok() before remove_file — handles both live and broken symlinks for idempotency"
    - "std::os::unix::fs::symlink(target, link) — relative target 'this-code'; #[cfg(unix)]/#[cfg(windows)] split"
    - "create_dir_all for ~/.this-code/bin and ~/.config/fish/conf.d — idempotent directory creation"

key-files:
  created:
    - cli/src/install.rs
  modified:
    - cli/src/main.rs

key-decisions:
  - "pub(crate) on run_install — unreachable_pub lint (same fix pattern as 02-02, 02-03, 02-04)"
  - "THIS_CODE_HOME env var name (not WHICH_CODE_HOME) — project renamed from which-code to this-code; documented in ENV_FILE_CONTENT const docstring"
  - "Instructions mention ~/.zshrc not ~/.zshenv — SHELL-03 requirement; macOS path_helper in /etc/zprofile runs after ~/.zshenv and would reorder PATH"
  - "Relative symlink target 'this-code' — both code and this-code live in same bin dir; relative is robust to home dir moves"
  - "symlink_metadata().is_ok() for idempotency check — exists() returns false for broken symlinks; symlink_metadata() returns Ok for both live and broken"

# Metrics
duration: 3min
completed: "2026-04-27"
---

# Phase 02 Plan 05: Install Command Summary

**run_install(fish: bool) creates ~/.this-code/env (POSIX sh THIS_CODE_HOME case-colon guard), ~/.this-code/bin/code symlink, and optionally ~/.config/fish/conf.d/this-code.fish (fish_add_path --prepend); idempotent and wired into main.rs Install arm.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-27T20:15:02Z
- **Completed:** 2026-04-27T20:18:45Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `cli/src/install.rs` with `pub(crate) run_install(fish: bool) -> Result<()>`
- `ENV_FILE_CONTENT`: POSIX sh with `#!/bin/sh`, `THIS_CODE_HOME` variable, case-colon PATH guard prepending `${THIS_CODE_HOME}/bin` — satisfies SHELL-01 (D-03), SHELL-02, SHELL-03
- `FISH_FILE_CONTENT`: `fish_add_path --prepend "$HOME/.this-code/bin"` — fish 3.2+ idempotent dedup; no `eval` or `set -gx`
- `create_code_symlink()`: `std::os::unix::fs::symlink("this-code", bin_dir/code)` — relative target, same-dir; `symlink_metadata().is_ok()` handles broken symlinks for idempotency
- Windows `#[cfg(windows)]` path: `symlink_file` with clear Developer Mode error message (PLAT-02/T-02-05-03)
- `run_install(false)` and `run_install(true)` both idempotent: env file overwritten, symlink removed then re-created on every run
- Install instructions print `~/.bashrc or ~/.zshrc` (not `~/.zshenv`) — SHELL-03 satisfied
- Replaced stub Install arm in `main.rs` with `install::run_install(fish)` — CLI-06 requirement satisfied
- All four cargo checks pass: `cargo build --release`, `cargo test` (9/9), `cargo clippy --all-targets -- -D warnings` (zero diagnostics), `cargo fmt --check`

## Integration Verification Results

1. `./target/release/this-code install` — exits 0, prints installation path and `~/.zshrc` instructions
2. Second `./target/release/this-code install` — exits 0 (idempotent)
3. `~/.this-code/env` — starts with `#!/bin/sh`, contains `THIS_CODE_HOME`, contains case-colon guard
4. `~/.this-code/bin/code` — symlink; `readlink` returns `this-code` (relative)
5. `./target/release/this-code install --fish` — creates `~/.config/fish/conf.d/this-code.fish` with `fish_add_path --prepend`
6. `(. ~/.this-code/env && which code)` — returns `/Users/spencersr/.this-code/bin/code` (success criterion 2 confirmed after placing binary in bin dir)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cli/src/install.rs with run_install()** — `a61582c` (feat)
2. **Task 2: Wire run_install() into main.rs Install arm + integration verify** — `257a444` (feat)

## Files Created/Modified

- `cli/src/install.rs` — Full install implementation: `ENV_FILE_CONTENT` (POSIX sh), `FISH_FILE_CONTENT`, `create_code_symlink()` (Unix + Windows platform split), `run_install(fish: bool)`; 4 unit tests for content constants
- `cli/src/main.rs` — Replaced stub Install arm with `install::run_install(fish)`; `mod install;` added in Task 1

## Decisions Made

- `pub(crate)` on `run_install`: `unreachable_pub` lint fires on `pub` in a single-binary crate. Consistent pattern across all modules (cli.rs, config.rs, shim.rs, install.rs).
- `THIS_CODE_HOME` variable name: Project renamed from which-code to this-code; env var follows the new name. Documented in const docstring and install instructions.
- Instructions reference `~/.zshrc` not `~/.zshenv`: SHELL-03 requirement. macOS `path_helper` in `/etc/zprofile` runs after `~/.zshenv` and would reorder PATH, defeating the prepend. `~/.zshrc` runs after `/etc/zprofile`, so `THIS_CODE_HOME/bin` stays leftmost.
- Relative symlink target `"this-code"`: Both `code` and `this-code` live in the same `~/.this-code/bin/` directory; a relative target is robust to home directory path changes.
- `symlink_metadata().is_ok()` for idempotency: `Path::exists()` returns `false` for broken symlinks (dangling), so it cannot detect an existing broken symlink. `symlink_metadata()` returns `Ok` for both live and broken symlinks, enabling clean removal before recreation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed doc_markdown clippy errors in install.rs**
- **Found during:** Task 2 (clippy verification)
- **Issue:** Plan-provided doc comment used bare identifiers `THIS_CODE_HOME`, `WHICH_CODE_HOME`, and `path_helper` without backticks — `clippy::doc_markdown` (pedantic) fires with `-D warnings`
- **Fix:** Added backticks: `` `THIS_CODE_HOME` ``, `` `WHICH_CODE_HOME` ``, `` `path_helper` `` in the `ENV_FILE_CONTENT` const docstring
- **Files modified:** `cli/src/install.rs`
- **Verification:** `cargo clippy --all-targets -- -D warnings` exits 0
- **Committed in:** `257a444` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed rustfmt line-wrap for BaseDirs::new().ok_or_else()**
- **Found during:** Task 2 (cargo fmt --check)
- **Issue:** Plan-provided code had `BaseDirs::new()` and `.ok_or_else(...)` on separate lines — rustfmt collapses them to one line when they fit within the line width limit
- **Fix:** `let base = BaseDirs::new().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;` on one line
- **Files modified:** `cli/src/install.rs`
- **Verification:** `cargo fmt --check` exits 0
- **Committed in:** `257a444` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — plan-provided code triggering clippy pedantic and rustfmt under zero-warnings enforcement)
**Impact on plan:** Both fixes required for all-checks-pass baseline. No scope creep; no new functionality added.

## Known Stubs

None — all install functionality is fully implemented and wired. The plan's Install stub in main.rs has been replaced with the real `install::run_install(fish)` call.

## Threat Flags

No new network endpoints introduced. Filesystem writes are to user-owned home directory paths only. All threat model items from the plan are mitigated:
- T-02-05-01 (env file tamper): accepted — static content, no user input interpolated
- T-02-05-02 (symlink target): mitigated — hardcoded relative target `"this-code"`, remove+recreate pattern applied
- T-02-05-03 (Windows symlink failure): mitigated — explicit error message with Developer Mode instructions, no silent fallback

## Self-Check

Files exist:
- `cli/src/install.rs` — FOUND
- `cli/src/main.rs` — FOUND (Install arm wired)

Commits exist:
- `a61582c` — FOUND (Task 1: create install.rs)
- `257a444` — FOUND (Task 2: wire Install arm)

## Self-Check: PASSED

---
*Phase: 02-rust-cli-shell-integration*
*Completed: 2026-04-27*
