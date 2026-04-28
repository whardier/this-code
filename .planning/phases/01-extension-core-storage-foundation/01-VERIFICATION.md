---
phase: 01-extension-core-storage-foundation
verified: 2026-04-27T16:16:26Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "CR-01: Database constructor no longer throws in async callback — silent-open pattern"
    - "CR-02: Live INSERT now includes server_commit_hash and server_bin_path"
    - "WR-01: tsconfig.test.json + pretest script + out/test glob in .vscode-test.js"
    - "WR-02: extractUserDataDirFromGlobalStorageUri uses lastIndexOf anchored on globalStorage"
    - "UAT-T2/T6: extractCommitHash handles cli/servers/Stable-{hash} path structure"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Activate extension in a local VS Code workspace and open the Output Channel 'This Code'"
    expected: "Activation log lines appear including 'This Code activated successfully. Invocation ID: N' with a positive integer N. No 'activation failed' message."
    why_human: "Cannot run VS Code extension host programmatically during verification"
  - test: "Activate extension in an SSH Remote workspace using VS Code Server at cli/servers/Stable-{hash}/server path structure and inspect the generated JSON file"
    expected: "JSON file exists at ~/.vscode-server/bin/{40-hex-hash}/this-code-session.json with server_commit_hash matching the 40-char hex extracted from the Stable- segment; remote_name is 'ssh-remote'"
    why_human: "Requires a live SSH remote VS Code session; cli/servers path extraction is code-verified but runtime behavior needs confirmation"
  - test: "Activate extension on macOS and check user_data_dir value in the session JSON"
    expected: "user_data_dir is ~/Library/Application Support/Code (not empty string) — confirming WR-02 fix works at runtime on macOS"
    why_human: "WR-02 fix uses lastIndexOf anchored on globalStorage — correct in code analysis, but macOS runtime behavior needs human confirmation to close the original warning completely"
---

# Phase 1: Extension Core + Storage Foundation Verification Report

**Phase Goal:** Extension silently records session metadata wherever VS Code runs, producing inspectable JSON files and a queryable SQLite database
**Verified:** 2026-04-27T16:16:26Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plans 01-08 and 01-09)

## Goal Achievement

All five observable truths are now verified at the code level. Three human validation items remain to confirm runtime behavior — they do not represent code failures but require a live VS Code instance to confirm.

### Observable Truths

| #   | Truth                                                                                     | Status     | Evidence                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | JSON file written with workspace path, commit hash, user-data-dir, profile, open files   | VERIFIED   | writeSessionJson() writes all fields; CR-01 fixed (no async-callback throw); WR-02 fixed (lastIndexOf anchored on globalStorage); UAT-T2/T6 fixed (cli/servers/Stable-{hash} extraction) |
| 2   | sessions.db contains matching row queryable via sqlite3 CLI                               | VERIFIED   | CR-02 fixed: INSERT at extension.ts:76-92 now includes server_commit_hash and server_bin_path (9 columns, 9 placeholders) |
| 3   | Opening/closing files updates open_files array within seconds                             | VERIFIED   | updateOpenFiles() with D-02 rebuild pattern wired to both onDidOpenTextDocument and onDidCloseTextDocument fire-and-forget |
| 4   | Extension produces no visible UI — Output Channel only                                    | VERIFIED   | No showInformationMessage/showWarningMessage/showErrorMessage calls; OutputChannel "This Code" created with log() helper and logLevel gating |
| 5   | Extension activates on local and SSH Remote workspaces (extensionKind workspace)          | VERIFIED   | extensionKind: ["workspace"] in manifest; extractCommitHash() handles both legacy bin/{hash} and current cli/servers/Stable-{hash} paths |

**Score:** 5/5 truths verified (up from 3/5)

### Deferred Items

None. All gaps identified in the previous verification have been closed.

### Required Artifacts

