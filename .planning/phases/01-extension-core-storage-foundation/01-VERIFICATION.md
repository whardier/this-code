---
phase: 01-extension-core-storage-foundation
verified: 2026-04-26T22:30:00Z
status: gaps_found
score: 3/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "After opening a workspace, JSON file exists with workspace path, server commit hash, user-data-dir, profile, and open files"
    status: partial
    reason: "writeSessionJson() and getSessionJsonPath() are correctly implemented and wired. However, the DB constructor uses throw-in-async-callback (CR-01) which silently loses open errors bypassing activate()'s try/catch, meaning the JSON write may silently fail on DB open failure. Additionally, extractUserDataDirFromGlobalStorageUri() uses indexOf('User') which matches 'Users' first on macOS paths, producing an empty string for user_data_dir on macOS (WR-02). The JSON file is otherwise structurally correct."
    artifacts:
      - path: "extension/src/db.ts"
        issue: "CR-01: constructor throws in async callback (line 9) — open errors silently lost, bypasses activate() try/catch"
      - path: "extension/src/session.ts"
        issue: "WR-02: extractUserDataDirFromGlobalStorageUri uses indexOf('User') (line 87) — matches 'Users' segment first on macOS, returns empty string instead of correct user data dir"
    missing:
      - "Fix Database constructor to use silent-open or async factory pattern so open errors propagate to activate() try/catch"
      - "Fix extractUserDataDirFromGlobalStorageUri to use lastIndexOf('User') bounded by globalStorage segment, or key off globalStorage segment instead"
  - truth: "After opening a workspace, sessions.db contains a row with matching session data including server_commit_hash queryable via sqlite3 CLI"
    status: failed
    reason: "CR-02: The live-session INSERT in activate() (extension.ts:77-90) omits server_commit_hash and server_bin_path columns. Both values are available in metadata at insertion time (metadata.server_commit_hash, metadata.remote_server_path) but are not inserted. The schema defines these columns and the startup scan (storage.ts) correctly populates them for historical sessions. Live sessions will always have NULL server_commit_hash and server_bin_path, making CLI queries on these columns miss all active sessions."
    artifacts:
      - path: "extension/src/extension.ts"
        issue: "CR-02: INSERT INTO invocations at lines 77-90 lists only 7 columns — missing server_commit_hash and server_bin_path"
    missing:
      - "Add server_commit_hash and server_bin_path to the live-session INSERT column list and VALUES array in activate()"
  - truth: "Integration tests are runnable and validate the implementation"
    status: failed
    reason: "WR-01: .vscode-test.js targets src/test/**/*.test.js (compiled JS output) but tsconfig.json has noEmit:true and esbuild only bundles extension.ts, not tests. No .js files are ever compiled to out/test/. npm test will find no test files. Additionally, dist/ directory does not exist (esbuild has not been run), so the CI 'Verify dist output' step would fail."
    artifacts:
      - path: "extension/.vscode-test.js"
        issue: "WR-01: files glob points at *.test.js but noEmit:true means tsc never emits JS; no test compilation step exists"
      - path: "extension/tsconfig.json"
        issue: "noEmit: true with no tsconfig.test.json or pretest script to compile tests separately"
    missing:
      - "Add a tsconfig.test.json extending tsconfig.json with noEmit:false and outDir:'./out'"
      - "Add a 'pretest' script: 'tsc -p tsconfig.test.json'"
      - "Update .vscode-test.js files glob to 'out/test/**/*.test.js'"
      - "Run npm run build to produce dist/extension.js (or add to CI pre-steps)"
human_verification:
  - test: "Activate extension in a local VS Code workspace and open the Output Channel 'This Code'"
    expected: "Invocation recorded log line appears with a valid integer ID; no activation failed message"
    why_human: "Cannot run VS Code extension host programmatically during verification"
  - test: "Activate extension in an SSH Remote workspace and inspect the generated JSON file"
    expected: "JSON file exists at ~/.vscode-server/bin/{40-hex-hash}/this-code-session.json with server_commit_hash matching the directory name"
    why_human: "Requires live SSH remote VS Code session to test extensionKind workspace behavior and SSH path construction"
  - test: "Activate extension on macOS and check user_data_dir value in the session JSON"
    expected: "user_data_dir is ~/Library/Application Support/Code (not empty string)"
    why_human: "WR-02 produces wrong result on macOS — human needed to confirm actual runtime behavior"
---

# Phase 1: Extension Core + Storage Foundation Verification Report

