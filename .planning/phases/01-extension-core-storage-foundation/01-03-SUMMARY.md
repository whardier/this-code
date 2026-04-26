---
phase: "01-extension-core-storage-foundation"
plan: "03"
subsystem: "session-metadata"
tags: ["typescript", "vscode-extension", "session", "json", "crypto", "tdd"]
dependency_graph:
  requires:
    - phase: "01-extension-core-storage-foundation"
      plan: "01"
      provides: "SessionMetadata interface + stubs in session.ts and storage.ts"
  provides:
    - "collectSessionMetadata() full implementation reading vscode.env.appRoot, remoteName, globalStorageUri"
    - "getSessionJsonPath() SSH path (D-05) and local path (D-04)"
    - "writeSessionJson() with schema_version:1, recorded_at, open_files:[] and mkdir recursive"
    - "STOR-01, STOR-05, TRACK-01, TRACK-02, TRACK-03 test stubs replaced with real assertions"
  affects:
    - "01-04 (document event handlers write to path returned by getSessionJsonPath)"
    - "01-05 (scanExistingRemoteSessions reads JSON files written by writeSessionJson)"
    - "01-06 (activate() calls collectSessionMetadata + writeSessionJson)"
tech_stack:
  added:
    - "node:crypto (SHA-256 for deriveLocalSessionHash)"
    - "node:os (homedir resolution)"
    - "node:path (cross-platform path construction)"
    - "node:fs/promises (async mkdir + writeFile)"
  patterns:
    - "extractCommitHash: /^[0-9a-f]{40}$/i validates hash before use in path (T-03-01)"
    - "extractProfileFromGlobalStorageUri: null fallback on any parse failure (D-01)"
    - "deriveLocalSessionHash: SHA-256(appRoot).slice(0,16) — stable 16-char local ID"
    - "writeSessionJson: mkdir({recursive:true}) then writeFile — idempotent directory creation"
    - "TDD RED/GREEN cycle: failing tests committed before implementation"
key_files:
  created: []
  modified:
    - "extension/src/session.ts"
    - "extension/src/storage.ts"
    - "extension/src/test/extension.test.ts"
decisions:
  - "Private helpers (extractCommitHash, extractProfileFromGlobalStorageUri, extractUserDataDirFromGlobalStorageUri, deriveLocalSessionHash, extractServerBinPath) not exported — tested indirectly via getSessionJsonPath and writeSessionJson observable outputs"
  - "open_files: [] written as empty array at activation — document event handlers (Plan 04) update SQLite; JSON file is a snapshot not continuously updated"
  - "schema_version: 1 field in JSON enables future CLI format detection without parsing all fields"
  - "recorded_at (not invoked_at) used in JSON file — invoked_at is the SQLite column name per D-07; the JSON file uses recorded_at as it is a separate format"
metrics:
  duration_seconds: 196
  completed_date: "2026-04-26"
  tasks_completed: 2
  files_created: 0
  files_modified: 3
---

# Phase 01 Plan 03: Session Metadata + JSON Persistence Summary

**Full implementations of collectSessionMetadata(), getSessionJsonPath(), and writeSessionJson() — session capture and per-instance JSON persistence layer — with five test stubs replaced by real assertions via TDD RED/GREEN cycle.**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests for session helpers | ca07800 | extension/src/test/extension.test.ts |
| 1 (GREEN) | Implement collectSessionMetadata() and getSessionJsonPath() | fe90dd5 | extension/src/session.ts |
| 2 | Implement writeSessionJson() and replace 5 test stubs | 77f81d3 | extension/src/storage.ts, extension/src/test/extension.test.ts |

## Implementation Details

### session.ts Helper Functions

**`extractCommitHash(appRoot: string): string | null`**
- Splits appRoot on path.sep, finds last `bin` segment, validates next segment with `/^[0-9a-f]{40}$/i`
- Returns null for local VS Code (macOS appRoot: `/Applications/Visual Studio Code.app/Contents/Resources/app`)
- Returns 40-char hash for SSH remote (appRoot: `/home/u/.vscode-server/bin/{hash}/resources/app`)
- T-03-01 mitigation: regex prevents path traversal sequences (e.g., `../`) from reaching path construction

**`extractProfileFromGlobalStorageUri(uri: vscode.Uri): string | null`**
- Finds `profiles` segment in fsPath, validates next segment with `/^[0-9a-f]{4,32}$/i`
- Returns null when no profiles segment (default profile path)
- Entire function wrapped in try/catch — null on any failure per D-01

