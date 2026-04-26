---
phase: "01-extension-core-storage-foundation"
plan: "05"
subsystem: "storage-startup-scan"
tags: ["typescript", "vscode-extension", "sqlite3", "startup-scan", "tdd", "incremental"]
dependency_graph:
  requires:
    - phase: "01-extension-core-storage-foundation"
      plan: "02"
      provides: "initDatabase() and invocations table schema"
    - phase: "01-extension-core-storage-foundation"
      plan: "03"
      provides: "writeSessionJson() and this-code-session.json format"
  provides:
    - "scanExistingRemoteSessions() full implementation with injectable binDir parameter"
    - "Incremental dedup via SELECT before INSERT on remote_server_path"
    - "Silent ENOENT fallback for local-only machines"
    - "Per-entry try/catch for malformed JSON and missing session files"
    - "STOR-04 test suite with 3 real integration tests using pre-seeded tmp directories"
  affects:
    - "01-06 (activate() already calls scanExistingRemoteSessions fire-and-forget)"
tech_stack:
  added:
    - "node:os (os.homedir() for default binDir)"
  patterns:
    - "Injectable binDir parameter for deterministic testing without home dir access"
    - "fs.readdir + per-entry try/catch — incremental scan with silent per-entry error swallowing"
    - "SELECT dedup before INSERT — skips entries with remote_server_path already in invocations"
    - "TDD RED/GREEN: failing tests committed before implementation"
key_files:
  created: []
  modified:
    - "extension/src/storage.ts"
    - "extension/src/test/extension.test.ts"
decisions:
  - "entryDir (path.join(binDir, entry)) used as authoritative remote_server_path dedup key — not the JSON field value — prevents spoofed duplicates"
  - "local_ide_path defaults to empty string (NOT NULL constraint) when missing from scanned JSON"
  - "open_files defaults to [] when missing from scanned JSON — matches schema NOT NULL DEFAULT '[]'"
  - "recorded_at field not written by scan — invoked_at uses SQLite DEFAULT (strftime) on INSERT"
metrics:
  duration_seconds: 119
  completed_date: "2026-04-26"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 01 Plan 05: scanExistingRemoteSessions() Implementation Summary

**Full scanExistingRemoteSessions() implementation with injectable binDir, incremental dedup, and silent error swallowing — with STOR-04 stub replaced by 3 real integration tests using pre-seeded tmp directories via TDD RED/GREEN cycle.**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing STOR-04 tests for scanExistingRemoteSessions | 67232f6 | extension/src/test/extension.test.ts |
| 1 (GREEN) | Implement scanExistingRemoteSessions() in storage.ts | f59da1b | extension/src/storage.ts |
| 2 | STOR-04 stub replaced (done via RED commit above) | 67232f6 | extension/src/test/extension.test.ts |

## Implementation Details

### scanExistingRemoteSessions() in storage.ts

**Signature:**
```typescript
export async function scanExistingRemoteSessions(
  db: Database,
  binDir: string = path.join(os.homedir(), ".vscode-server", "bin"),
): Promise<void>
```

**Flow:**
1. `fs.readdir(binDir)` — if ENOENT or any error, return silently (local-only machine)
2. For each directory entry under binDir:
   - Construct `entryDir = path.join(binDir, entry)`
   - `SELECT id FROM invocations WHERE remote_server_path = ? LIMIT 1` — skip if already indexed
   - Read `this-code-session.json` from entryDir
   - `JSON.parse` the contents
   - `INSERT INTO invocations` with all 9 field values using parameterized `?` placeholders
   - Per-entry try/catch swallows all errors (missing file, malformed JSON, DB error)

**Key behaviors:**
- `binDir` injectable for testing — never touches real `~/.vscode-server` in tests
- `entryDir` used as authoritative `remote_server_path` dedup key (not the JSON field value)
- `local_ide_path` defaults to `""` (NOT NULL constraint requirement)
- `open_files` defaults to `JSON.stringify([])` (NOT NULL constraint requirement)
- `server_commit_hash` and `server_bin_path` default to `null` (nullable columns)
- Called fire-and-forget from activate() via `.catch()` — already in place from Plan 01 scaffold

### STOR-04 Test Suite (3 tests)

**Test 1: pre-seeded session JSON in tmp binDir is indexed into SQLite on scan**
- Creates `tmpRoot/bin/{40-char-hash}/this-code-session.json` fixture
- Verifies no row before scan, then row exists after `scanExistingRemoteSessions(db, fakeBinDir)`
- Asserts `workspace_path` and `server_commit_hash` values match fixture

**Test 2: scan is incremental — calling twice inserts only one row**
- Calls `scanExistingRemoteSessions(db, fakeBinDir)` twice on same data
- Asserts `db.all(... WHERE remote_server_path = ?)` returns exactly 1 row

**Test 3: scanExistingRemoteSessions does not throw when binDir does not exist**
- Points at a non-existent directory path
- Asserts `doesNotReject(() => scanExistingRemoteSessions(db, nonExistent))`

All 3 tests use injected tmp directories — zero real home directory access.

## TDD Gate Compliance

RED gate commit: `67232f6` — `test(01-05): add failing STOR-04 tests for scanExistingRemoteSessions (TDD RED)`
GREEN gate commit: `f59da1b` — `feat(01-05): implement scanExistingRemoteSessions() in storage.ts (TDD GREEN)`

Both gates present. REFACTOR phase not required — implementation was clean on first pass.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation | Verification |
|-----------|------------|--------------|
| T-05-01 | Per-entry try/catch swallows JSON parse errors — no stack traces emitted | Inner catch present in storage.ts for each entry |
| T-05-02 | All INSERT values use `?` parameterized placeholders — no session field interpolated into SQL | grep confirms no template literals in SQL context |
| T-05-03 | fs.readdir returns basenames; path.join constructs entryDir safely; no JSON path values used in path construction | entryDir derived from binDir + readdir basename only |
| T-05-04 | Startup scan not awaited in activate() — slow scan does not block activation | `scanExistingRemoteSessions(db).catch(...)` confirmed in extension.ts |

## Known Stubs

None — STOR-04 stub is now fully replaced. Remaining stubs from prior plans:
- PLAT-01 test suite: Plan 07

## Threat Flags

No new threat surface beyond the plan's threat model. T-05-01 through T-05-04 all addressed.

## Self-Check: PASSED

- extension/src/storage.ts contains `vscode-server`: FOUND
- extension/src/storage.ts contains `remote_server_path`: FOUND
- extension/src/storage.ts contains `LIMIT 1`: FOUND
- extension/src/storage.ts contains `JSON.parse`: FOUND
- extension/src/storage.ts contains `binDir`: FOUND
- extension/src/test/extension.test.ts contains `fakeBinDir`: FOUND
- extension/src/test/extension.test.ts contains `does not throw`: FOUND
- Commit 67232f6 (RED) exists: FOUND
- Commit f59da1b (GREEN) exists: FOUND
- tsc --noEmit exits 0: CONFIRMED
