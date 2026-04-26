---
phase: 01-extension-core-storage-foundation
reviewed: 2026-04-26T22:08:09Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - .github/workflows/ci.yml
  - extension/.gitignore
  - extension/.vscode-test.js
  - extension/.vscodeignore
  - extension/esbuild.js
  - extension/package.json
  - extension/src/config.ts
  - extension/src/db.ts
  - extension/src/extension.ts
  - extension/src/session.ts
  - extension/src/storage.ts
  - extension/src/test/extension.test.ts
  - extension/tsconfig.json
findings:
  critical: 2
  warning: 2
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-26T22:08:09Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The Phase 1 extension core is well-structured. Intentional design decisions (fire-and-forget scan, `@vscode/sqlite3`, `extensionKind: ["workspace"]`, WAL mode, no `onDidSaveTextDocument`) are correctly implemented and are not flagged here. Two critical bugs are present: the Database constructor swallows errors silently in production (throw-in-async-callback antipattern), and the live-session INSERT omits `server_commit_hash` and `server_bin_path` columns that exist in the schema and whose values are available at insertion time. Two warnings cover a broken test-runner configuration (tests will never execute) and an ambiguous path-segment match in `extractUserDataDirFromGlobalStorageUri` that can produce wrong results on macOS.

---

## Critical Issues

### CR-01: Database constructor throws inside async callback — error is silently lost

**File:** `extension/src/db.ts:7-10`

**Issue:** `new sqlite3.Database(dbPath, callback)` calls the callback asynchronously after the constructor returns. Throwing inside that callback does not propagate to the `new Database(dbPath)` call site in `extension.ts`; instead it becomes an uncaught exception in Node's event loop. In practice the `Database` object is returned with `this.db` set to a failed handle, and subsequent `run()`/`get()` calls will fail with their own errors — but the root cause (failed open) is never surfaced to `activate()`'s `try/catch`. This also means `currentInvocationId` remains `undefined` silently, and the event handlers registered afterward call `updateOpenFiles` on a broken DB.

**Fix:** Remove the throw; reject a pending Promise from `open()`, or expose an explicit async factory:

```typescript
// Option A: silent-open constructor + async init check (simplest, matches sqlite3 idiom)
constructor(dbPath: string) {
  this.db = new sqlite3.Database(dbPath);
  // open errors surface on first .run()/.get() call via their callbacks
}

// Option B: async factory (preferred — open error is immediately catchable)
static open(dbPath: string): Promise<Database> {
  return new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(new Database(raw));
    });
  });
}
private constructor(private db: sqlite3.Database) {}
```

With Option B, `activate()` calls `await Database.open(dbPath)` and the `try/catch` there properly catches a failed open.

---

### CR-02: Live-session INSERT omits server_commit_hash and server_bin_path

**File:** `extension/src/extension.ts:77-90`

**Issue:** The INSERT for the live session omits `server_commit_hash` and `server_bin_path` columns, leaving them NULL for every active session row. Both values are available in `metadata` at insertion time (`metadata.server_commit_hash` via `collectSessionMetadata` and `metadata.remote_server_path` which is the server bin path). The schema defines these columns (see `db.ts:86-87`) and the startup scan populates them correctly (`storage.ts:75`). The inconsistency means CLI queries joining on `server_commit_hash` or `server_bin_path` will miss all live sessions.

**Fix:**