**`extractUserDataDirFromGlobalStorageUri(uri: vscode.Uri): string | null`**
- Returns path.slice(0, userIdx) where userIdx is the index of the `User` segment
- Handles macOS (`~/Library/Application Support/Code`), Linux (`~/.config/Code`), SSH remote (`~/.vscode-server/data`)

**`deriveLocalSessionHash(appRoot: string): string`**
- SHA-256(appRoot).slice(0,16) — 16 hex chars = 64-bit address space, collision-safe for local installs
- Stable: appRoot is constant for a given VS Code installation

**`extractServerBinPath(appRoot: string, commitHash: string | null): string | null`**
- Returns path up to and including the hash segment (parent of `resources/app`)
- Used for `remote_server_path` field in SessionMetadata

### session.ts Exported Functions

**`getSessionJsonPath(metadata: SessionMetadata): string`**
- SSH remote (remote_name non-null AND server_commit_hash non-null): `~/.vscode-server/bin/{hash}/this-code-session.json` (D-05)
- Local (remote_name null OR server_commit_hash null): `~/.this-code/sessions/{local_session_hash}.json` (D-04)

### storage.ts writeSessionJson()

Writes a JSON record containing:
- `schema_version: 1` — enables CLI format detection
- `recorded_at` — ISO 8601 timestamp of activation write
- All SessionMetadata fields (workspace_path, user_data_dir, profile, local_ide_path, remote_name, remote_server_path, server_commit_hash)
- `open_files: []` — starts empty, populated by document event handlers (Plan 04)

Uses `fs.mkdir({ recursive: true })` on parent directory before write. Safe for both cases:
- SSH remote: `~/.vscode-server/bin/{hash}/` already exists (VS Code Server created it)
- Local: `~/.this-code/sessions/` may not exist on first activation (STOR-05 coverage)

### Note for Plan 06 (Output Channel)

The actual `globalStorageUri.fsPath` value should be logged to the Output Channel on activation. This is a reminder for Plan 06 to add the log line — session.ts only returns values; logging is not its responsibility (per plan design).

## TDD Gate Compliance

RED gate commit: `ca07800` — `test(01-03): add failing tests for session helper functions (TDD RED)`
GREEN gate commit: `fe90dd5` — `feat(01-03): implement collectSessionMetadata() and getSessionJsonPath() in session.ts`

Both gates present. REFACTOR phase not required — implementation was clean on first pass.

## Verification Results

All plan success criteria confirmed:

- `collectSessionMetadata()` reads workspace_path, appRoot, remoteName, globalStorageUri with null-safe handling
- `extractCommitHash()` validates 40-char hex — prevents path traversal (T-03-01)
- `getSessionJsonPath()` returns correct path for SSH (D-05) and local (D-04)
- `writeSessionJson()` creates parent dir + writes valid JSON with schema_version:1
- Five test stubs replaced: STOR-01, STOR-05, TRACK-01, TRACK-02, TRACK-03
- TypeScript strict compile: `npx tsc --noEmit` exits 0
- No `onDidSaveTextDocument` in production source files (TRACK-05 static check)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Plan |
|------|------|------|
| `scanExistingRemoteSessions` | extension/src/storage.ts | Plan 05 |
| STOR-04 test suite | extension/src/test/extension.test.ts | Plan 05 |
| TRACK-04 test suite | extension/src/test/extension.test.ts | Plan 04 |
| PLAT-01 test suite | extension/src/test/extension.test.ts | Plan 07 |

## Threat Mitigations Applied

| Threat ID | Mitigation | Verification |
|-----------|------------|--------------|
| T-03-01 | extractCommitHash validates with /^[0-9a-f]{40}$/i before path construction | grep confirms regex in session.ts |
| T-03-02 | Test bodies use JSON.parse only on files written by writeSessionJson (no user input) | Code review: all parsed content is extension-generated |
| T-03-04 | extractProfileFromGlobalStorageUri returns null on any parse failure | try/catch present; tested via TRACK-03 |

## Self-Check: PASSED

- extension/src/session.ts exists: FOUND
- extension/src/storage.ts exists: FOUND
- extension/src/session.ts contains extractCommitHash: FOUND
- extension/src/session.ts contains /^[0-9a-f]{40}$/i: FOUND
- extension/src/session.ts contains this-code-session.json: FOUND
- extension/src/storage.ts contains schema_version: FOUND
- extension/src/storage.ts contains JSON.stringify: FOUND
- Commit ca07800 exists: FOUND
- Commit fe90dd5 exists: FOUND
- Commit 77f81d3 exists: FOUND
- tsc --noEmit exits 0: CONFIRMED
