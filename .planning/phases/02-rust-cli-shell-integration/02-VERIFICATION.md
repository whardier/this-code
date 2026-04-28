---
phase: 02-rust-cli-shell-integration
verified: 2026-04-27T20:35:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
overrides:
  - must_have: "CLI provides `this-code init bash`, `this-code init zsh`, and `this-code init fish` subcommands (SHELL-01)"
    reason: "SHELL-01's init <shell> design was superseded by D-03 in 02-CONTEXT.md before planning began. The consolidated install [--fish] interface satisfies the same intent (shell PATH integration) and is documented as authoritative in 02-CONTEXT.md D-03. REQUIREMENTS.md marks SHELL-01 Complete."
    accepted_by: "gsd-verifier"
    accepted_at: "2026-04-27T20:35:00Z"
human_verification:
  - test: "Run 'code' shim against a real VS Code installation to verify pass-through without infinite recursion"
    expected: "VS Code opens normally; no recursive shim invocation; THIS_CODE_ACTIVE=1 is present in the process environment when code.exe/code runs"
    why_human: "Cannot exec real code binary in CI/verification context without a VS Code installation; requires a live environment with code on PATH"
  - test: "Open a new terminal on macOS with zsh after running 'this-code install', source ~/.zshrc (which sources ~/.this-code/env), then run 'which code'"
    expected: "Output is ~/.this-code/bin/code — confirming the shim stays leftmost in PATH even after macOS path_helper runs in /etc/zprofile"
    why_human: "Requires a live macOS+zsh terminal session to confirm the path_helper ordering behavior described in SHELL-03"
  - test: "Invoke ~/.this-code/bin/code (the symlink) directly with THIS_CODE_ACTIVE=1 to confirm D-05 recursion guard fast-path"
    expected: "The binary discovers the real code binary via D-04 and exec's it exactly once; no re-entry into the guard path"
    why_human: "Requires a real code binary on PATH; exec replaces the process so automated testing of the post-exec state is not possible without a wrapper"
---

# Phase 2: Rust CLI + Shell Integration Verification Report

**Phase Goal:** Deliver a functional Rust CLI binary (`this-code`) that intercepts `code` invocations, guards against recursion, and installs shell integration — all with CI coverage on macOS and Linux.
**Verified:** 2026-04-27T20:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `cargo build` succeeds in the cli/ directory | VERIFIED | `cargo build` exits 0, produces `target/debug/this-code` |
| 2 | `cargo clippy --all-targets -- -D warnings` produces zero warnings or errors | VERIFIED | `cargo clippy` exits 0 with zero diagnostics confirmed |
| 3 | `cargo fmt --check` passes with no reformatting needed | VERIFIED | `cargo fmt --check` exits 0 with no output |
| 4 | `this-code --help` prints usage including the `install` subcommand | VERIFIED | Help shows `install` subcommand, no `init` subcommand (D-03 compliant) |
| 5 | `this-code --version` prints `this-code 0.1.0` | VERIFIED | Binary prints `this-code 0.1.0` |
| 6 | Tracing subscriber initializes and respects `RUST_LOG` env var | VERIFIED | `RUST_LOG=debug ./this-code --help` emits debug log lines to stderr |
| 7 | `load_config()` returns `Config { code_path: None }` when no env var or config file | VERIFIED | Unit test `test_config_default_is_all_none` passes; `cargo test` 9/9 green |
| 8 | `THIS_CODE_ACTIVE=1` env var triggers fast-path recursion guard | VERIFIED | `is_recursion_guard_active()` uses `is_ok_and(|v| v == "1")`; unit test compiles and passes |
| 9 | PATH stripping removes `~/.this-code/bin` from PATH before `which_in` | VERIFIED | Unit tests: `test_strip_own_bin_removes_entry`, `test_strip_own_bin_idempotent`, `test_strip_own_bin_leaves_others_untouched` — all pass |
| 10 | `this-code install` creates `~/.this-code/bin/` and `~/.this-code/env` with THIS_CODE_HOME case-colon guard | VERIFIED | `~/.this-code/env` exists, starts with `#!/bin/sh`, contains `THIS_CODE_HOME` and case-colon guard |
| 11 | `this-code install` creates `~/.this-code/bin/code` symlink pointing to `this-code` (relative) | VERIFIED | `readlink ~/.this-code/bin/code` returns `this-code` |
| 12 | `this-code install` is idempotent (second run exits 0) | VERIFIED | Two consecutive `install` runs both exit 0; symlink removed and re-created |
| 13 | `this-code install --fish` creates `~/.config/fish/conf.d/this-code.fish` with `fish_add_path --prepend` | VERIFIED | Fish file exists with `fish_add_path --prepend "$HOME/.this-code/bin"` |
| 14 | CI workflow runs on ubuntu-latest and macos-latest with all four cargo steps | VERIFIED | `.github/workflows/cli-ci.yml` is valid YAML; both OS targets present; `fail-fast: false`; all 4 cargo steps have `working-directory: cli` |

**Score:** 14/14 truths verified

### SHELL-01 Override Applied