| Artifact                               | Expected                                          | Status   | Details                                                                                              |
| -------------------------------------- | ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `extension/package.json`               | Publisher whardier, name this-code, workspace     | VERIFIED | id=whardier.this-code, extensionKind=["workspace"], onStartupFinished, no commands, 2 settings       |
| `extension/tsconfig.json`              | strict:true, noEmit:true                          | VERIFIED | Both confirmed present                                                                               |
| `extension/tsconfig.test.json`         | noEmit:false, outDir:./out                        | VERIFIED | Created by Plan 01-08; extends base tsconfig.json                                                    |
| `extension/esbuild.js`                 | external: vscode + @vscode/sqlite3                | VERIFIED | Both marked external; entryPoints: src/extension.ts → dist/extension.js                             |
| `extension/.vscodeignore`              | !node_modules/@vscode/sqlite3/**                  | VERIFIED | Preservation line present after node_modules/** exclusion                                            |
| `extension/.vscode-test.js`            | glob targets out/test/**/*.test.js                | VERIFIED | WR-01 fixed: glob is `out/test/**/*.test.js`; pretest script compiles to out/                       |
| `extension/src/extension.ts`           | activate() and deactivate() with full wiring      | VERIFIED | 9-column INSERT with server_commit_hash and server_bin_path; CR-01 fixed in db.ts                  |
| `extension/src/db.ts`                  | Database class + initDatabase() with WAL          | VERIFIED | CR-01 fixed: silent-open constructor; initDatabase() with WAL/busy_timeout/11-column schema/indexes |
| `extension/src/session.ts`             | collectSessionMetadata() + getSessionJsonPath() + dual-path extraction | VERIFIED | WR-02 fixed; UAT-T2/T6 fixed with Strategy 2 for cli/servers/Stable-{hash}                   |
| `extension/src/storage.ts`             | writeSessionJson() + scanExistingRemoteSessions() | VERIFIED | Both fully implemented; scan has injectable binDir, incremental dedup, per-entry error handling      |
| `extension/src/config.ts`              | isEnabled() + getLogLevel()                       | VERIFIED | Complete; imported in extension.ts                                                                   |
| `extension/src/test/extension.test.ts` | 17 suites (16 req + SESSION-HELPERS)              | VERIFIED | All 17 suites present; most tests have real assertions (not stubs); 38 total assertions              |
| `.github/workflows/ci.yml`             | macOS + ubuntu matrix with typecheck + build      | VERIFIED | Both platforms, fail-fast:false, TRACK-05 grep enforcement                                           |
| `extension/node_modules/@vscode/sqlite3` | Native binary installed                         | VERIFIED | darwin-arm64 prebuilts present                                                                       |
| `extension/dist/extension.js`          | Built bundle from esbuild                         | VERIFIED | dist/extension.js exists; contains "Stable-" string confirming new extraction code is bundled        |

### Key Link Verification

| From                          | To                          | Via                                   | Status   | Details                                                                              |
| ----------------------------- | --------------------------- | ------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| esbuild.js                    | src/extension.ts            | entryPoints config                    | WIRED    | entryPoints: ["src/extension.ts"] confirmed                                          |
| extension.ts                  | db.ts                       | import + await initDatabase()         | WIRED    | import present; await initDatabase(db) in activate()                                 |
| extension.ts                  | session.ts                  | import + collectSessionMetadata()     | WIRED    | import present; metadata = collectSessionMetadata(context) in activate()             |
| extension.ts                  | storage.ts                  | import + writeSessionJson()           | WIRED    | import present; await writeSessionJson(sessionJsonPath, metadata) in activate()      |
| extension.ts                  | storage.ts                  | scanExistingRemoteSessions fire+forget| WIRED    | scanExistingRemoteSessions(db).catch(err => ...) not awaited — correct pattern       |
| extension.ts INSERT           | invocations schema          | db.run parameterized query            | WIRED    | CR-02 fixed: 9-column INSERT includes server_commit_hash and server_bin_path         |
| onDidOpenTextDocument         | updateOpenFiles()           | fire-and-forget handler               | WIRED    | updateOpenFiles(db, currentInvocationId).catch(() => {}) present                     |
| onDidCloseTextDocument        | updateOpenFiles()           | fire-and-forget handler               | WIRED    | updateOpenFiles(db, currentInvocationId).catch(() => {}) present                     |
| package.json main             | dist/extension.js           | main field                            | WIRED    | ./dist/extension.js in manifest; dist/extension.js exists after npm run build        |
| package.json pretest          | tsconfig.test.json          | pretest script                        | WIRED    | "pretest": "tsc -p tsconfig.test.json" added by Plan 01-08                           |
| .vscode-test.js files         | out/test/**/*.test.js       | glob                                  | WIRED    | WR-01 fixed: glob targets compiled output path                                       |
| extractCommitHash             | cli/servers/Stable-{hash}   | Strategy 2 regex                      | WIRED    | serversIdx + /^Stable-([0-9a-f]{40})$/i match present; UAT-T2/T6 fixed              |

