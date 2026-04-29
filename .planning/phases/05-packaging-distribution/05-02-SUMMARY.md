---
phase: 05-packaging-distribution
plan: 02
subsystem: infra
tags: [github-actions, xvfb, vscode-test, ci, integration-tests]

requires:
  - phase: 01-extension-core-storage-foundation
    provides: extension test suite (@vscode/test-cli, .vscode-test.js, extension.test.ts)
provides:
  - Xvfb-based VS Code integration tests running on every push/PR (Linux + macOS)
  - Removal of Phase 1 deferral — integration tests are no longer deferred
affects:
  - 05-03 (ext-release.yml uses identical xvfb-run pattern for test gate; D-12)

tech-stack:
  added: []
  patterns:
    - "Conditional Xvfb: runner.os == 'Linux' uses xvfb-run -a npm test; runner.os != 'Linux' uses npm test directly"

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "Two separate conditional steps (Linux + macOS) rather than one step with inline conditional — matches official VS Code CI documentation pattern (RESEARCH.md Pattern 2)"
  - "Integration tests inserted after Build extension bundle and before Verify manifest — satisfies D-11 ordering"

patterns-established:
  - "Pattern: xvfb-run -a npm test conditional on runner.os == 'Linux'; npm test on runner.os != 'Linux' — reuse this pattern verbatim in ext-release.yml"

requirements-completed:
  - PKG-04

duration: 1min
completed: 2026-04-29
---

# Phase 05 Plan 02: CI Integration Tests Summary

**Xvfb-conditional VS Code integration tests added to ci.yml — Linux uses `xvfb-run -a npm test`, macOS uses `npm test` directly, both running after build and before manifest verify on every push/PR**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-29T20:01:52Z
- **Completed:** 2026-04-29T20:02:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added two conditional integration test steps to `.github/workflows/ci.yml` after "Build extension bundle" and before "Verify manifest"
- Linux runner uses `xvfb-run -a npm test` (virtual framebuffer required — no display server on CI)
- macOS runner uses `npm test` directly (GUI session available by default)
- Removed the Phase 1 deferral comment block (lines 69-73 of original file) — integration tests are no longer deferred

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Xvfb integration test steps to ci.yml** - `420a229` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `.github/workflows/ci.yml` - Added two conditional test steps (Linux Xvfb + macOS direct); removed deferral comment

## Decisions Made

Two separate conditional steps (rather than one step with shell conditional) matches the official VS Code continuous integration documentation pattern exactly and makes the intent clear in the GitHub Actions UI — each runner sees its named step with the appropriate command.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ci.yml integration test pattern is proven and ready for reuse verbatim in `ext-release.yml` (Plan 05-03, D-12 gate)
- Integration tests gate the release workflow — `ext-release.yml` must declare `needs: [build-and-test]` and use the same xvfb-run pattern

---
*Phase: 05-packaging-distribution*
*Completed: 2026-04-29*