**Phase Goal:** Extension silently records session metadata wherever VS Code runs, producing inspectable JSON files and a queryable SQLite database
**Verified:** 2026-04-26T22:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #   | Truth                                                                                     | Status       | Evidence                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | JSON file written with workspace path, commit hash, user-data-dir, profile, open files   | PARTIAL      | writeSessionJson() and getSessionJsonPath() are implemented and wired; CR-01 (DB constructor) + WR-02 (macOS user_data_dir bug) degrade quality  |
| 2   | sessions.db contains matching row queryable via sqlite3 CLI                               | FAILED       | CR-02: live INSERT omits server_commit_hash and server_bin_path — row created but missing two required fields                                    |
| 3   | Opening/closing files updates open_files array within seconds                             | VERIFIED     | updateOpenFiles() with D-02 rebuild pattern is implemented and wired to both onDidOpenTextDocument and onDidCloseTextDocument fire-and-forget    |
| 4   | Extension produces no visible UI — Output Channel only                                    | VERIFIED     | No showInformationMessage/showWarningMessage/showErrorMessage calls; OutputChannel "This Code" created; log() helper with logLevel gating        |
| 5   | Extension activates on local and SSH Remote workspaces (extensionKind workspace)          | VERIFIED     | extensionKind: ["workspace"] confirmed in manifest; collectSessionMetadata() handles both local and SSH remote paths via extractCommitHash()     |

**Score:** 3/5 truths fully verified (2 failed/partial)

### Required Artifacts