### Data-Flow Trace (Level 4)

| Artifact            | Data Variable        | Source                                     | Produces Real Data | Status                                              |
| ------------------- | -------------------- | ------------------------------------------ | ------------------ | --------------------------------------------------- |
| extension.ts        | metadata             | collectSessionMetadata(context)            | Yes (vscode.env)   | FLOWING                                             |
| extension.ts        | currentInvocationId  | db.run INSERT result.lastID                | Yes (real DB row)  | FLOWING — CR-02 fixed, all 9 columns populated      |
| extension.ts        | openFiles            | vscode.workspace.textDocuments filter      | Yes (live API)     | FLOWING                                             |
| session.ts          | server_commit_hash   | extractCommitHash(appRoot)                 | Yes (vscode.env)   | FLOWING — dual strategy for bin/ and cli/servers/   |
| session.ts          | user_data_dir        | extractUserDataDirFromGlobalStorageUri()   | Yes (context API)  | FLOWING — WR-02 fixed with globalStorage anchor     |
| storage.ts          | scanExistingRemoteSessions | fs.readdir ~/.vscode-server/bin      | Yes (filesystem)   | FLOWING — injectable binDir, incremental dedup      |

### Behavioral Spot-Checks

| Behavior                                            | Command                                                  | Result                                        | Status |
| --------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- | ------ |
| Manifest validates (ID, extensionKind, no commands) | node -e validate manifest                                | whardier.this-code, workspace, no commands    | PASS   |
| @vscode/sqlite3 native module installed             | test -d node_modules/@vscode/sqlite3                     | directory exists with darwin-arm64 prebuilts  | PASS   |
| TypeScript strict compile                           | cd extension && npx tsc --noEmit                         | exits 0                                       | PASS   |
| CR-01 fixed: no throw-in-callback                   | grep "throw err" src/db.ts                               | 0 matches — silent-open constructor           | PASS   |
| CR-02 fixed: server_commit_hash in INSERT           | grep "server_commit_hash" src/extension.ts               | 3 matches (log, INSERT column, VALUES)        | PASS   |
| WR-02 fixed: globalStorageIdx anchor present        | grep "globalStorageIdx" src/session.ts                   | 2 matches in extractUserDataDirFromGlobalStorageUri | PASS |
| WR-01 fixed: .vscode-test.js targets out/test       | grep "out/test" .vscode-test.js                          | "out/test/**/*.test.js" confirmed             | PASS   |
| WR-01 fixed: tsconfig.test.json exists              | cat tsconfig.test.json                                   | noEmit:false, outDir:./out confirmed          | PASS   |
| WR-01 fixed: pretest script in package.json         | grep "pretest" package.json                              | "pretest": "tsc -p tsconfig.test.json"        | PASS   |
| UAT-T2/T6 fixed: Stable- pattern in session.ts      | grep "Stable-" src/session.ts                            | 5 matches including Stable- regex             | PASS   |
| UAT-T2/T6 fixed: serversIdx strategy present        | grep "serversIdx" src/session.ts                         | 7 matches (extractCommitHash + extractServerBinPath) | PASS |
| No onDidSaveTextDocument in production source       | grep onDidSaveTextDocument src/extension.ts              | 0 matches                                     | PASS   |
| dist/extension.js exists and contains new code      | test -f dist/extension.js && grep "Stable-" dist/extension.js | EXISTS; 2 matches in bundle              | PASS   |
| CI workflow matrix present                          | test -f .github/workflows/ci.yml                         | EXISTS; macos-latest, ubuntu-latest, fail-fast:false | PASS |
| PLAT-01 test: 3 parent segments (corrected from 4)  | count ".." in path.resolve call for ci.yml               | 3 segments — correct for out/test to project root | PASS |
| PLAT-01 test: process.platform guard present        | grep "process.platform" extension.test.ts                | line 511: if (process.platform !== "win32")   | PASS   |
| cli/servers test in SESSION-HELPERS suite           | grep "cli/servers" extension.test.ts                     | 2 matches (test name + path literal)          | PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                             | Status    | Evidence                                                                                                                        |
| ----------- | ----------- | ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| EXT-01      | 01-01       | Extension ID is whardier.this-code                      | SATISFIED | publisher.this-code in manifest confirmed; test suite has real assertion                                                        |
| EXT-02      | 01-01       | extensionKind: ["workspace"]                            | SATISFIED | manifest confirmed; test suite asserts                                                                                          |
| EXT-03      | 01-01       | Activates on onStartupFinished                          | SATISFIED | activationEvents confirmed; test suite asserts                                                                                  |
| EXT-04      | 01-06       | No UI — Output Channel only                             | SATISFIED | No showInformation/Warning/Error calls; OutputChannel "This Code" with log() helper gated on logLevel                          |
| EXT-05      | 01-06       | Two settings: thisCode.enable, thisCode.logLevel        | SATISFIED | Exactly two settings in manifest; test suite asserts; config.ts implements both                                                 |
| STOR-01     | 01-03       | Per-instance JSON at correct path                       | SATISFIED | writeSessionJson() writes correct JSON with all fields; getSessionJsonPath() correct; WR-02 fixed for macOS user_data_dir      |
| STOR-02     | 01-02       | SQLite in WAL mode with busy timeout                    | SATISFIED | initDatabase(): PRAGMA journal_mode=WAL, PRAGMA busy_timeout=5000, user_version=1; test has real assertion                     |
| STOR-03     | 01-02       | 11-column invocations schema                            | SATISFIED | All 11 columns in CREATE TABLE; test assertion confirms; 2 indexes (workspace_path, invoked_at)                                 |
| STOR-04     | 01-05       | Startup scan of existing sessions                       | SATISFIED | scanExistingRemoteSessions() with injectable binDir, incremental dedup, per-entry try/catch; fire-and-forget wired; 3 real tests |
| STOR-05     | 01-03       | Creates ~/.this-code/ on first activation               | SATISFIED | fs.mkdir(thisCodeDir, {recursive:true}) in activate(); writeSessionJson() also mkdir recursive; test verifies                  |
| TRACK-01    | 01-03       | Records workspace root path                             | SATISFIED | workspaceFolders[0].uri.fsPath collected; in INSERT and JSON; test verifies                                                     |
| TRACK-02    | 01-03       | Records VS Code Server commit hash                      | SATISFIED | extractCommitHash() with dual strategy (bin/{hash} + cli/servers/Stable-{hash}); CR-02 fixed: in live INSERT                   |
| TRACK-03    | 01-03       | Records user-data-dir and profile                       | SATISFIED | profile extraction via extractProfileFromGlobalStorageUri; user_data_dir fixed via WR-02 globalStorage anchor; test verifies   |
| TRACK-04    | 01-04       | Records open file manifest on open/close events         | SATISFIED | updateOpenFiles() with D-02 rebuild; both events wired fire-and-forget; filter test verifies uri.scheme=file, !isClosed logic  |
| TRACK-05    | 01-04       | Does NOT trigger on save                                | SATISFIED | No onDidSaveTextDocument in extension.ts; CI grep step enforces; test asserts statically                                       |
| PLAT-01     | 01-07       | macOS and Linux primary platforms                       | SATISFIED | CI matrix: macos-latest + ubuntu-latest, fail-fast:false; PLAT-01 test path fixed (3 segments), platform guard added           |

