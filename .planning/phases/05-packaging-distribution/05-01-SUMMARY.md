---
phase: 05-packaging-distribution
plan: "01"
subsystem: extension
tags: [cli-detection, notifications, testability, vscode-api]
dependency_graph:
  requires: []
  provides:
    - extension/src/cliDetect.ts (checkCliPresence export)
    - extension/src/extension.ts (CLI detection wired in activate)
    - extension/src/test/extension.test.ts (PKG-03 suites)
  affects:
    - extension activation flow (non-blocking CLI check added)
tech_stack:
  added: []
  patterns:
    - injectable-path parameter for testability (storage.ts pattern)
    - fire-and-forget async with .catch(() => {}) (existing extension.ts pattern)
    - source-read assertions in tests (existing extension.test.ts pattern)
key_files:
  created:
    - extension/src/cliDetect.ts
  modified:
    - extension/src/extension.ts
    - extension/src/test/extension.test.ts
decisions:
  - EXPECTED_CLI_MAJOR=0 hardcoded constant in cliDetect.ts (not package.json field) — simplest approach, no runtime JSON parsing dependency
  - checkCliPresence accepts optional cliPath for testability — mirrors scanExistingRemoteSessions(db, binDir?) pattern from storage.ts
  - execFile timeout=3000ms — prevents CLI version check from hanging extension activation (Pitfall 5)
metrics:
  duration: "108s"
  completed: "2026-04-29"
  tasks: 3
  files: 3
---

# Phase 05 Plan 01: CLI Detection Module Summary

Non-blocking CLI detection module for the This Code extension — checks for `~/.this-code/bin/this-code` at activation and notifies users via VS Code information/warning notifications if the binary is missing or version-incompatible.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create cliDetect.ts | 70efe91 | extension/src/cliDetect.ts (created) |
| 2 | Integrate into extension.ts | 8fa1337 | extension/src/extension.ts (modified) |
| 3 | Add PKG-03 test suites | ea70d07 | extension/src/test/extension.test.ts (modified) |

## What Was Built

`extension/src/cliDetect.ts` — new module exporting `checkCliPresence(cliPath?: string): Promise<void>`:

- **Phase 1 (existence check):** `fs.access(cliPath)` — if absent, shows `showInformationMessage` with "Download" button that opens `https://github.com/whardier/this-code/releases` via `vscode.env.openExternal`
- **Phase 2 (version check):** `execFileAsync(cliPath, ["--version"], { timeout: 3000 })` — parses major version with regex `/(\d+)\.\d+\.\d+/`, shows `showWarningMessage` if major differs from `EXPECTED_CLI_MAJOR=0`
- Both catch blocks surface notifications but never throw — non-blocking contract (D-04)
- `DEFAULT_CLI_PATH = ~/.this-code/bin/this-code` as the default, injectable for tests

`extension/src/extension.ts` — two-line addition:
- Import: `import { checkCliPresence } from "./cliDetect";`
- Fire-and-forget call after `scanExistingRemoteSessions`: `checkCliPresence().catch(() => {});`

`extension/src/test/extension.test.ts` — 3 new PKG-03 suites (6 tests):
- `PKG-03: CLI detection module` — export check, Promise return check
- `PKG-03: CLI detection — missing binary path` — doesNotReject with absent path
- `PKG-03: CLI detection — source contract` — EXPECTED_CLI_MAJOR, fs.access, timeout, fire-and-forget pattern

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-05-05 (DoS via execFile hang) | `{ timeout: 3000 }` on execFileAsync | Implemented |
| T-05-01 (Tampering via version output) | Regex parse only, never eval'd | Implemented |
| T-05-02 (CLI path traversal) | Hardcoded DEFAULT_CLI_PATH constant | Implemented |

## Known Stubs

None — all logic is fully wired. The "Download" button opens the releases URL; the version check is live against the real binary.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings beyond what the plan's threat model covers.

## Self-Check: PASSED

- [x] extension/src/cliDetect.ts exists
- [x] extension/src/extension.ts contains `import { checkCliPresence } from "./cliDetect";`
- [x] extension/src/extension.ts contains `checkCliPresence().catch(() => {});`
- [x] extension/src/test/extension.test.ts contains 3 PKG-03 suites
- [x] `npx tsc --noEmit` exits 0
- [x] Commits 70efe91, 8fa1337, ea70d07 exist in git log
