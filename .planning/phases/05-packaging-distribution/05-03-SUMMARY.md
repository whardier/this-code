---
phase: 05-packaging-distribution
plan: "03"
subsystem: packaging-distribution
tags:
  - github-actions
  - release-workflow
  - vsix
  - cli-binary
  - marketplace
dependency_graph:
  requires:
    - 05-01 (CLI detection module — ext-release.yml tests gate on cliDetect.ts)
    - 05-02 (Xvfb integration test pattern — used verbatim in ext-release.yml)
  provides:
    - ext-release.yml — extension release workflow gated on integration tests
    - cli-release.yml — CLI binary release workflow
    - RELEASE.md — manual Marketplace pre-release publish guide
  affects:
    - .github/workflows/ (two new release workflows)
    - repository root (RELEASE.md)
tech_stack:
  added:
    - softprops/action-gh-release@v2 (GitHub Release asset upload)
    - actions/download-artifact@v4 with merge-multiple (artifact aggregation)
  patterns:
    - Multi-runner matrix with collect-and-release aggregation job
    - Tag-scoped workflow triggers (ext/v* and cli/v*)
    - Rust strip + rename pattern for CLI binary release artifacts
key_files:
  created:
    - .github/workflows/ext-release.yml
    - .github/workflows/cli-release.yml
    - RELEASE.md
  modified: []
decisions:
  - "macos-15-large chosen over deprecated macos-13 for darwin-x64 native runner (Pitfall 2 mitigation)"
  - "No vsce publish step in CI — D-10 mandates manual publish for Phase 5"
  - "cli-release.yml drops clippy/rustfmt components from dtolnay/rust-toolchain — CI-only tools not needed for release builds"
  - "Version extracted from tag via shell parameter expansion: ext/v0.1.0 -> 0.1.0"
  - "Artifact name prefixes (vsix-*, cli-*) prevent upload collision across matrix jobs"
metrics:
  duration: "1min"
  completed_date: "2026-04-29"
  tasks_completed: 3
  files_created: 3
  files_modified: 0
---

# Phase 05 Plan 03: Release Workflows and Marketplace Guide Summary

Two GitHub Actions release workflows and a manual Marketplace publish guide, gating extension releases on 4-platform integration tests and building stripped CLI binaries via native runners.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create ext-release.yml — extension release workflow | f2deff5 | .github/workflows/ext-release.yml |
| 2 | Create cli-release.yml — CLI release workflow | bc7f598 | .github/workflows/cli-release.yml |
| 3 | Create RELEASE.md — Marketplace publish guide | 43ea9cd | RELEASE.md |

## What Was Built

**ext-release.yml** triggers on `ext/v*` tags and runs a 4-platform matrix (`ubuntu-latest`, `ubuntu-24.04-arm`, `macos-latest`, `macos-15-large`). Each runner installs deps, typechecks, builds with `build:prod` (minified), runs integration tests (Xvfb on Linux), packages a platform VSIX with `npx @vscode/vsce package --target`, and uploads as a named artifact. A downstream `release` job (`needs: [build-and-test]`) aggregates all 4 VSIXes and creates a GitHub Release via `softprops/action-gh-release@v2`.

**cli-release.yml** triggers on `cli/v*` tags and follows the same 4-runner matrix. Each runner installs Rust stable (without clippy/rustfmt — release-only), caches Cargo artifacts, runs `cargo build --release`, strips debug symbols via `strip`, renames the binary with a platform suffix, and uploads as an artifact. A `release-cli` job (`needs: [build-cli]`) aggregates and publishes to a GitHub Release.

**RELEASE.md** at the repository root documents the end-to-end manual Marketplace publish process: tag push, VSIX download, `vsce login`, four `vsce publish --pre-release --packagePath` commands (one per platform), and the CLI binary download procedure. Includes a note about the mandatory `--pre-release` flag and the `macos-15-large` / `macos-15-intel` runner caveat.

## Decisions Made

- **macos-15-large for darwin-x64:** `macos-13` was deprecated December 2025 (RESEARCH.md Pitfall 2). `macos-15-large` is the current replacement used in both workflows.
- **No automated Marketplace publish (D-10):** Neither workflow contains a `vsce publish` step. PAT storage deferred to a future phase.
- **No clippy/rustfmt in cli-release.yml:** These components are CI-only linting tools. The release workflow only needs the compiler, not static analysis.
- **Version extraction via shell parameter expansion:** `${VERSION#ext/v}` strips the `ext/v` prefix so `ext/v0.1.0` becomes `0.1.0` in the VSIX filename — no external tooling needed.
- **Artifact naming with type prefix:** `vsix-${{ matrix.target }}` and `cli-${{ matrix.target }}` prevent `upload-artifact` name collisions across concurrent matrix jobs (RESEARCH.md Pitfall 6).

## Deviations from Plan

None — plan executed exactly as written. The exact workflow YAML specified in the plan was used without modification. The `macos-15-large` runner (replacing deprecated `macos-13`) was pre-resolved in the plan based on RESEARCH.md findings.

## Threat Flags

None. The workflows introduce a `contents: write` permission on the release aggregation jobs — this is expected and documented in the plan's threat model (T-05-03: GitHub Release asset substitution, accepted disposition). No new unanticipated trust boundaries introduced.

## Known Stubs

None. All files are complete workflow configurations; no placeholder or deferred content.

## Self-Check: PASSED

- .github/workflows/ext-release.yml: exists, YAML valid, all acceptance criteria met
- .github/workflows/cli-release.yml: exists, YAML valid, all acceptance criteria met
- RELEASE.md: exists, contains all required content
- Commits f2deff5, bc7f598, 43ea9cd: verified in git log