SHELL-01 requires `this-code init bash|zsh|fish` subcommands. This implementation uses `this-code install [--fish]` instead (D-03 supersession documented in `02-CONTEXT.md` before any plans were written). The override above documents this as accepted. REQUIREMENTS.md marks SHELL-01 Complete. The functional intent — shell PATH integration for bash/zsh and fish — is satisfied.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `cli/Cargo.toml` | Crate definition, name = "this-code", 10 deps | VERIFIED | name="this-code", edition="2024", all 10 deps at correct versions, lint blocks present |
| `cli/clippy.toml` | MSRV configuration | VERIFIED | `msrv = "1.85.0"` |
| `cli/src/main.rs` | Entry point: tracing init, argv[0] detection, dispatch | VERIFIED | All modules declared; load_config before parse; shim arm calls run_shim; install arm calls run_install |
| `cli/src/cli.rs` | Cli struct and Commands enum | VERIFIED | `pub(crate) Cli` with `Option<Commands>`; `Commands::Install { fish: bool }` |
| `cli/src/config.rs` | Config struct and load_config() | VERIFIED | `pub(crate) Config { code_path: Option<PathBuf> }`; figment merge without .split(); unit test passes |
| `cli/src/shim.rs` | run_shim(), recursion guard, PATH stripping, exec | VERIFIED | All four functions implemented; Unix exec via CommandExt::exec(); Windows fallback under #[cfg(windows)]; THIS_CODE_ACTIVE set via .env() |
| `cli/src/install.rs` | run_install(fish: bool) | VERIFIED | POSIX sh env file with THIS_CODE_HOME; relative symlink; fish conf.d; idempotent; 4 unit tests pass |
| `.github/workflows/cli-ci.yml` | CI for Rust CLI on macOS and Linux | VERIFIED | Valid YAML; ubuntu-latest + macos-latest; fail-fast: false; 4 steps with working-directory: cli; no windows-latest |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `cli/src/main.rs` | `cli/src/cli.rs` | `mod cli; use cli::{Cli, Commands}; Cli::parse()` | WIRED | Pattern `Cli::parse()` present at line 37 |
| `cli/src/main.rs` | `cli/src/config.rs` | `mod config; use config::load_config; load_config()?` | WIRED | `load_config()?` at line 19; before shim detection |
| `cli/src/main.rs` | `cli/src/shim.rs` | `mod shim; shim::run_shim(&config)` | WIRED | `shim::run_shim(&config)` at line 34 in shim arm |
| `cli/src/main.rs` | `cli/src/install.rs` | `mod install; install::run_install(fish)` | WIRED | `install::run_install(fish)` at line 40 in Install arm |
| `cli/src/shim.rs` | `cli/src/config.rs` | `config.code_path` consumed in `discover_real_code` | WIRED | `if let Some(ref p) = config.code_path` at shim.rs:42 |
| `cli/src/shim.rs` | `which::which_in` | PATH stripping + `which_in("code", stripped, cwd)` | WIRED | `which::which_in("code", ...)` at shim.rs:53 |
| `.github/workflows/cli-ci.yml` | `cli/Cargo.toml` | `working-directory: cli` on all cargo steps | WIRED | All 4 steps verified with working-directory: cli |
| `~/.this-code/env` | `~/.this-code/bin` via THIS_CODE_HOME | `case ":${PATH}:" ... export PATH="${THIS_CODE_HOME}/bin:${PATH}"` | WIRED | env file contains THIS_CODE_HOME case-colon pattern |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a CLI binary and CI workflow, not components that render dynamic data from a data source.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Binary builds and runs | `cargo build` | Exits 0, binary produced | PASS |
| `--help` shows install subcommand | `./this-code --help \| grep install` | "install" present; "init" absent | PASS |
| `--version` prints correct version | `./this-code --version` | `this-code 0.1.0` | PASS |
| All 9 unit tests pass | `cargo test` | 9/9 passed (config, install, shim tests) | PASS |
| RUST_LOG respected | `RUST_LOG=debug ./this-code --help 2>&1` | Debug log line emitted before help output | PASS |
| install creates artifacts | `./this-code install` | Exits 0; env file written; symlink created | PASS |
| install idempotent | `./this-code install` twice | Both exit 0; no errors on second run | PASS |
| install --fish creates fish file | `./this-code install --fish` | fish.conf.d/this-code.fish with fish_add_path | PASS |
| PATH prepend works | `. ~/.this-code/env && which code` | `/Users/spencersr/.this-code/bin/code` | PASS |
| CI YAML is valid | `python3 yaml.safe_load(...)` | `YAML valid` | PASS |
| End-to-end shim with real code binary | Requires real `code` on PATH | Not tested in isolation | SKIP (human) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CLI-01 | 02-02 | CLI command name is `this-code`; installable as `code` shim via symlink | SATISFIED | Binary named `this-code`; `~/.this-code/bin/code` symlink created by install |
| CLI-02 | 02-01 | Single Rust binary using clap 4.6 + figment 0.10 + rusqlite 0.39 (bundled) | SATISFIED | Cargo.toml confirms all three deps at correct versions |
| CLI-03 | 02-04 | CLI intercepts `code` when leftmost in PATH | SATISFIED | argv[0] detection in main.rs; shim installed leftmost via env file; `which code` resolves to shim |
| CLI-04 | 02-04 | Self-detects recursion (env var guard + PATH stripping) | SATISFIED | `is_recursion_guard_active()` + `strip_own_bin_from_path()` in shim.rs; THIS_CODE_ACTIVE set on child via .env() |
| CLI-05 | 02-03, 02-04 | Finds real `code` by removing own dir from PATH + `which` | SATISFIED | D-04 chain: THIS_CODE_CODE_PATH → config.code_path → PATH strip + which_in |
| CLI-06 | 02-05 | Installs into `~/.this-code/bin/` | SATISFIED | `run_install()` creates `~/.this-code/bin/` and places symlink there |
| SHELL-01 | 02-05 (D-03) | Shell integration subcommands (superseded by D-03) | SATISFIED (override) | `this-code install [--fish]` provides equivalent shell integration; D-03 in 02-CONTEXT.md is authoritative |
| SHELL-02 | 02-05 | Shell integration adds `~/.this-code/bin/` leftmost in PATH | SATISFIED | ENV_FILE_CONTENT case-colon guard prepends `${THIS_CODE_HOME}/bin`; fish uses `fish_add_path --prepend` |
| SHELL-03 | 02-05 | zsh PATH set in `~/.zshrc` (not `~/.zshenv`) | SATISFIED | Install instructions print "add to ~/.bashrc or ~/.zshrc"; ENV_FILE_CONTENT docstring explains macOS path_helper ordering |
| SHELL-04 | 02-05 | fish integration uses `fish_add_path` (not `eval`) | SATISFIED | FISH_FILE_CONTENT uses `fish_add_path --prepend`; unit test asserts no `eval` or `set -gx` |
| PLAT-02 | 02-04, 02-06 | Windows best-effort | SATISFIED | `#[cfg(windows)]` fallback in shim.rs uses `Command::status()` + `process::exit()`; Windows symlink in install.rs with clear error; no Windows CI (deferred to Phase 4 per plan) |