```typescript
const result = await db.run(
  `INSERT INTO invocations
   (workspace_path, user_data_dir, profile, local_ide_path,
    remote_name, remote_server_path, server_commit_hash, server_bin_path, open_files)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    metadata.workspace_path,
    metadata.user_data_dir,
    metadata.profile,
    metadata.local_ide_path,
    metadata.remote_name,
    metadata.remote_server_path,
    metadata.server_commit_hash,   // add
    metadata.remote_server_path,   // server_bin_path === remote_server_path per extractServerBinPath
    "[]",
  ],
);
```

Note: `SessionMetadata` uses `remote_server_path` for what `db.ts` calls `server_bin_path`. Confirm naming alignment or add a dedicated `server_bin_path` field to `SessionMetadata`.

---

## Warnings

### WR-01: .vscode-test.js points at .js files but tsconfig has noEmit:true — tests never run

**File:** `extension/.vscode-test.js:4`

**Issue:** The test runner config targets `src/test/**/*.test.js` — compiled JavaScript output. However `tsconfig.json` sets `"noEmit": true`, so `tsc` never emits `.js` files to `out/`. The `esbuild.js` bundle only processes `src/extension.ts` (the extension entry point) and does not compile test files. As a result `npm run test` will either find no files or fail to load them. The STOR-*, TRACK-*, SESSION-HELPERS suites in `extension.test.ts` will never execute in CI or locally.

**Fix:** Add a dedicated test-build step. One approach is a separate `tsconfig.test.json` without `noEmit`:

```json
// extension/tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./out"
  }
}
```

Then update `package.json`:
```json
"pretest": "tsc -p tsconfig.test.json",
"test": "vscode-test"
```

And update `.vscode-test.js` to point at the compiled output:
```js
files: "out/test/**/*.test.js",
```

---

### WR-02: extractUserDataDirFromGlobalStorageUri uses indexOf("User") — matches wrong segment on macOS

**File:** `extension/src/session.ts:87`

**Issue:** `parts.indexOf("User")` finds the *first* path segment named `User`. On macOS the `globalStorageUri.fsPath` is typically:

```
/Users/username/Library/Application Support/Code/User/globalStorage/...
```

`parts` will be `["", "Users", "username", "Library", "Application Support", "Code", "User", "globalStorage", ...]`.

`indexOf("User")` returns index 1 (`"Users"`), not index 6 (`"User"`). The returned user data dir would be `""` (empty join of `parts.slice(0, 1)`), which is incorrect. The correct result requires finding the last `"User"` segment (or, more robustly, the segment immediately before `"globalStorage"`).

**Fix:**

```typescript
// Replace indexOf with lastIndexOf, or key off globalStorage
const globalStorageIdx = parts.indexOf("globalStorage");
if (globalStorageIdx > 1) {
  const userIdx = parts.lastIndexOf("User", globalStorageIdx);
  if (userIdx > 0) {
    return parts.slice(0, userIdx).join(path.sep);
  }
}
```

---

## Info

### IN-01: onDidChangeWorkspaceFolders not registered — workspace_path never updated

**File:** `extension/src/extension.ts` (no registration present)

**Issue:** CLAUDE.md lists `onDidChangeWorkspaceFolders` as a handled event. It is not registered anywhere in `extension.ts`. If a user adds or removes workspace folders after activation, the `workspace_path` in the DB row and session JSON will reflect only the initial state. For single-folder workspaces that are stable this is harmless, but it diverges from the stated architecture.

**Fix:** Register the handler alongside the document handlers:

```typescript
vscode.workspace.onDidChangeWorkspaceFolders(() => {
  log("debug", "onDidChangeWorkspaceFolders — workspace_path may have changed");
  // Optionally update workspace_path in the invocations row, or re-write session JSON
}),
```

Whether to update `workspace_path` in SQLite is a product decision; at minimum the handler should be registered to align with the documented lifecycle.

---

### IN-02: config.ts double type annotation on getLogLevel

**File:** `extension/src/config.ts:14`

**Issue:** `get<LogLevel>("logLevel", "info") as LogLevel` applies both a generic type parameter and a type assertion. The `as LogLevel` cast is redundant given the generic, and VS Code's `WorkspaceConfiguration.get<T>` can still return values outside the `LogLevel` union if a user manually edits `settings.json` with an invalid value — the cast does not validate, it just silences TypeScript. The default `"info"` protects against `undefined` but not invalid string values.

**Fix:** Drop the redundant cast. If robustness against invalid settings values is desired, add a runtime guard:

```typescript
const VALID_LOG_LEVELS: LogLevel[] = ["off", "info", "debug"];
export function getLogLevel(): LogLevel {
  const raw = vscode.workspace
    .getConfiguration("thisCode")
    .get<string>("logLevel", "info");
  return VALID_LOG_LEVELS.includes(raw as LogLevel) ? (raw as LogLevel) : "info";
}
```

---

### IN-03: PLAT-01 test asserts POSIX path unconditionally — fails on Windows

**File:** `extension/src/test/extension.test.ts:512-515`

**Issue:** The test asserts `homeDir.startsWith("/")`. This will fail on Windows where `os.homedir()` returns `C:\Users\...`. CI is macOS + Linux only so this is not currently blocking, but CLAUDE.md notes "Windows best-effort" and the test comment says "runs on whatever OS executes the test suite."

**Fix:** Guard the POSIX assertion:

```typescript
if (process.platform !== "win32") {
  assert.ok(
    homeDir.startsWith("/"),
    "home dir must be an absolute POSIX path on macOS/Linux",
  );
}
```

---

_Reviewed: 2026-04-26T22:08:09Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
