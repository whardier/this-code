# Phase 1: Extension Core + Storage Foundation - Research

**Researched:** 2026-04-25
**Domain:** VS Code extension TypeScript + @vscode/sqlite3 + per-instance JSON + platform paths
**Confidence:** HIGH (stack well-established; one MEDIUM area: globalStorageUri profile parsing requires empirical validation)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (TRACK-03):** Profile ID extracted by parsing `globalStorageUri` path segments. Best-effort: null on failure. Empirically validated in Phase 1.
- **D-02 (TRACK-04):** Rebuild `open_files` from `vscode.workspace.textDocuments` on every `onDidOpenTextDocument` / `onDidCloseTextDocument` event. No debouncing.
- **D-03 (EXT-05):** Two settings only — `thisCode.enable` (boolean, default true) and `thisCode.logLevel` ("off"|"info"|"debug", default "info"). No other settings in Phase 1.
- **D-04 (STOR-01 local):** Local session JSON at `~/.this-code/sessions/{hash}.json`; hash derived from `vscode.env.appRoot` or VS Code version string.
- **D-05 (STOR-01 SSH):** Remote session JSON at `~/.vscode-server/bin/{commit-hash}/this-code-session.json`.
- **D-06 (all paths):** All storage under `~/.this-code/` — SQLite at `~/.this-code/sessions.db`, local JSONs at `~/.this-code/sessions/`, CLI binary at `~/.this-code/bin/` (Phase 2). REQUIREMENTS.md and PROJECT.md `~/.which-code/` references are superseded by D-06.
- **@vscode/sqlite3** (not better-sqlite3) — locked.
- **WAL mode + PRAGMA busy_timeout=5000** — locked.
- **esbuild bundler with `@vscode/sqlite3` as external** — locked.
- **TypeScript strict mode** — locked.
- **extensionKind: ["workspace"]** — locked.
- **onStartupFinished activation** — locked.
- **Open/close events only (not saves)** — locked.
- **invocations table schema from STACK.md** — locked.
- **open_files: rebuild from vscode.workspace.textDocuments on every event** — locked.

### Claude's Discretion

- Startup scan aggressiveness for STOR-04 (incremental, skip already-indexed paths preferred)
- Exact log lines emitted per event
- Schema migration detail (idempotent `CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version` check in `activate()`)
- Hash derivation for local session JSON filename

### Deferred Ideas (OUT OF SCOPE)

- `thisCode.dbPath` config override
- `thisCode.excludePatterns`
- Startup scan performance tuning (revisit post-Phase 1)
- CLI, shell integration, routing logic
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-01 | Extension ID `whardier.this-code`; marketplace name "This Code" | package.json manifest pattern documented |
| EXT-02 | `extensionKind: ["workspace"]` | Locked. Runs on remote host during SSH. Documented in PITFALLS.md Pitfall 9. |
| EXT-03 | Activates on `onStartupFinished` | Locked. Non-blocking; fires per window. API verified. |
| EXT-04 | No UI; config-only + OutputChannel | Standard VS Code pattern; no `contributes.commands` needed |
| EXT-05 | Two VS Code settings: `thisCode.enable` + `thisCode.logLevel` | `contributes.configuration` schema documented below |
| STOR-01 | Per-instance JSON at well-known paths | D-04 (local) and D-05 (SSH remote) define exact paths |
| STOR-02 | SQLite at `~/.this-code/sessions.db` WAL mode + busy timeout | @vscode/sqlite3 async API + PRAGMA sequence documented |
| STOR-03 | Schema: id, recorded_at, workspace_path, user_data_dir, profile, server_commit_hash, server_bin_path, open_files | invocations table schema from STACK.md; locked |
| STOR-04 | Scan `~/.vscode-server/bin/*/` at activation to index existing sessions | fs.readdir + async iteration pattern documented |
| STOR-05 | Create `~/.this-code/` directory on first activation | os.homedir() + fs.mkdir({ recursive: true }) pattern |
| TRACK-01 | Record workspace root path | `vscode.workspace.workspaceFolders[0].uri.fsPath` |
| TRACK-02 | Record VS Code Server commit hash | Parse from `vscode.env.appRoot` — path segment extraction documented |
| TRACK-03 | Record `--user-data-dir` and `--profile` via `globalStorageUri` parsing | D-01; path segment approach documented; MEDIUM confidence on profile parsing |
| TRACK-04 | Open file manifest on open/close events | D-02; rebuild from `vscode.workspace.textDocuments`; false-positive mitigation documented |
| TRACK-05 | Do NOT trigger on file save | Open/close events only; no `onDidSaveTextDocument` registration |
| PLAT-01 | macOS and Linux primary | Path differences documented; `os.homedir()` handles both |
</phase_requirements>

---

## Summary

Phase 1 builds the VS Code extension that silently records session metadata into per-instance JSON files and a SQLite index. The extension is activated via `onStartupFinished`, writes to `~/.this-code/sessions.db` (WAL mode) and per-instance JSON files, tracks open files by reading `vscode.workspace.textDocuments` on every document event, and exposes two settings to the user.

The stack is fully decided: TypeScript strict, @vscode/sqlite3 v5.1.12-vscode (with promisify wrapper), esbuild bundler marking the native module as external, and @vscode/vsce for packaging. All locked decisions from CONTEXT.md are definitive. The primary uncertainty is whether `globalStorageUri` exposes a profile-scoped path segment that can be parsed for the profile identifier — this requires empirical measurement at runtime in Phase 1 and is explicitly a best-effort/null-fallback design (D-01).