| Artifact                              | Expected                                          | Status     | Details                                                                                              |
| ------------------------------------- | ------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `extension/package.json`              | Publisher whardier, name this-code, workspace     | VERIFIED   | ID whardier.this-code, extensionKind ["workspace"], onStartupFinished, no commands, 2 settings       |
| `extension/tsconfig.json`             | strict:true, noEmit:true                          | VERIFIED   | Both present; tsc --noEmit exits 0                                                                   |
| `extension/esbuild.js`                | external: vscode + @vscode/sqlite3                | VERIFIED   | Both marked external; entryPoints: src/extension.ts                                                  |
| `extension/.vscodeignore`             | !node_modules/@vscode/sqlite3/**                  | VERIFIED   | Preservation line present after node_modules/** exclusion                                            |
| `extension/.vscode-test.js`           | Test runner config                                | STUB       | WR-01: targets *.test.js but noEmit:true means no .js files ever emitted; tests will not run         |
| `extension/src/extension.ts`          | activate() and deactivate() with full wiring      | PARTIAL    | Fully wired except CR-01 (DB constructor silent failure) and CR-02 (INSERT omits 2 columns)          |
| `extension/src/db.ts`                 | Database class + initDatabase() with WAL          | PARTIAL    | initDatabase() complete with WAL/busy_timeout/11-column schema; constructor has CR-01 throw bug      |
| `extension/src/session.ts`            | collectSessionMetadata() + getSessionJsonPath()   | PARTIAL    | Both implemented; WR-02: extractUserDataDirFromGlobalStorageUri wrong on macOS                       |
| `extension/src/storage.ts`            | writeSessionJson() + scanExistingRemoteSessions() | VERIFIED   | Both fully implemented; scan has injectable binDir, incremental dedup, per-entry error handling      |
| `extension/src/config.ts`             | isEnabled() + getLogLevel()                       | VERIFIED   | Complete; ES import in extension.ts at module level                                                  |
| `extension/src/test/extension.test.ts`| 16 suites (17 actual — SESSION-HELPERS added)     | PARTIAL    | Suites present and substantive; WR-01 means they cannot actually be executed via npm test            |
| `.github/workflows/ci.yml`            | macOS + ubuntu matrix with typecheck + build      | VERIFIED   | Both platforms, fail-fast:false, npm ci, tsc --noEmit, npm run build, manifest check, TRACK-05 grep |
| `extension/node_modules/@vscode/sqlite3` | Native binary installed                        | VERIFIED   | darwin-arm64 prebuilt present                                                                        |
| `extension/dist/extension.js`         | Built bundle from esbuild                         | MISSING    | dist/ directory does not exist; esbuild has not been run                                             |

### Key Link Verification

| From                          | To                          | Via                                   | Status       | Details                                                                         |
| ----------------------------- | --------------------------- | ------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| esbuild.js                    | src/extension.ts            | entryPoints config                    | WIRED        | entryPoints: ["src/extension.ts"] confirmed                                     |
| extension.ts                  | db.ts                       | import + await initDatabase()         | WIRED        | import present; await initDatabase(db) in activate()                            |
| extension.ts                  | session.ts                  | import + collectSessionMetadata()     | WIRED        | import present; metadata = collectSessionMetadata(context) in activate()        |
| extension.ts                  | storage.ts                  | import + writeSessionJson()           | WIRED        | import present; await writeSessionJson(sessionJsonPath, metadata) in activate() |
| extension.ts                  | storage.ts                  | scanExistingRemoteSessions fire+forget| WIRED        | scanExistingRemoteSessions(db).catch(err => ...) — not awaited, correct pattern |
| extension.ts INSERT           | invocations schema           | db.run parameterized query            | PARTIAL      | CR-02: INSERT omits server_commit_hash and server_bin_path columns              |
| onDidOpenTextDocument         | updateOpenFiles()            | fire-and-forget handler               | WIRED        | updateOpenFiles(db, currentInvocationId).catch(() => {}) present                |
| onDidCloseTextDocument        | updateOpenFiles()            | fire-and-forget handler               | WIRED        | updateOpenFiles(db, currentInvocationId).catch(() => {}) present                |
| package.json main             | dist/extension.js            | main field                            | BROKEN       | ./dist/extension.js in manifest but dist/ does not exist                        |

### Data-Flow Trace (Level 4)

| Artifact            | Data Variable       | Source                                   | Produces Real Data | Status      |
| ------------------- | ------------------- | ---------------------------------------- | ------------------ | ----------- |
| extension.ts        | metadata            | collectSessionMetadata(context)          | Yes (vscode.env)   | FLOWING     |
| extension.ts        | currentInvocationId | db.run INSERT result.lastID              | Yes (real DB row)  | PARTIAL (CR-02: 2 cols missing) |
| extension.ts        | openFiles           | vscode.workspace.textDocuments filter    | Yes (live API)     | FLOWING     |
| storage.ts          | scanExistingRemoteSessions | fs.readdir ~/.vscode-server/bin | Yes (real filesystem) | FLOWING  |

### Behavioral Spot-Checks

| Behavior                                       | Command                                                  | Result                              | Status  |
| ---------------------------------------------- | -------------------------------------------------------- | ----------------------------------- | ------- |
| Manifest validates package.json                | node -e "validate manifest script"                       | whardier.this-code OK               | PASS    |
| @vscode/sqlite3 native module installed        | test -d node_modules/@vscode/sqlite3                     | directory exists                    | PASS    |
| TypeScript strict compile                      | cd extension && npx tsc --noEmit                         | exits 0                             | PASS    |
| No onDidSaveTextDocument in production source  | grep in extension.ts                                     | 0 matches                           | PASS    |
| No UI calls in extension.ts                    | grep showInformationMessage/Warning/Error                | 0 matches                           | PASS    |
| scanExistingRemoteSessions not awaited         | grep in extension.ts                                     | .catch() pattern confirmed          | PASS    |
| dist/extension.js exists                       | test -f dist/extension.js                               | MISSING — esbuild not run           | FAIL    |
| Tests runnable via npm test                    | .vscode-test.js files glob matches compiled output       | WR-01: no .js files exist in out/  | FAIL    |

### Requirements Coverage

| Requirement | Source Plan | Description                                             | Status   | Evidence                                                                                       |
| ----------- | ----------- | ------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| EXT-01      | 01-01       | Extension ID is whardier.this-code                      | SATISFIED| publisher.this-code in manifest; test suite verified                                           |
| EXT-02      | 01-01       | extensionKind: ["workspace"]                            | SATISFIED| manifest confirmed; test suite verified                                                        |
| EXT-03      | 01-01       | Activates on onStartupFinished                          | SATISFIED| activationEvents confirmed; test suite verified                                                |
| EXT-04      | 01-06       | No UI — Output Channel only                            | SATISFIED| No showInformation/Warning/Error calls; OutputChannel "This Code" created; log() helper gated  |
| EXT-05      | 01-06       | Two settings: thisCode.enable, thisCode.logLevel        | SATISFIED| Exactly two settings in manifest; test suite verified; config.ts implements both               |
| STOR-01     | 01-03       | Per-instance JSON at correct path                       | PARTIAL  | writeSessionJson() writes correct JSON; getSessionJsonPath() correct; WR-02 degrades user_data_dir on macOS |
| STOR-02     | 01-02       | SQLite in WAL mode with busy timeout                    | SATISFIED| initDatabase() confirmed: PRAGMA journal_mode=WAL, PRAGMA busy_timeout=5000, user_version=1   |
| STOR-03     | 01-02       | 11-column invocations schema                            | SATISFIED| All 11 columns present in CREATE TABLE; test assertion confirms; REQUIREMENTS.md updated       |
| STOR-04     | 01-05       | Startup scan of existing sessions                       | SATISFIED| scanExistingRemoteSessions() implemented with injectable binDir, incremental dedup, per-entry try/catch; fire-and-forget wired |
| STOR-05     | 01-03       | Creates ~/.this-code/ on first activation               | SATISFIED| fs.mkdir(thisCodeDir, {recursive:true}) in activate(); writeSessionJson() also mkdir recursive |
| TRACK-01    | 01-03       | Records workspace root path                             | SATISFIED| workspaceFolders[0].uri.fsPath collected; included in INSERT and JSON                         |
| TRACK-02    | 01-03       | Records VS Code Server commit hash                      | PARTIAL  | collectSessionMetadata() extracts commit hash via /^[0-9a-f]{40}$/i; CR-02 means live INSERT has NULL server_commit_hash in DB |
| TRACK-03    | 01-03       | Records user-data-dir and profile                       | PARTIAL  | profile extraction correct; user_data_dir extraction has WR-02 bug (wrong on macOS)            |
| TRACK-04    | 01-04       | Records open file manifest on open/close events         | SATISFIED| updateOpenFiles() with D-02 rebuild; both events wired fire-and-forget                         |
| TRACK-05    | 01-04       | Does NOT trigger on save                                | SATISFIED| No onDidSaveTextDocument in extension.ts; CI grep step enforces this                           |
| PLAT-01     | 01-07       | macOS and Linux primary platforms                       | SATISFIED| CI matrix: macos-latest + ubuntu-latest, fail-fast:false; test suite asserts this              |

### Anti-Patterns Found

| File                      | Line | Pattern                                       | Severity | Impact                                                                                                        |
| ------------------------- | ---- | --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| extension/src/db.ts       | 9    | CR-01: `throw err` inside async DB callback   | Blocker  | DB open errors silently lost; activate() try/catch never sees them; extension runs with broken DB handle      |
| extension/src/extension.ts| 77-90| CR-02: INSERT omits server_commit_hash, server_bin_path | Blocker | Live session rows always have NULL for these two columns; breaks CLI queries joining on commit hash      |
| extension/src/session.ts  | 87   | WR-02: `indexOf("User")` matches "Users" on macOS | Warning | user_data_dir returns empty string on macOS (e.g. /Users/name/...) instead of ~/Library/Application Support/Code |
| extension/.vscode-test.js | 4    | WR-01: glob targets *.test.js with noEmit:true | Warning | Integration tests will never execute; npm test produces no test runs; all test suites are unreachable          |

### Human Verification Required

#### 1. Extension Activation in Local VS Code

**Test:** Open VS Code in a local workspace with the extension installed (or sideloaded). Open Output > "This Code" panel.
**Expected:** Activation log lines appear including "This Code activated successfully. Invocation ID: N" with a positive integer N. No "activation failed" message.
**Why human:** Cannot run VS Code extension host in automated verification.

#### 2. SSH Remote Session JSON Path

**Test:** Connect to an SSH Remote host with the extension active. Check for `~/.vscode-server/bin/{40-hex-hash}/this-code-session.json` on the remote host.
**Expected:** File exists; `server_commit_hash` field matches the directory name; `remote_name` is "ssh-remote".
**Why human:** Requires a live SSH remote VS Code session to test extensionKind workspace deployment and SSH path construction.

#### 3. macOS user_data_dir Correctness (WR-02 Impact)

**Test:** Activate extension on macOS, check session JSON `user_data_dir` field.
**Expected:** Should be `~/Library/Application Support/Code` — NOT an empty string.
**Why human:** WR-02 is a confirmed code bug that produces wrong results on macOS; human needed to observe actual runtime value to quantify impact before marking fixed.

---

## Gaps Summary

Three gaps prevent full goal achievement:

**Gap 1 — CR-01 (Blocker): Database constructor swallows open errors.** The `throw err` inside the sqlite3 async open callback does not propagate to `activate()`'s try/catch. If the database file cannot be opened (permissions, disk full, corrupt), the extension silently continues with a non-functional DB, `currentInvocationId` stays undefined, and all subsequent DB operations fail silently. Fix: use the silent-open constructor pattern (no callback) or an async factory so errors surface at the `await` site.

**Gap 2 — CR-02 (Blocker): Live session INSERT missing two columns.** The INSERT in `activate()` includes only 7 of the 9 non-default columns — it omits `server_commit_hash` and `server_bin_path`. Both values are available in `metadata` at insertion time. Every live session row will have NULL for these fields. The startup scan correctly populates them for historical sessions but not for the current active session. This breaks the primary use case: querying the current session by commit hash.

**Gap 3 — WR-01 (Warning): Tests are not runnable.** `.vscode-test.js` targets compiled `.js` output but `tsconfig.json` has `noEmit:true` and there is no test compilation step. `npm test` will find zero test files. All 17 test suites are unreachable. This means the integration assertions written across Plans 02-05 have never been executed. Additionally, `dist/extension.js` does not exist — the extension bundle has not been built.

**Root cause grouping:** Gaps 1 and 2 both affect `extension.ts`/`db.ts` and can be fixed together in a single focused plan. Gap 3 is a test infrastructure issue requiring a `tsconfig.test.json` and build step adjustment.

---

_Verified: 2026-04-26T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