### Anti-Patterns Found

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `cli/src/config.rs:18` | `#[allow(dead_code)]` on `code_path` | Info | Stale annotation — `code_path` is consumed in shim.rs. Clippy still passes because field IS used. Harmless but could be cleaned up. |

No blockers or warnings. The dead_code allow is a minor code hygiene issue, not a functional problem.

### Human Verification Required

#### 1. End-to-End Shim Pass-Through

**Test:** On a machine with VS Code installed (`code` on PATH), run `this-code install`, source `~/.this-code/env`, then run `code .` from a directory.
**Expected:** VS Code opens the directory normally. No infinite recursion. `THIS_CODE_ACTIVE=1` is visible in child process environment (check via `RUST_LOG=debug code . 2>&1 | head -5`).
**Why human:** Cannot exec real `code` binary in an automated verification context without a VS Code installation. The exec() call replaces the process, so standard output capture after exec is not possible without a wrapper process.

#### 2. macOS zsh Path Ordering After path_helper

**Test:** On macOS with zsh, add `. "$HOME/.this-code/env"` to `~/.zshrc`. Open a new terminal and run `which code` and `echo $PATH`.
**Expected:** `which code` returns `/Users/<user>/.this-code/bin/code`. The `~/.this-code/bin` segment appears before `/usr/local/bin` or any Homebrew path in `$PATH`, confirming that sourcing from `~/.zshrc` (which runs after `/etc/zprofile` and its `path_helper`) keeps the shim leftmost.
**Why human:** Requires a live interactive macOS+zsh terminal to confirm the `/etc/zprofile` → `path_helper` → `~/.zshrc` ordering. The env file content is correct; the shell session ordering is what needs confirmation.

#### 3. Recursion Guard End-to-End

**Test:** With `THIS_CODE_ACTIVE=1` exported in the environment, run `code .` via the symlink at `~/.this-code/bin/code`.
**Expected:** The shim executes once; the real `code` binary opens VS Code. No second shim invocation. The debug log (if `RUST_LOG=debug`) shows `"recursion guard active — fast path to real code binary"` and then exec's the real binary.
**Why human:** Confirming the guard fires and the exec chain terminates requires a real `code` binary; process replacement via exec() means the shim process exits before it can report success.

### Gaps Summary

No functional gaps were found. All 14 observable truths were verified against the codebase. All 6 source files are substantive and fully wired. The 3 human verification items are behavioral checks requiring a live VS Code installation — they cannot be confirmed programmatically.

The SHELL-01 deviation (init subcommand design superseded by install approach) is covered by the override documented above. This was an intentional design decision made in the context phase (D-03) before execution began, not a gap in implementation.

The one minor code hygiene item (`#[allow(dead_code)]` on `config.code_path`) is informational — clippy passes cleanly because the field is consumed in shim.rs.

---

_Verified: 2026-04-27T20:35:00Z_
_Verifier: Claude (gsd-verifier)_