The extension project does not yet exist as TypeScript source. Phase 1 creates it from scratch: `package.json` for the extension (separate from the root `package.json` which contains only GSD), `src/extension.ts` as entrypoint, `src/db.ts` for @vscode/sqlite3 wrapper, `src/session.ts` for session record logic, `src/storage.ts` for file I/O, and build configuration files. All commitizen conventional commit requirements apply from the first commit.

**Primary recommendation:** Scaffold the extension under an `extension/` subdirectory at the project root, keeping it isolated from the Rust CLI (Phase 2) and the root GSD package.json. Use `os.homedir()` for platform-agnostic path construction throughout.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session recording (invocation row) | Extension (workspace host) | — | Extension runs where the workspace is; VS Code APIs for path/env only available here |
| SQLite schema creation + WAL setup | Extension (workspace host) | — | Extension is sole writer; CLI is reader-only |
| Per-instance JSON file write | Extension (workspace host) | — | Collocated with VS Code Server binary on same filesystem |
| Open file tracking | Extension (workspace host) | — | `vscode.workspace.textDocuments` only accessible in extension host |
| Startup scan of existing sessions | Extension (workspace host) | — | Needs filesystem access to `~/.vscode-server/bin/*/` on the host where it activates |
| Configuration settings | VS Code (contributes.configuration) | Extension reads via `vscode.workspace.getConfiguration` | Settings surface is VS Code's responsibility; extension reads and respects |
| Path construction (home dir) | Extension (Node.js os.homedir) | — | Platform-agnostic; works on macOS, Linux, SSH remote host |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.7 [VERIFIED: npm 6.0.3 current] | Extension language | Strict mode required; VS Code extension convention |
| @types/vscode | ^1.75.0 [VERIFIED: npm 1.116.0 current] | VS Code API types | Pin to minimum engine, not latest — avoids using APIs unavailable on older editors |
| @vscode/sqlite3 | ^5.1.12-vscode [VERIFIED: npm 5.1.12-vscode current] | SQLite access | Microsoft-maintained Node-API fork; ABI-stable across Electron; only viable native SQLite option |
| esbuild | ^0.28.0 [VERIFIED: npm 0.28.0 current] | Bundler | Official VS Code recommendation; marks native modules as external |
| @vscode/vsce | ^3.9.0 [VERIFIED: npm 3.9.1 current] | VSIX packaging | Official CLI for platform-targeted VSIX builds |

### Supporting (dev)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vscode/test-cli | ^0.0.12 [VERIFIED: npm 0.0.12] | Test runner | Extension integration tests run inside VS Code |
| @vscode/test-electron | ^2.5.2 [VERIFIED: npm 2.5.2] | Test host | Provides real VS Code instance for test execution |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @vscode/sqlite3 | better-sqlite3 | better-sqlite3 has NODE_MODULE_VERSION mismatch with Electron; rejected |
| @vscode/sqlite3 | sql.js | In-memory only; no WAL; no concurrent CLI access; rejected |
| esbuild | webpack | esbuild simpler, faster, officially recommended; webpack has no advantage here |

**Installation (extension directory):**
```bash
npm install @vscode/sqlite3
npm install -D typescript @types/vscode esbuild @vscode/vsce @vscode/test-cli @vscode/test-electron
```

---

## Architecture Patterns

### System Architecture Diagram

```
  activate()
     │
     ├─ ensure ~/.this-code/ exists (fs.mkdir recursive)
     │
     ├─ open/create ~/.this-code/sessions.db (@vscode/sqlite3)
     │    ├─ PRAGMA journal_mode=WAL
     │    ├─ PRAGMA busy_timeout=5000
     │    └─ CREATE TABLE IF NOT EXISTS invocations (schema migration)
     │
     ├─ collect session metadata
     │    ├─ vscode.workspace.workspaceFolders[0].uri.fsPath  → workspace_path
     │    ├─ vscode.env.appRoot → parse commit hash          → server_commit_hash
     │    ├─ vscode.env.appRoot → derive server_bin_path
     │    ├─ vscode.env.remoteName                           → remote_name
     │    ├─ globalStorageUri → parse path segments          → profile (null on failure)
     │    └─ globalStorageUri → parse user_data_dir segment  → user_data_dir
     │
     ├─ write per-instance JSON
     │    ├─ SSH remote: ~/.vscode-server/bin/{hash}/this-code-session.json
     │    └─ local:      ~/.this-code/sessions/{hash}.json
     │
     ├─ INSERT INTO invocations (initial row with open_files='[]')
     │
     ├─ startup scan: readdir ~/.vscode-server/bin/*/
     │    └─ for each this-code-session.json found: index into SQLite if not present
     │
     └─ register event listeners
          ├─ onDidOpenTextDocument  → rebuild open_files from textDocuments → UPDATE invocations
          ├─ onDidCloseTextDocument → rebuild open_files from textDocuments → UPDATE invocations
          └─ onDidChangeWorkspaceFolders → update workspace_path

  deactivate()
     └─ db.close() (best-effort)
```

### Recommended Project Structure

```
extension/                      # VS Code extension (Phase 1)
├── package.json                # Extension manifest (NOT the root package.json)
├── tsconfig.json               # TypeScript config (noEmit: true, esbuild transpiles)
├── esbuild.js                  # Build script
├── .vscodeignore               # VSIX packaging exclusions
├── src/
│   ├── extension.ts            # activate() / deactivate() entrypoint
│   ├── db.ts                   # @vscode/sqlite3 promise wrapper + schema
│   ├── session.ts              # Session metadata collection (appRoot parse, etc.)
│   ├── storage.ts              # JSON file write, directory creation, startup scan
│   └── config.ts               # thisCode.enable / thisCode.logLevel read
└── dist/                       # esbuild output (gitignored)
    └── extension.js

.planning/                      # GSD planning artifacts (existing)
scripts/                        # Dev setup (existing)
package.json                    # Root: GSD dependency only (existing)
prek.toml                       # Git hooks (existing)
```

