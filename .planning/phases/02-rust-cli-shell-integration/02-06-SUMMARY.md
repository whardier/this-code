---
phase: 02-rust-cli-shell-integration
plan: "06"
subsystem: ci
tags: [github-actions, rust, ci, matrix-build, cargo-cache]

# Dependency graph
requires:
  - phase: 02-05
    provides: cli/ crate fully implemented with install command (all cargo checks pass)
provides:
  - .github/workflows/cli-ci.yml — CI workflow for Rust CLI on ubuntu-latest and macos-latest
affects: []

# Tech tracking
tech-stack:
  added:
    - "dtolnay/rust-toolchain@stable — recommended action for Rust toolchain setup (preferred over unmaintained actions-rs/toolchain)"
    - "actions/cache@v4 — cargo registry + cli/target/ cache keyed by OS + Cargo.lock hash"
    - "actions/checkout@v4 — repo checkout"
  patterns:
    - "fail-fast: false — both platforms report independently; macOS failure does not cancel ubuntu job"
    - "path filter on cli/** — extension-only changes do not trigger CLI CI"
    - "steps ordered fmt -> clippy -> build -> test — fast failures first (format/lint cheaper than full build)"
    - "working-directory: cli on every cargo step — all cargo commands scoped to the CLI crate"

key-files:
  created:
    - .github/workflows/cli-ci.yml
  modified: []

key-decisions:
  - "GitHub Actions CI matrix on ubuntu-latest and macos-latest with fail-fast: false — both platforms verified independently on every push"
  - "No windows-latest: PLAT-02 is best-effort; Windows CI deferred to Phase 4"
  - "dtolnay/rust-toolchain@stable over actions-rs/toolchain — actions-rs is unmaintained"
  - "Separate cli-ci.yml file (not merged into ci.yml) — isolates extension CI from Rust CI; path filters keep them independent"

# Metrics
duration: 1min
completed: "2026-04-27"
---

# Phase 02 Plan 06: Rust CLI GitHub Actions CI Summary

**GitHub Actions workflow .github/workflows/cli-ci.yml with matrix build on ubuntu-latest and macos-latest: runs cargo fmt --check, clippy --all-targets -D warnings, build --release, and test with Cargo cache and path filter for cli/** changes only.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-27T20:22:22Z
- **Completed:** 2026-04-27T20:23:25Z
- **Tasks:** 1 (+ 1 checkpoint, self-verified in YOLO mode)
- **Files modified:** 1

## Accomplishments

- Created `.github/workflows/cli-ci.yml` as a separate workflow from the existing `ci.yml` (extension CI from Phase 1)
- Matrix: `ubuntu-latest` and `macos-latest` with `fail-fast: false`
- Rust toolchain via `dtolnay/rust-toolchain@stable` with `clippy` and `rustfmt` components
- Cargo cache via `actions/cache@v4`: caches `~/.cargo/registry/index/`, `~/.cargo/registry/cache/`, `~/.cargo/git/db/`, and `cli/target/` — keyed by `${{ runner.os }}-cargo-${{ hashFiles('cli/Cargo.lock') }}` with OS-level restore key
- Four cargo steps in order: `fmt --check`, `clippy --all-targets -- -D warnings`, `build --release`, `test` — all with `working-directory: cli`
- Path filter: workflow triggers only on `cli/**` or `.github/workflows/cli-ci.yml` changes; extension-only changes do not trigger CLI CI
- No `windows-latest` in matrix (PLAT-02 best-effort; Windows CI deferred to Phase 4)

## Checkpoint Self-Verification (YOLO mode)

All five criteria verified:
1. YAML parses cleanly — PASSED (`python3 yaml.safe_load` returned no error)
2. Contains `ubuntu-latest` and `macos-latest` — PASSED (grep confirmed both in matrix)
3. `fail-fast: false` present — PASSED (grep confirmed)
4. All four cargo steps use `working-directory: cli` — PASSED (4 occurrences confirmed)
5. No `windows-latest` entry — PASSED (grep returned 0 matches)

## Task Commits

1. **Task 1: Create cli-ci.yml** — `1e5aaeb` (feat)

## Files Created/Modified

- `.github/workflows/cli-ci.yml` — 59-line GitHub Actions workflow; separate from existing `ci.yml` (extension CI); triggers on `cli/**` path changes; matrix ubuntu+macos, fail-fast false, dtolnay toolchain, actions/cache@v4, four cargo steps all with working-directory: cli

## Decisions Made

- `dtolnay/rust-toolchain@stable`: Preferred over `actions-rs/toolchain` which is unmaintained. Installs stable Rust with clippy and rustfmt components in a single step.
- Separate file `cli-ci.yml` (not merged into `ci.yml`): Keeps extension CI and Rust CLI CI fully independent. Path filters ensure they trigger on different file sets.
- No Windows matrix entry: PLAT-02 is best-effort; Windows CI is deferred to Phase 4 per plan requirement.
- Cache key `${{ runner.os }}-cargo-${{ hashFiles('cli/Cargo.lock') }}`: Cargo.lock is committed (T-02-01-01 supply chain mitigation from Phase 02-01); keying on its hash ensures a clean cache on any dependency change. `cli/target/` caching avoids recompiling rusqlite's bundled SQLite on every run.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the CI workflow is complete and standalone.

## Threat Flags

No new network endpoints or auth paths introduced. The workflow adds two trust boundaries:
- GitHub Actions runner → crates.io: accepted (standard Cargo dependency resolution)
- CI cache → runner: accepted per plan threat model T-02-06-01 (cache scoped to repo, keyed by Cargo.lock hash)

Supply chain threat T-02-06-02 is mitigated: `Cargo.lock` commits all transitive dependency checksums; Cargo verifies on download.

## Self-Check

Files exist:
- `.github/workflows/cli-ci.yml` — FOUND

Commits exist:
- `1e5aaeb` — FOUND (Task 1: add cli-ci.yml)

## Self-Check: PASSED

---
*Phase: 02-rust-cli-shell-integration*
*Completed: 2026-04-27*
