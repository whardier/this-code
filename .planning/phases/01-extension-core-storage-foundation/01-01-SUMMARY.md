---
phase: "01-extension-core-storage-foundation"
plan: "01"
subsystem: "extension-scaffold"
tags: ["typescript", "vscode-extension", "sqlite3", "esbuild", "scaffold"]
dependency_graph:
  requires: []
  provides:
    - "extension/package.json manifest with whardier.this-code identity"
    - "extension/tsconfig.json strict TypeScript config"
    - "extension/esbuild.js bundler excluding @vscode/sqlite3 native module"
    - "extension/.vscodeignore preserving @vscode/sqlite3 in VSIX"
    - "extension/src/db.ts Database class and initDatabase stub"
    - "extension/src/session.ts SessionMetadata interface and stubs"
    - "extension/src/storage.ts writeSessionJson and scanExistingRemoteSessions stubs"
    - "extension/src/config.ts complete isEnabled/getLogLevel implementation"
    - "extension/src/extension.ts activate/deactivate entrypoint with full structure"
    - "extension/src/test/extension.test.ts 16 integration test suites"
  affects: []
tech_stack:
  added:
    - "@vscode/sqlite3 ^5.1.12-vscode (native SQLite for VS Code Electron)"
    - "typescript ~5.7.0"
    - "esbuild ^0.28.0"
    - "@vscode/vsce ^3.9.0"
    - "@vscode/test-cli ^0.0.12"
    - "@vscode/test-electron ^2.5.2"
    - "@types/vscode ^1.75.0"
    - "@types/node ^25.6.0"
  patterns:
    - "Promise wrapper around @vscode/sqlite3 callback API (~20-line Database class)"
    - "esbuild bundler with vscode and @vscode/sqlite3 as external"
    - "extensionKind: workspace for SSH remote support"
    - "Fire-and-forget startup scan pattern"
key_files:
  created:
    - "extension/package.json"
    - "extension/tsconfig.json"
    - "extension/esbuild.js"
    - "extension/.vscodeignore"
    - "extension/.gitignore"
    - "extension/.vscode-test.js"
    - "extension/package-lock.json"
    - "extension/src/extension.ts"
    - "extension/src/db.ts"
    - "extension/src/session.ts"
    - "extension/src/storage.ts"
    - "extension/src/config.ts"
    - "extension/src/test/extension.test.ts"
  modified: []
decisions:
  - "Added @types/node as dev dependency (auto-fix Rule 3) — required for os, path, fs/promises, assert; not listed in plan but necessary for tsc --noEmit to pass"
  - "Did NOT create extension/src/test/index.ts — @vscode/test-cli discovers tests via .vscode-test.js glob automatically"
metrics:
  duration_seconds: 239
  completed_date: "2026-04-26"
  tasks_completed: 2
  files_created: 13
---

# Phase 01 Plan 01: Extension Scaffold Summary

Scaffolded the `extension/` subdirectory from scratch with all project configuration files, TypeScript source stubs defining all module interfaces, test infrastructure, and npm dependencies installed — including the @vscode/sqlite3 native binary. Wave 0 scaffold establishes all contracts for Plans 02-06.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write six config files and run npm install | f53535d | extension/package.json, tsconfig.json, esbuild.js, .vscodeignore, .gitignore, .vscode-test.js, package-lock.json |
| 2 | Create five TypeScript source stubs and integration test stubs | a35d618 | extension/src/{extension,db,session,storage,config}.ts, extension/src/test/extension.test.ts, updated package.json |

## Verification Results

All success criteria confirmed:

- extension/package.json: ID is `whardier.this-code`, extensionKind is `["workspace"]`, activationEvents is `["onStartupFinished"]`, no contributes.commands, exactly two settings (thisCode.enable, thisCode.logLevel)
- extension/node_modules/@vscode/sqlite3/ exists with prebuilt native binary: `build/Release/vscode-sqlite3.node` (darwin-arm64 platform)
- extension/.vscodeignore contains `!node_modules/@vscode/sqlite3/**`
- extension/esbuild.js external array contains both `"vscode"` and `"@vscode/sqlite3"`
- All five TypeScript source files present and export documented interfaces
- 16 test suites in extension/src/test/extension.test.ts
- extension/src/test/index.ts does NOT exist (correctly absent)
- `cd extension && npx tsc --noEmit` exits 0

## npm install Outcome

- node_modules size: 211 MB
- @vscode/sqlite3 5.1.12-vscode installed with native binary for darwin-arm64
- 428 packages total, 427 from dependencies + 1 direct

## TypeScript Typecheck Result

`tsc --noEmit` exits 0. All stubs compile cleanly despite containing `throw new Error(...)` bodies — these are valid TypeScript that satisfies return type constraints. The `initDatabase`, `collectSessionMetadata`, `getSessionJsonPath`, `writeSessionJson`, and `scanExistingRemoteSessions` stubs all throw at runtime but type-check correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing @types/node dev dependency**
- **Found during:** Task 2 — tsc --noEmit failed with "Cannot find module 'os'" and "Cannot find name 'require'"
- **Issue:** extension/src/extension.ts imports `os`, `path`, `fs/promises`; extension/src/test/extension.test.ts imports `assert`, `path`, `os`; and uses `require()`. These are Node.js built-in types not present without @types/node.
- **Fix:** `npm install --save-dev @types/node` — added @types/node ^25.6.0 to devDependencies. TypeScript typecheck then passes.
- **Files modified:** extension/package.json (devDependencies), extension/package-lock.json
- **Commit:** a35d618 (bundled with Task 2 commit)

## Known Stubs

The following stubs exist intentionally — they export correct interfaces but throw at runtime until downstream plans implement them:

| Stub | File | Plan |
|------|------|------|
| `initDatabase` | extension/src/db.ts | Plan 02 |
| `collectSessionMetadata` | extension/src/session.ts | Plan 03 |
| `getSessionJsonPath` | extension/src/session.ts | Plan 03 |
| `writeSessionJson` | extension/src/storage.ts | Plan 03 |
| `scanExistingRemoteSessions` | extension/src/storage.ts | Plan 05 |

These stubs are intentional — this is Wave 0's purpose. Plans 02-06 implement each function.

Test stubs (STOR-01 through PLAT-01 suites) also return `assert.ok(true)` until the corresponding plans fill in assertions.

## Threat Flags

No new threat surface beyond what was planned. The T-01-01 mitigation (`.vscodeignore` preservation line) and T-01-02 mitigation (esbuild external array) are both present and verified.

## Self-Check: PASSED

- extension/package.json exists: FOUND
- extension/tsconfig.json exists: FOUND
- extension/esbuild.js exists: FOUND
- extension/.vscodeignore exists: FOUND
- extension/src/extension.ts exists: FOUND
- extension/src/db.ts exists: FOUND
- extension/src/session.ts exists: FOUND
- extension/src/storage.ts exists: FOUND
- extension/src/config.ts exists: FOUND
- extension/src/test/extension.test.ts exists: FOUND
- Commit f53535d exists: FOUND
- Commit a35d618 exists: FOUND