### Anti-Patterns Found

No blockers or warnings remain in production source files. All four previously identified anti-patterns have been resolved.

| File | Line | Pattern | Severity | Status |
| ---- | ---- | ------- | -------- | ------ |
| extension/src/db.ts | 6-9 | CR-01: throw in async DB callback | RESOLVED | Silent-open constructor: `new sqlite3.Database(dbPath)` with no callback |
| extension/src/extension.ts | 76-92 | CR-02: INSERT missing server_commit_hash, server_bin_path | RESOLVED | 9-column INSERT with all schema columns |
| extension/src/session.ts | (removed) | WR-02: indexOf("User") matches Users on macOS | RESOLVED | lastIndexOf("User", globalStorageIdx) anchored on globalStorage segment |
| extension/.vscode-test.js | 4 | WR-01: glob targets src/test/*.test.js with noEmit:true | RESOLVED | Glob now targets out/test/**/*.test.js; tsconfig.test.json + pretest added |

### Human Verification Required

#### 1. Extension Activation in Local VS Code

**Test:** Open VS Code in a local workspace with the extension sideloaded (F5 from the extension directory, or `code --extensionDevelopmentPath=extension/`). Open Output panel and select "This Code".
**Expected:** Log lines include `[info] This Code activating...`, `[info] Database initialized: ...`, `[info] Session JSON written: ...`, `[info] This Code activated successfully. Invocation ID: N` with a positive integer N. No `activation failed` line.
**Why human:** Cannot run VS Code extension host programmatically during verification.