**Note:** The extension lives under `extension/` at the project root, not at the root itself. The root `package.json` contains only GSD. The extension has its own `package.json`.

### Pattern 1: @vscode/sqlite3 Promise Wrapper

`@vscode/sqlite3` uses a callback API (inherited from node-sqlite3). This wrapper converts it to async/await for use in the extension. [VERIFIED: node-sqlite3 API documentation]

```typescript
// Source: STACK.md + node-sqlite3 API pattern
import sqlite3 from '@vscode/sqlite3';
import * as path from 'path';
import * as os from 'os';

export class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) throw err;
    });
  }

  run(sql: string, params: unknown[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err: Error | null, row: T) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err: Error | null, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
```

### Pattern 2: Database Initialization Sequence

The activation sequence must run PRAGMAs before any DDL. [VERIFIED: SQLite WAL documentation + STACK.md]

```typescript
// Source: STACK.md schema + SQLite WAL docs
async function initDatabase(db: Database): Promise<void> {
  // Step 1: WAL mode (must be first)
  await db.run('PRAGMA journal_mode=WAL');
  // Step 2: Busy timeout for concurrent access from CLI
  await db.run('PRAGMA busy_timeout=5000');
  // Step 3: Schema migration — idempotent
  const currentVersion = await db.get<{ user_version: number }>('PRAGMA user_version');
  if ((currentVersion?.user_version ?? 0) < 1) {
    await db.run(`CREATE TABLE IF NOT EXISTS invocations (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      invoked_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
      workspace_path     TEXT,
      user_data_dir      TEXT,
      profile            TEXT,
      local_ide_path     TEXT    NOT NULL,
      remote_name        TEXT,
      remote_server_path TEXT,
      open_files         TEXT    NOT NULL DEFAULT '[]'
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_invocations_workspace
      ON invocations(workspace_path)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_invocations_time
      ON invocations(invoked_at DESC)`);
    await db.run('PRAGMA user_version = 1');
  }
}
```

### Pattern 3: Server Commit Hash Extraction from appRoot

`vscode.env.appRoot` returns the application root. For local VS Code: `/.../VS Code.app/Contents/Resources/app`. For SSH remote: `~/.vscode-server/bin/{40-char-hex-hash}/resources/app`.

The commit hash is the directory segment immediately after `bin/`. [VERIFIED: vscode-server installation gist + search results confirming path format `~/.vscode-server/bin/${git_cid}`]

```typescript
// Source: vscode-server path structure, confirmed by multiple sources
import * as path from 'path';
import * as vscode from 'vscode';

function extractCommitHash(appRoot: string): string | null {
  // appRoot for SSH remote: /home/user/.vscode-server/bin/{hash}/resources/app
  // We want the segment immediately after 'bin/'
  const parts = appRoot.split(path.sep);
  const binIdx = parts.lastIndexOf('bin');
  if (binIdx >= 0 && binIdx + 1 < parts.length) {
    const candidate = parts[binIdx + 1];
    // Commit hashes are 40-char hex strings
    if (/^[0-9a-f]{40}$/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractServerBinPath(appRoot: string): string {
  // For SSH remote: ~/.vscode-server/bin/{hash}
  // For local: the appRoot itself (best available)
  const parts = appRoot.split(path.sep);
  const binIdx = parts.lastIndexOf('bin');
  if (binIdx >= 0 && binIdx + 1 < parts.length) {
    const candidate = parts[binIdx + 1];
    if (/^[0-9a-f]{40}$/i.test(candidate)) {
      return parts.slice(0, binIdx + 2).join(path.sep);
    }
  }
  return appRoot;
}

function deriveLocalSessionHash(appRoot: string): string {
  // For local sessions: use last path segment of appRoot as hash basis
  // Stable: VS Code doesn't change appRoot within a version
  // Collision-safe: appRoot is unique per installation
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(appRoot).digest('hex').slice(0, 16);
}
```

### Pattern 4: globalStorageUri Profile Parsing

`globalStorageUri` is a `vscode.Uri`. Its `fsPath` for the default profile looks like:
- macOS: `~/Library/Application Support/Code/User/globalStorage/whardier.this-code`
- Linux: `~/.config/Code/User/globalStorage/whardier.this-code`
- SSH remote: `~/.vscode-server/data/User/globalStorage/whardier.this-code`

For non-default profiles, the VS Code internal storage uses `User/profiles/{hash}/` but **`globalStorageUri` does not change per profile** (per issue #160466, closed as not planned). The navigate-up workaround (`../../profiles/`) navigates to the profiles list but does not reveal which profile is currently active.

[VERIFIED: github.com/microsoft/vscode/issues/160466 closed not planned; github.com/microsoft/vscode/issues/211890 closed out-of-scope; search results confirm behavior]

**Practical approach for D-01:**

```typescript
// Source: Based on D-01 decision + VS Code path structure analysis
// CONFIDENCE: MEDIUM — actual profile hash in path requires empirical validation
import * as vscode from 'vscode';
import * as path from 'path';

function extractProfileFromGlobalStorageUri(
  globalStorageUri: vscode.Uri
): string | null {
  // Path segments: [..., 'User', 'profiles', '{hash}', 'globalStorage', 'whardier.this-code']
  // OR (default profile): [..., 'User', 'globalStorage', 'whardier.this-code']
  const fsPath = globalStorageUri.fsPath;
  const parts = fsPath.split(path.sep);

  // Look for 'profiles' segment — present only when a non-default profile is active
  // (IF VS Code actually scopes globalStorageUri per profile in newer versions)
  const profilesIdx = parts.indexOf('profiles');
  if (profilesIdx >= 0 && profilesIdx + 1 < parts.length) {
    const hashCandidate = parts[profilesIdx + 1];
    // Profile IDs are short hex hashes (e.g., 8 chars like "23d1e380")
    if (/^[0-9a-f]{4,32}$/i.test(hashCandidate)) {
      return hashCandidate;
    }
  }

  // Default profile or parsing failed — return null per D-01
  return null;
}

function extractUserDataDirFromGlobalStorageUri(
  globalStorageUri: vscode.Uri
): string | null {
  // The user data dir is the segment before 'User'
  // macOS: ~/Library/Application Support/Code  →  the 'Code' part
  // Linux: ~/.config/Code                       →  the 'Code' part
  // Pattern: find 'User' segment, parent is user data dir
  const fsPath = globalStorageUri.fsPath;
  const parts = fsPath.split(path.sep);
  const userIdx = parts.indexOf('User');
  if (userIdx > 0) {
    return parts.slice(0, userIdx).join(path.sep);
  }
  return null;
}
```

**Important empirical note:** During Phase 1, log the actual `globalStorageUri.fsPath` to the OutputChannel on activation. This reveals whether VS Code is scoping the path per profile in the current version. If no `profiles` segment is present, profile is always null — this is acceptable per D-01.

### Pattern 5: Per-Instance JSON File Path

```typescript
// Source: D-04 and D-05 from CONTEXT.md
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

function getSessionJsonPath(
  remoteName: string | undefined,
  commitHash: string | null,
  localSessionHash: string
): string {
  if (remoteName && commitHash) {
    // SSH remote: collocated with VS Code Server binary
    return path.join(
      os.homedir(),
      '.vscode-server',
      'bin',
      commitHash,
      'this-code-session.json'
    );
  } else {
    // Local session
    return path.join(
      os.homedir(),
      '.this-code',
      'sessions',
      `${localSessionHash}.json`
    );
  }
}
```

### Pattern 6: Open File Tracking (D-02)

`onDidCloseTextDocument` fires on language mode changes (close+open for the same document). Reading `vscode.workspace.textDocuments` on every event gives the authoritative live list and naturally handles false positives. [VERIFIED: github.com/microsoft/vscode/issues/102737 — `doc.isClosed` is false on language change close event]

```typescript
// Source: D-02 decision + issue #102737 confirmation
import * as vscode from 'vscode';

function buildOpenFilesList(): string[] {
  return vscode.workspace.textDocuments
    .filter(doc => !doc.isClosed && doc.uri.scheme === 'file')
    .map(doc => doc.uri.fsPath);
}

// Called in both event handlers — rebuild, don't increment
async function updateOpenFiles(db: Database, rowId: number): Promise<void> {
  const openFiles = buildOpenFilesList();
  await db.run(
    'UPDATE invocations SET open_files = ? WHERE id = ?',
    [JSON.stringify(openFiles), rowId]
  );
}
```

**Why `uri.scheme === 'file'` filter:** Virtual documents (scheme `untitled`, `git`, `output`) appear in `textDocuments` but are not filesystem paths. Filter to `file://` URIs for the open files manifest.

### Pattern 7: Startup Scan (STOR-04)

Scan `~/.vscode-server/bin/*/this-code-session.json` at activation to index existing sessions. Use incremental approach (skip already-indexed paths) per Claude's Discretion. [VERIFIED: Node.js fs.readdir async API]

```typescript
// Source: Node.js fs API + STOR-04 requirement
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function scanExistingRemoteSessions(db: Database): Promise<void> {
  const vscodeServerBin = path.join(os.homedir(), '.vscode-server', 'bin');

  let entries: string[];
  try {
    entries = await fs.readdir(vscodeServerBin);
  } catch {
    // ~/.vscode-server/bin doesn't exist — local-only machine, skip silently
    return;
  }

  for (const entry of entries) {
    const sessionFile = path.join(vscodeServerBin, entry, 'this-code-session.json');
    try {
      const raw = await fs.readFile(sessionFile, 'utf-8');
      const session = JSON.parse(raw);

      // Check if already indexed (use server_commit_hash as dedup key)
      const existing = await db.get<{ id: number }>(
        'SELECT id FROM invocations WHERE remote_server_path = ? LIMIT 1',
        [path.join(vscodeServerBin, entry)]
      );
      if (existing) continue; // already indexed

      // Insert historical record
      await db.run(
        `INSERT INTO invocations
         (workspace_path, user_data_dir, profile, local_ide_path,
          remote_name, remote_server_path, open_files)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          session.workspace_path ?? null,
          session.user_data_dir ?? null,
          session.profile ?? null,
          session.local_ide_path ?? '',
          session.remote_name ?? null,
          path.join(vscodeServerBin, entry),
          JSON.stringify(session.open_files ?? []),
        ]
      );
    } catch {
      // Missing file or malformed JSON — skip this entry
    }
  }
}
```

### Pattern 8: Configuration Access

```typescript
// Source: VS Code contributes.configuration API pattern [VERIFIED: official docs]
import * as vscode from 'vscode';

