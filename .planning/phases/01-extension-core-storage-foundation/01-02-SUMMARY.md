---
phase: "01-extension-core-storage-foundation"
plan: "02"
subsystem: database
tags: ["sqlite3", "wal", "schema-migration", "typescript", "vscode-extension"]

requires:
  - phase: "01-extension-core-storage-foundation"
    plan: "01"
    provides: "Database class wrapper + initDatabase stub in extension/src/db.ts"
provides:
  - "Complete initDatabase() implementation: WAL → busy_timeout=5000 → schema migration with user_version guard"
  - "invocations table with all 11 locked columns (D-07/STOR-03) including server_commit_hash and server_bin_path"
  - "Two indexes: idx_invocations_workspace and idx_invocations_time"
  - "Idempotent migration via PRAGMA user_version = 1"
  - "Real STOR-02 integration test asserting journal_mode=wal"
  - "Real STOR-03 integration tests asserting all 11 column names and idempotency"
affects:
  - "01-03"
  - "01-04"
  - "01-05"
  - "Phase 2 Rust CLI (reads same schema)"

tech-stack:
  added: []
  patterns:
    - "WAL-first PRAGMA ordering: journal_mode=WAL before any DDL"
    - "user_version guard for idempotent SQLite schema migrations"
    - "require() in test bodies for runtime dynamic imports (avoids circular dependency at compile time)"

key-files:
  created: []
  modified:
    - "extension/src/db.ts"
    - "extension/src/test/extension.test.ts"

key-decisions:
  - "PRAGMA order is locked: WAL first, busy_timeout second, DDL third — verified by acceptance criteria and threat model T-02-01"
  - "user_version < 1 guard makes initDatabase() safe to call on an already-initialized database without duplicate DDL"
  - "invoked_at is the locked column name per D-07, superseding REQUIREMENTS.md STOR-03 which says recorded_at"
  - "Tests use require('../db') with runtime dynamic import to avoid TypeScript circular import issues and to stay compatible with compiled output structure"

patterns-established:
  - "Idempotent migration pattern: check PRAGMA user_version before DDL, set version after DDL"
  - "All db.run() SQL uses no string interpolation — parameterized or literal-only queries (T-02-02 mitigation)"

requirements-completed:
  - STOR-02
  - STOR-03
  - STOR-05

duration: 2min
completed: "2026-04-26"
---

# Phase 01 Plan 02: SQLite initDatabase() Implementation Summary

**WAL-mode SQLite initialization with idempotent schema migration creating the 11-column invocations table, verified by real integration tests replacing STOR-02 and STOR-03 stubs.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-26T21:35:28Z
- **Completed:** 2026-04-26T21:37:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced the `initDatabase` stub (which threw at runtime) with a complete, production-ready implementation in `extension/src/db.ts`
- Implemented the locked PRAGMA sequence: WAL mode first, busy_timeout=5000 second, DDL third, user_version=1 last
- Created the `invocations` table with all 11 columns per D-07/STOR-03 including `server_commit_hash` and `server_bin_path` for SSH remote session tracking
- Replaced STOR-02 and STOR-03 test stubs with 3 real assertions using a temp-file SQLite database (no VS Code host needed for these tests)
- Added idempotency test: calling `initDatabase()` twice on the same database does not throw

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement initDatabase() with WAL, busy_timeout, and schema migration** - `009ee58` (feat)
2. **Task 2: Replace STOR-02 and STOR-03 test stubs with real SQLite assertions** - `465e058` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `extension/src/db.ts` — `initDatabase()` replaced from stub to full implementation; `_db` parameter renamed to `db`
- `extension/src/test/extension.test.ts` — STOR-02 suite: 1 real test (journal_mode=wal); STOR-03 suite: 2 real tests (columns + idempotency)

## Decisions Made

- `invoked_at` is the locked column name per D-07, not `recorded_at` as written in REQUIREMENTS.md STOR-03 — D-07 supersedes the requirements text and the Rust CLI (Phase 2) reads this column by name
- `require('../db')` used inside test bodies (not ES import) — stays compatible with compiled output and avoids potential circular dependency resolution issues at runtime in the VS Code test host

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript typecheck passed on first attempt. All grep verification assertions matched expected counts.

## Threat Mitigations Applied

| Threat ID | Mitigation | Verification |
|-----------|------------|--------------|
| T-02-01 | WAL PRAGMA runs before any DDL — code order enforced | grep confirms `PRAGMA journal_mode=WAL` appears before `CREATE TABLE` in db.ts |
| T-02-02 | No string interpolation in SQL — all db.run() calls use literal SQL or `?` params | Code review: CREATE TABLE uses template literal for multi-line formatting only, no interpolated values |

## Known Stubs

No new stubs introduced. Existing stubs from Plan 01 (STOR-01, STOR-04, STOR-05, TRACK-01 through TRACK-04, PLAT-01) remain as-is per plan. STOR-02 and STOR-03 are now fully implemented.

## Threat Flags

No new threat surface beyond the plan's threat model.

## Self-Check: PASSED

- extension/src/db.ts contains `PRAGMA journal_mode=WAL`: FOUND
- extension/src/db.ts contains `PRAGMA busy_timeout=5000`: FOUND
- extension/src/db.ts contains `PRAGMA user_version = 1`: FOUND
- extension/src/db.ts contains all 11 schema columns: FOUND
- extension/src/test/extension.test.ts contains `journal_mode.*wal`: FOUND
- extension/src/test/extension.test.ts contains `PRAGMA table_info`: FOUND
- extension/src/test/extension.test.ts contains `server_commit_hash`: FOUND
- Commit 009ee58 exists: FOUND
- Commit 465e058 exists: FOUND
- tsc --noEmit exits 0: CONFIRMED

## Next Phase Readiness

- Plan 03 (session metadata collection) can call `initDatabase()` without modification
- Plans 04-06 can INSERT/UPDATE rows into the `invocations` table — schema is finalized and locked
- Phase 2 Rust CLI can read `~/.this-code/sessions.db` with the schema as documented in D-07
- No blockers for continuation

---
*Phase: 01-extension-core-storage-foundation*
*Completed: 2026-04-26*