#### 2. SSH Remote Session with cli/servers Path Structure

**Test:** Connect to an SSH Remote host using a recent VS Code version (the one that uses `cli/servers/Stable-{hash}/server` as appRoot). Check the session JSON file created.
**Expected:** `~/.vscode-server/bin/{40-hex-hash}/this-code-session.json` exists on the remote host. The `server_commit_hash` field contains the 40-char hex hash extracted from the `Stable-{hash}` segment of appRoot. `remote_name` is `"ssh-remote"`. The JSON is parseable.
**Why human:** Requires a live SSH remote VS Code session to confirm that the dual-strategy extractCommitHash() correctly extracts the hash at runtime. Code analysis confirms the logic; runtime behavior confirms extraction works against actual VS Code Server paths.

#### 3. macOS user_data_dir Runtime Correctness

**Test:** Activate the extension on macOS (local workspace). Check the `user_data_dir` field in the generated session JSON at `~/.this-code/sessions/{hash}.json`.
**Expected:** `user_data_dir` is `~/Library/Application Support/Code` (absolute path, not empty string).
**Why human:** WR-02 fix uses `lastIndexOf("User", globalStorageIdx)` — the code analysis confirms this correctly avoids the leading `/Users/` segment on macOS paths. Human confirmation required to verify the runtime globalStorageUri.fsPath format matches the expected pattern and the fix produces the correct result.

---

## Re-verification Summary

Five gaps from the previous verification have been closed:

**CR-01 (Blocker — CLOSED):** Database constructor now uses `new sqlite3.Database(dbPath)` with no callback. Open errors surface on the first `.run()` call inside `initDatabase()` and propagate to `activate()`'s existing try/catch. Verified: `grep "throw err" src/db.ts` returns 0 matches.

**CR-02 (Blocker — CLOSED):** Live-session INSERT now includes 9 columns: `workspace_path, user_data_dir, profile, local_ide_path, remote_name, remote_server_path, server_commit_hash, server_bin_path, open_files`. Both `metadata.server_commit_hash` and `metadata.remote_server_path` (as server_bin_path) are bound. Verified: grep confirms presence of `server_commit_hash` and `server_bin_path` in extension.ts INSERT.

**WR-01 (Warning — CLOSED):** Test infrastructure is now runnable: `tsconfig.test.json` exists with `noEmit:false`; `package.json` has `"pretest": "tsc -p tsconfig.test.json"`; `.vscode-test.js` glob targets `out/test/**/*.test.js`. `npm test` will now compile and invoke tests. Full test execution still requires a live VS Code extension host.

**WR-02 (Warning — CLOSED):** `extractUserDataDirFromGlobalStorageUri()` now anchors on the `globalStorage` segment first (`parts.indexOf("globalStorage")`), then uses `parts.lastIndexOf("User", globalStorageIdx)` to find the correct `User` directory without matching the leading `/Users/` segment on macOS paths. Verified: `globalStorageIdx` present in session.ts.

**UAT-T2/T6 (Gap — CLOSED):** `extractCommitHash()` and `extractServerBinPath()` now handle both path structures: Strategy 1 (`bin/{40-hex}`) and Strategy 2 (`cli/servers/Stable-{40-hex}/server`). Strategy 2 uses `lastIndexOf("servers")` and matches `/^Stable-([0-9a-f]{40})$/i` to extract the hash. The SESSION-HELPERS test suite has a third test verifying the cli/servers path routes to an SSH path. `dist/extension.js` contains `Stable-` confirming the new code is bundled.

---

_Verified: 2026-04-27T16:16:26Z_
_Verifier: Claude (gsd-verifier)_