function isEnabled(): boolean {
  return vscode.workspace.getConfiguration('thisCode').get('enable', true);
}

type LogLevel = 'off' | 'info' | 'debug';

function getLogLevel(): LogLevel {
  return vscode.workspace.getConfiguration('thisCode').get('logLevel', 'info') as LogLevel;
}
```

### Pattern 9: Extension Manifest (package.json)

The extension `package.json` is separate from the root `package.json`. [VERIFIED: VS Code extension manifest spec]

```json
{
  "name": "this-code",
  "displayName": "This Code",
  "description": "Session tracking for VS Code launch context and open file manifests",
  "version": "0.1.0",
  "publisher": "whardier",
  "engines": { "vscode": "^1.75.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "extensionKind": ["workspace"],
  "contributes": {
    "configuration": {
      "title": "This Code",
      "properties": {
        "thisCode.enable": {
          "type": "boolean",
          "default": true,
          "description": "Enable session recording."
        },
        "thisCode.logLevel": {
          "type": "string",
          "enum": ["off", "info", "debug"],
          "default": "info",
          "description": "Output channel verbosity."
        }
      }
    }
  }
}
```

**Key manifest notes:**
- `engines.vscode: "^1.75.0"` — minimum for profile support and stable `globalStorageUri`
- `activationEvents: ["onStartupFinished"]` — non-blocking; fires after every window loads
- `extensionKind: ["workspace"]` — runs on the machine where files are (local or SSH remote)
- No `contributes.commands` — purely passive extension

### Pattern 10: esbuild Configuration

```javascript
// Source: STACK.md (locked) + VS Code bundling guide [VERIFIED: official docs]
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode', '@vscode/sqlite3'],  // CRITICAL: native module must be external
    logLevel: 'warning',
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
```

### Pattern 11: .vscodeignore

```
.vscode/**
.vscode-test/**
src/**
out/**
node_modules/**
!node_modules/@vscode/sqlite3/**
*.ts
tsconfig.json
esbuild.js
.gitignore
```

**Critical:** `!node_modules/@vscode/sqlite3/**` must NOT be ignored — it contains the prebuilt native binary that VSIX must include. All other node_modules are bundled by esbuild.

### Anti-Patterns to Avoid

- **Using `better-sqlite3`:** NODE_MODULE_VERSION mismatch with Electron. Rejected definitively.
- **Bundling `@vscode/sqlite3` with esbuild:** Native `.node` files cannot be inlined. Mark as external always.
- **Using `globalStorageUri` as primary session DB path:** Varies by remote/profile/platform; CLI cannot discover it.
- **`"*"` activation event:** Blocks VS Code startup. Use `onStartupFinished`.
- **`extensionKind: ["ui"]`:** Extension won't see remote workspace file events. Use `"workspace"` only.
- **Incrementally tracking open_files (add on open, remove on close):** Language mode changes fire spurious close events. Rebuild from `textDocuments` instead.
- **Synchronous DB operations:** @vscode/sqlite3 is async-only; blocking would freeze the extension host.
- **Holding write transactions open:** Keep INSERT/UPDATE transactions short; WAL still has one writer at a time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite binding for VS Code/Electron | Custom Node-API native addon | `@vscode/sqlite3` v5.1.12-vscode | Microsoft maintains prebuilts for all 6 platform targets |
| Promise wrapper for callback API | Complex promisify chains | ~20-line wrapper class (Pattern 1 above) | The wrapper is simple enough to own; no third-party needed |
| Platform path resolution | Custom HOME env var parsing | `os.homedir()` (Node.js built-in) | Handles macOS, Linux, SSH remote host correctly |
| VSIX packaging | Custom zip assembly | `@vscode/vsce package --target` | Handles manifest validation, native module inclusion |
| Conventional commit validation | Custom git hook script | commitizen + prek (already configured) | `prek.toml` already sets this up |

**Key insight:** The hard part is SQLite inside Electron — @vscode/sqlite3 solves it completely. Everything else is Node.js built-ins and small wrappers.

---

## Common Pitfalls

### Pitfall 1: root package.json collision

**What goes wrong:** Running `npm install @vscode/sqlite3` at the project root pollutes the root `package.json` (which only contains GSD). The extension must have its own `package.json` under `extension/`.
**Why it happens:** Greenfield — no extension directory exists yet.
**How to avoid:** Create `extension/` directory first; run all npm commands from there.
**Warning signs:** `@vscode/sqlite3` appearing in root `node_modules`.

### Pitfall 2: @vscode/sqlite3 not included in VSIX

**What goes wrong:** `.vscodeignore` ignores all of `node_modules/` but doesn't restore `@vscode/sqlite3`. Extension activates fine in dev but fails when installed from VSIX.
**Why it happens:** esbuild bundles JS dependencies but cannot bundle `.node` binary.
**How to avoid:** The `.vscodeignore` pattern `!node_modules/@vscode/sqlite3/**` must be present (Pattern 11 above).
**Warning signs:** Extension activates in dev workspace (`F5`) but errors on VSIX install: "Cannot find module '@vscode/sqlite3'".

### Pitfall 3: WAL mode PRAGMA order

**What goes wrong:** Running `CREATE TABLE` before `PRAGMA journal_mode=WAL` creates the database in rollback journal mode. Changing mode afterward requires all connections to be closed.
**Why it happens:** Initialization code runs DDL before PRAGMAs.
**How to avoid:** Always run WAL PRAGMA first, then busy_timeout, then schema DDL (Pattern 2 above).
**Warning signs:** DB file is smaller than expected (no `-wal` file beside it on second run).

### Pitfall 4: onDidCloseTextDocument false positives

**What goes wrong:** Language detection fires `setTextDocumentLanguage()` internally, which triggers `onDidCloseTextDocument` with `doc.isClosed === false`. If you maintain an incremental set, files briefly disappear from `open_files`.
**Why it happens:** VS Code language detection is asynchronous and can run after a document opens, firing a re-open event pair.
**How to avoid:** Always rebuild from `vscode.workspace.textDocuments` (D-02). Filter to `uri.scheme === 'file'`. [VERIFIED: github.com/microsoft/vscode/issues/102737]
**Warning signs:** SQLite `open_files` column shows files missing immediately after they were opened.

### Pitfall 5: appRoot hash extraction fails for local VS Code

**What goes wrong:** On local macOS, `vscode.env.appRoot` is something like `/Applications/Visual Studio Code.app/Contents/Resources/app` — there's no `bin/{40-hex-hash}` segment. `extractCommitHash()` returns null.
**Why it happens:** Local VS Code doesn't use the vscode-server binary layout.
**How to avoid:** The null return is correct for local sessions. Local sessions use the `deriveLocalSessionHash()` fallback (Pattern 3). The `server_commit_hash` column can be null in the schema.
**Warning signs:** `local_ide_path` is populated but `server_commit_hash` is null — this is expected for local sessions.

### Pitfall 6: Startup scan blocks activation

**What goes wrong:** Scanning `~/.vscode-server/bin/*/` synchronously, or waiting for all inserts to complete before returning from `activate()`, delays the extension activation measurably.
**Why it happens:** `activate()` is awaited by VS Code; long-running async work inside it delays other extensions.
**How to avoid:** Run the startup scan as a fire-and-forget after inserting the current invocation row. Do NOT `await` the scan inside `activate()`. Use a try/catch wrapper so scan errors don't fail activation.
**Warning signs:** Extension appears in VS Code's "Startup Performance" slow list.

### Pitfall 7: Commitizen hook rejects non-conventional commits

**What goes wrong:** The first commit of the extension files is rejected because the commit message doesn't follow conventional commits format.
**Why it happens:** `prek.toml` configures commitizen's `commit-msg` hook, which is active from the start.
**How to avoid:** Use `feat(extension):` or `chore(extension):` prefix for all Phase 1 commits. The `git commit -m "feat(extension): scaffold extension project structure"` pattern works.
**Warning signs:** `prek` rejects commit with "commit message does not match the commitizen format".

---

## Code Examples

### Activation Entrypoint Structure

```typescript
// Source: VS Code extension API pattern + Phase 1 requirements
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Database, initDatabase } from './db';
import { collectSessionMetadata, getSessionJsonPath } from './session';
import { writeSessionJson, scanExistingRemoteSessions } from './storage';
import { isEnabled, getLogLevel } from './config';

