---
phase: "01-extension-core-storage-foundation"
plan: "04"
subsystem: "document-tracking"
tags: ["typescript", "vscode-extension", "document-events", "sqlite", "tdd"]
dependency_graph:
  requires:
    - phase: "01-extension-core-storage-foundation"
      plan: "02"
      provides: "Database.run() for UPDATE invocations"
    - phase: "01-extension-core-storage-foundation"
      plan: "03"
      provides: "currentInvocationId from INSERT in activate()"
  provides:
    - "updateOpenFiles() module-level function with D-02 rebuild pattern"
    - "onDidOpenTextDocument and onDidCloseTextDocument wired as fire-and-forget"
    - "TRACK-04 test: filter logic (scheme==='file' && !isClosed) assertion"
    - "TRACK-04 test: SQL parameterized query static check"
    - "TRACK-05 test: static assertion no onDidSaveTextDocument in extension.ts"
  affects:
    - "01-05 (scanExistingRemoteSessions reads open_files; format established here)"
    - "01-06 (activate() uses currentInvocationId wired here)"
tech_stack:
  added: []
  patterns:
    - "D-02: rebuild open_files from vscode.workspace.textDocuments on every event — not decrement"
    - "filter: !doc.isClosed && doc.uri.scheme === 'file' eliminates language mode false positives"
    - "fire-and-forget: updateOpenFiles(db, id).catch(() => {}) in both document event handlers"
    - "T-04-01 mitigation: parameterized UPDATE query — no template literals in SQL"
key_files:
  created: []
  modified:
    - "extension/src/extension.ts"
    - "extension/src/test/extension.test.ts"
decisions:
  - "updateOpenFiles() comment block updated to match locked D-02 spec with VS Code issue #102737 reference"
  - "catch block comment updated to 'swallow to avoid crashing the extension host' per locked spec"
  - "TRACK-04 test reads path via path.resolve(__dirname, '..', '..', 'src', 'extension.ts') for robustness across compile output dirs"
metrics:
  duration_seconds: 161
  completed_date: "2026-04-26"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 01 Plan 04: Document Event Tracking Summary

**updateOpenFiles() hardened to locked D-02 spec with fire-and-forget event wiring; TRACK-04 and TRACK-05 test stubs replaced with filter logic and static source assertions.**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement updateOpenFiles() with D-02 rebuild pattern | dc2734e | extension/src/extension.ts |
| 2 | Replace TRACK-04 and TRACK-05 test stubs with real assertions | d502684 | extension/src/test/extension.test.ts |

## Implementation Details

### updateOpenFiles() Final Implementation

```typescript
async function updateOpenFiles(db: Database, rowId: number): Promise<void> {
  // D-02: Rebuild from authoritative live list on every event.
  // Prevents false positives from language mode changes (VS Code issue #102737):
  // language detection fires close+open for same document; isClosed is false during the spurious close.
  const openFiles = vscode.workspace.textDocuments
    .filter((doc) => !doc.isClosed && doc.uri.scheme === "file")
    .map((doc) => doc.uri.fsPath);
  try {
    await db.run("UPDATE invocations SET open_files = ? WHERE id = ?", [
      JSON.stringify(openFiles),
      rowId,
    ]);
  } catch {
    // DB error during update — swallow to avoid crashing the extension host
  }
}
```

Key properties:
- **Module-level** (not nested in `activate()`) — enables clear referencing
- **D-02 rebuild pattern**: reads `vscode.workspace.textDocuments` fresh on every event, never decrements
- **Dual filter**: `!doc.isClosed && doc.uri.scheme === "file"` — excludes closed docs AND non-file URIs (untitled, git, output)
- **Parameterized query**: `?` placeholders, no template literals (T-04-01 mitigation)
- **Swallowed catch**: DB errors do not propagate to the VS Code event loop

### Event Handler Wiring (in activate())

```typescript
context.subscriptions.push(
  vscode.workspace.onDidOpenTextDocument(() => {
    if (db && currentInvocationId !== undefined) {
      updateOpenFiles(db, currentInvocationId).catch(() => {});
    }
  }),
  vscode.workspace.onDidCloseTextDocument(() => {
    if (db && currentInvocationId !== undefined) {
      updateOpenFiles(db, currentInvocationId).catch(() => {});
    }
  }),
);
```

Fire-and-forget pattern with guard: only calls `updateOpenFiles` when DB is open and invocation row exists.

### Test Assertions Added

**TRACK-04 Test 1 — Filter logic:**
Constructs 5 mock TextDocument objects (mix of schemes and isClosed states), runs the filter inline, asserts `deepStrictEqual` to `["/home/u/file1.ts", "/home/u/file3.ts"]`.

**TRACK-04 Test 2 — SQL injection static check:**
Reads `extension/src/extension.ts` source, tests regex `/UPDATE invocations.*\$\{/` — asserts it does NOT match. Verifies no template literals appear in UPDATE statement.

**TRACK-05 Test — No save trigger:**
Reads `extension/src/extension.ts` source, asserts `!src.includes("onDidSaveTextDocument")`.

## Static Verification Results

- `uri.scheme === "file"` present in extension.ts: CONFIRMED (line 100)
- `!doc.isClosed` present in extension.ts: CONFIRMED (line 100)
- `UPDATE invocations SET open_files = ? WHERE id = ?` present: CONFIRMED (line 103)
- `onDidSaveTextDocument` absent from all production source files: CONFIRMED
- TypeScript strict compile: `npx tsc --noEmit` exits 0

## Threat Mitigations Applied

| Threat ID | Mitigation | Verification |
|-----------|------------|--------------|
| T-04-01 | Parameterized UPDATE query — `?` placeholders, no template literals | TRACK-04 test 2 static assertion |
| T-04-04 | D-02 rebuild pattern; `!doc.isClosed` filter eliminates language mode false positives | TRACK-04 test 1 filter assertion |

## Deviations from Plan

### Minor adjustments

**1. [Plan spec — comment update] Updated D-02 comment and catch comment to match locked spec**
- The scaffold from Plan 01 had placeholder comments; this plan updated them to the locked D-02 wording including VS Code issue #102737 reference and "swallow to avoid crashing the extension host".
- No logic change — comment-only diff.
- Commit: dc2734e

**2. [Plan spec — path resolution] Used `path.resolve(__dirname, '..', '..', 'src', 'extension.ts')` instead of plan's `../../src/extension.ts`**
- The plan's action note said "safest approach is to use `path.resolve(__dirname, '..', '..', 'src', 'extension.ts')`" — used that form directly.
- Commit: d502684

## Known Stubs

| Stub | File | Plan |
|------|------|------|
| `scanExistingRemoteSessions` | extension/src/storage.ts | Plan 05 |
| STOR-04 test suite | extension/src/test/extension.test.ts | Plan 05 |
| PLAT-01 test suite | extension/src/test/extension.test.ts | Plan 07 |

## Self-Check: PASSED

- extension/src/extension.ts contains D-02 comment: FOUND
- extension/src/extension.ts contains `!doc.isClosed && doc.uri.scheme === "file"`: FOUND
- extension/src/extension.ts contains parameterized UPDATE query: FOUND
- extension/src/test/extension.test.ts TRACK-04 filter test: FOUND
- extension/src/test/extension.test.ts TRACK-04 SQL static test: FOUND
- extension/src/test/extension.test.ts TRACK-05 save trigger test: FOUND
- Commit dc2734e exists: FOUND
- Commit d502684 exists: FOUND
- tsc --noEmit exits 0: CONFIRMED