let db: Database | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let currentInvocationId: number | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('This Code');
  context.subscriptions.push(outputChannel);

  if (!isEnabled()) {
    outputChannel.appendLine('[info] This Code is disabled via thisCode.enable setting.');
    return;
  }

  try {
    // 1. Ensure ~/.this-code/ exists
    const thisCodeDir = path.join(os.homedir(), '.this-code');
    await fs.mkdir(thisCodeDir, { recursive: true });
    await fs.mkdir(path.join(thisCodeDir, 'sessions'), { recursive: true });

    // 2. Open and initialize SQLite
    const dbPath = path.join(thisCodeDir, 'sessions.db');
    db = new Database(dbPath);
    await initDatabase(db);

    // 3. Collect session metadata
    const metadata = collectSessionMetadata(context);

    // 4. Write per-instance JSON
    const sessionJsonPath = getSessionJsonPath(metadata);
    await writeSessionJson(sessionJsonPath, metadata);

    // 5. Insert current invocation
    const result = await db.run(
      `INSERT INTO invocations
       (workspace_path, user_data_dir, profile, local_ide_path,
        remote_name, remote_server_path, open_files)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        metadata.workspace_path,
        metadata.user_data_dir,
        metadata.profile,
        metadata.local_ide_path,
        metadata.remote_name,
        metadata.remote_server_path,
        '[]',
      ]
    );
    currentInvocationId = result.lastID;

    // 6. Register document event listeners
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(() => {
        if (db && currentInvocationId !== undefined) {
          updateOpenFiles(db, currentInvocationId);
        }
      }),
      vscode.workspace.onDidCloseTextDocument(() => {
        if (db && currentInvocationId !== undefined) {
          updateOpenFiles(db, currentInvocationId);
        }
      })
    );

    // 7. Startup scan — fire and forget (do not await)
    scanExistingRemoteSessions(db).catch(err => {
      outputChannel?.appendLine(`[info] Startup scan error: ${err.message}`);
    });

    outputChannel.appendLine(`[info] This Code activated. Invocation ID: ${currentInvocationId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`[info] This Code activation failed: ${msg}`);
    // Fail silently — never crash VS Code
  }
}

export async function deactivate(): Promise<void> {
  try {
    await db?.close();
  } catch {
    // Best-effort close
  }
}

async function updateOpenFiles(db: Database, rowId: number): Promise<void> {
  const openFiles = vscode.workspace.textDocuments
    .filter(doc => !doc.isClosed && doc.uri.scheme === 'file')
    .map(doc => doc.uri.fsPath);
  try {
    await db.run(
      'UPDATE invocations SET open_files = ? WHERE id = ?',
      [JSON.stringify(openFiles), rowId]
    );
  } catch {
    // DB error during update — log and continue
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `better-sqlite3` in VS Code extensions | `@vscode/sqlite3` Node-API prebuilts | VS Code adopted Node-API (N-API) ~2019-2020 | better-sqlite3 permanently broken for Marketplace distribution |
| `"*"` activation event | `"onStartupFinished"` | VS Code 1.54 (Mar 2021) | `"*"` now shows performance warning in extension review |
| webpack bundler | esbuild | VS Code docs updated ~2022 | esbuild is now the official recommendation; simpler config |
| `globalStoragePath` (string) | `globalStorageUri` (Uri object) | VS Code 1.55 (Apr 2021) | Use `.fsPath` property to get string path |

**Deprecated/outdated:**
- `context.globalStoragePath` (string): Deprecated in favor of `context.globalStorageUri` (Uri). Use `.fsPath` to get the path string.
- `activationEvents: ["*"]`: Causes activation performance warnings. Use `"onStartupFinished"`.

---

## Runtime State Inventory

Not applicable — this is a greenfield phase with no existing runtime state. The extension does not yet exist; no sessions, no SQLite database, no JSON files.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Extension build, npm | ✓ | v24.15.0 [VERIFIED] | — |
| npm | Package install | ✓ | 11.12.1 [VERIFIED] | — |
| TypeScript | Type checking | install via npm | — | — |
| esbuild | Bundling | install via npm | — | — |
| @vscode/sqlite3 | SQLite access | install via npm | 5.1.12-vscode | — |
| Rust | Phase 2 CLI only | Not verified | — | N/A (Phase 2) |
| prek | Git hooks | ✓ (existing prek.toml) | — [ASSUMED] | — |
| VS Code (dev instance) | Extension testing | ✓ | developer machine | — |

**Missing dependencies with no fallback:**
- None that block Phase 1 execution.

**Missing dependencies with fallback:**
- TypeScript, esbuild, @vscode/sqlite3: installed via npm during scaffolding — not pre-installed but installation is a task step.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | @vscode/test-cli + @vscode/test-electron |
| Config file | None yet — Wave 0 creates `.vscode-test.js` |
| Quick run command | `npm run test` (from extension/) |
| Full suite command | `npm run test` (same; single suite in Phase 1) |

**Note:** VS Code extension testing requires a running VS Code instance (via @vscode/test-electron). Tests are integration tests, not unit tests — they run inside a real extension host. This means there is no sub-second unit test loop. Tests for Phase 1 verify activation succeeds, SQLite is created, and invocation rows are inserted.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-01 | Extension ID is `whardier.this-code` | manifest check | `node -e "require('./extension/package.json').publisher+'.'+require('./extension/package.json').name"` | ❌ Wave 0 |
| EXT-02 | extensionKind: ["workspace"] in manifest | manifest check | static JSON assertion | ❌ Wave 0 |
| EXT-03 | Activates on onStartupFinished | integration | @vscode/test-electron activation test | ❌ Wave 0 |
| EXT-04 | No contributes.commands in manifest | manifest check | static JSON assertion | ❌ Wave 0 |
| EXT-05 | Two settings registered | manifest check | static JSON assertion on contributes.configuration | ❌ Wave 0 |
| STOR-01 | JSON file written at correct path | integration | check file exists after activation | ❌ Wave 0 |
| STOR-02 | SQLite at ~/.this-code/sessions.db with WAL | integration | sqlite3 CLI: `PRAGMA journal_mode;` → "wal" | ❌ Wave 0 |
| STOR-03 | Schema columns present | integration | `PRAGMA table_info(invocations)` | ❌ Wave 0 |
| STOR-04 | Startup scan indexes existing sessions | integration | pre-seed JSON file; activate; check SQLite row | ❌ Wave 0 |
| STOR-05 | ~/.this-code/ created on activation | integration | check directory exists | ❌ Wave 0 |
| TRACK-01 | workspace_path recorded | integration | query SQLite after activation | ❌ Wave 0 |
| TRACK-02 | server_commit_hash extracted | integration | query SQLite; check 40-hex or null | ❌ Wave 0 |
| TRACK-03 | user_data_dir in SQLite; profile null-safe | integration | query SQLite; no exception on any path | ❌ Wave 0 |
| TRACK-04 | open_files updates on document event | integration | open document; query SQLite open_files | ❌ Wave 0 |
| TRACK-05 | No onDidSaveTextDocument registration | static | grep src/ for onDidSaveTextDocument | ❌ Wave 0 |
| PLAT-01 | macOS and Linux paths correct | integration | run on macOS (CI) + Linux (CI) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node -e "require('./extension/package.json')"` (manifest smoke check)
- **Per wave merge:** `npm run test` (full integration suite) — requires VS Code installed on CI
- **Phase gate:** Full suite green + manual VSIX install test before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `extension/` directory does not exist — create scaffold
- [ ] `extension/package.json` — does not exist
- [ ] `extension/src/extension.ts` — does not exist
- [ ] `extension/.vscode-test.js` — test runner config
- [ ] `extension/src/test/` — integration test directory
- [ ] Framework install: `cd extension && npm install` — not yet run

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Extension has no auth surface |
| V3 Session Management | No | Sessions are internal state, not user sessions |
| V4 Access Control | No | No multi-user or permission model |
| V5 Input Validation | Yes | Parse `globalStorageUri` path defensively; validate commit hash regex before use |
| V6 Cryptography | No | SHA-256 hash for local session filename is non-cryptographic use; collision safety sufficient |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via appRoot parsing | Tampering | Validate commit hash is 40-char hex before using in path construction |
| SQLite injection via open file paths | Tampering | Use parameterized queries (Pattern 1) — never string interpolation |
| Symlink attack on ~/.this-code/ | Tampering | `fs.mkdir({ recursive: true })` is safe; avoid following symlinks in startup scan |
| JSON parsing of session files (startup scan) | Information disclosure | Wrap in try/catch; never expose parse errors to UI |

**Key note:** This extension has no network access, no user authentication, and no command surface. The attack surface is limited to filesystem operations.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `globalStorageUri` for non-default profiles includes a `profiles/{hash}` path segment that can be parsed | Pattern 4 (globalStorageUri parsing) | Profile column always null — acceptable per D-01 null-fallback design |
| A2 | `vscode.env.appRoot` for SSH remote sessions follows `~/.vscode-server/bin/{40-hex}/resources/app` pattern | Pattern 3 (commit hash extraction) | Commit hash extraction returns null; local_ide_path still populated |
| A3 | `prek` is installed on the developer machine | Environment Availability | First commit fails git hook; need `prek install` first |
| A4 | VS Code 1.75+ is available on CI/test machines for @vscode/test-electron integration tests | Validation Architecture | Integration tests cannot run; manual verification only |

**Assumptions A1 and A2 are designed to fail gracefully** — both return null and log via OutputChannel. The extension records null in the database rather than crashing. The CONTEXT.md D-01 decision explicitly requires empirical validation of A1 during Phase 1.

---

## Open Questions

1. **Does `globalStorageUri` actually contain a `profiles/` segment for non-default profiles?**
   - What we know: Issue #160466 (closed not planned) says globalStorageUri returns default profile path always. But some VS Code versions may have changed this behavior.
   - What's unclear: Whether any current VS Code version (1.75+) does include the profile hash in the globalStorageUri path for non-default profiles.
   - Recommendation: Log `globalStorageUri.fsPath` to OutputChannel on activation. The planner should include a task to test with a non-default profile during Phase 1 integration testing.

2. **How should the local session hash (D-04) be derived?**
   - What we know: A SHA-256 of `vscode.env.appRoot` truncated to 16 chars is stable and collision-safe for the number of local installations.
   - What's unclear: Whether `appRoot` is stable across VS Code restarts on the same installation (it should be, but not verified empirically).
   - Recommendation: Use SHA-256(appRoot).slice(0, 16) as Claude's discretion. Log the derived hash to OutputChannel for debuggability.

3. **Should `open_files` updates be fire-and-forget or awaited?**
   - What we know: If DB updates are slow (rare), awaited updates inside event handlers could queue up.
   - What's unclear: Whether @vscode/sqlite3 queues operations automatically or requires explicit serialize().
   - Recommendation: Fire-and-forget with error logging. The db.serialize() method exists in node-sqlite3 but is not needed here since we're using short independent UPDATE queries.

---

## Sources

### Primary (HIGH confidence)
- [STACK.md](./../research/STACK.md) — Locked schema, esbuild config, tsconfig, package.json manifest, @vscode/sqlite3 wrapper
- [PITFALLS.md](./../research/PITFALLS.md) — 12 pitfalls; Pitfalls 1, 2, 4, 7, 8, 9, 11 directly relevant
- [CONTEXT.md](./01-CONTEXT.md) — Locked decisions D-01 through D-06
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) — `onStartupFinished` behavior [VERIFIED]
- [VS Code Remote Extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions) — extensionKind, storage in remote hosts [VERIFIED]
- [SQLite WAL Documentation](https://sqlite.org/wal.html) — journal_mode, busy_timeout, concurrent access [VERIFIED]
- [@vscode/sqlite3 npm](https://www.npmjs.com/package/@vscode/sqlite3) — v5.1.12-vscode current [VERIFIED]
- [node-sqlite3 API docs](https://github.com/tryghost/node-sqlite3) — run(), all(), get(), callback pattern [VERIFIED]
- npm registry — all package versions verified [VERIFIED]

### Secondary (MEDIUM confidence)
- [github.com/microsoft/vscode/issues/160466](https://github.com/microsoft/vscode/issues/160466) — globalStorageUri doesn't respect active profile, closed not planned [VERIFIED status]
- [github.com/microsoft/vscode/issues/211890](https://github.com/microsoft/vscode/issues/211890) — Profiles API closed out-of-scope; navigate-up workaround mentioned [VERIFIED status]
- [github.com/microsoft/vscode/issues/102737](https://github.com/microsoft/vscode/issues/102737) — onDidCloseTextDocument fires on language change; doc.isClosed is false [VERIFIED]
- vscode-server gist confirming `~/.vscode-server/bin/{git_cid}` installation path [MEDIUM — gist, not official docs]

### Tertiary (LOW confidence)
- Profile hash path format `User/profiles/{hash}/` — confirmed by multiple sources including VS Code profile docs but exact behavior of globalStorageUri relative to profiles requires empirical testing [LOW for A1]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions npm-verified; @vscode/sqlite3 is the only viable choice
- Architecture: HIGH — locked by CONTEXT.md decisions; activation sequence well-documented
- Pitfalls: HIGH — all sourced from documented issues or official docs
- globalStorageUri profile parsing: MEDIUM — API gap is confirmed (issue #160466 closed); null-fallback handles the uncertainty
- `appRoot` SSH path format: MEDIUM — path structure confirmed from multiple gist/issue sources, not official API docs

**Research date:** 2026-04-25
**Valid until:** 2026-07-25 (90 days — stable VS Code API, slow-moving)
