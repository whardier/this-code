---
phase: "01-extension-core-storage-foundation"
plan: "07"
subsystem: "ci-platform"
tags: ["github-actions", "ci", "typescript", "requirements", "plat-01"]
dependency_graph:
  requires:
    - phase: "01-extension-core-storage-foundation"
      plan: "04"
      provides: "extension/src/test/extension.test.ts with PLAT-01 stub"
    - phase: "01-extension-core-storage-foundation"
      plan: "05"
      provides: "extension/package.json scripts (build, typecheck, test)"
  provides:
    - ".github/workflows/ci.yml with macOS and Linux 2-platform matrix"
    - "PLAT-01 test: CI workflow existence and platform matrix assertion"
    - "PLAT-01 test: os.homedir() absolute POSIX path assertion"
    - "REQUIREMENTS.md STOR-03 corrected to invoked_at (D-07) with full 11-column schema"
  affects:
    - "All future plans — CI now validates typecheck + build on every push/PR"
tech_stack:
  added:
    - "GitHub Actions (actions/checkout@v4, actions/setup-node@v4)"
  patterns:
    - "CI matrix with fail-fast: false — both platforms run independently"
    - "npm ci (not npm install) — lockfile-reproducible installs in CI"
    - "Phase 1 CI scope: typecheck + build + manifest + static checks (npm test deferred to Phase 4)"
key_files:
  created:
    - ".github/workflows/ci.yml"
  modified:
    - "extension/src/test/extension.test.ts"
    - ".planning/REQUIREMENTS.md"
decisions:
  - "Full npm test (VS Code integration tests via @vscode/test-electron) deferred to Phase 4 — requires Xvfb on Linux and a real GUI session; Phase 1 CI validates typecheck, build, manifest, and static source assertions"
  - "TRACK-05 grep in CI uses --exclude-dir=test to avoid false positive from test file's string literal assertion"
  - "PLAT-01 test uses path.resolve(__dirname, '..', '..', '..', '..') to navigate from compiled test output to project root for ci.yml path check"
metrics:
  duration_seconds: 215
  completed_date: "2026-04-26"
  tasks_completed: 3
  files_created: 1
  files_modified: 2
---

# Phase 01 Plan 07: CI Workflow and PLAT-01 Summary

**GitHub Actions CI matrix on macOS-latest and ubuntu-latest with typecheck + build + manifest validation; PLAT-01 test stub replaced with CI file assertion and platform path test; REQUIREMENTS.md STOR-03 corrected to invoked_at with full 11-column schema.**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create .github/workflows/ci.yml with macOS and Linux matrix | d2f3159 | .github/workflows/ci.yml |
| 2 | Replace PLAT-01 test stub with CI matrix documentation assertion | 556c853 | extension/src/test/extension.test.ts |
| 3 | Update REQUIREMENTS.md STOR-03 to use invoked_at per D-07 | 44ff6e3 | .planning/REQUIREMENTS.md |

## Implementation Details

### CI Workflow Structure (.github/workflows/ci.yml)

**Triggers:** push and pull_request to `main` branch

**Matrix:**
```yaml
strategy:
  matrix:
    os: [macos-latest, ubuntu-latest]
  fail-fast: false
```

`fail-fast: false` ensures both platforms are independently verified — a failure on one does not skip the other.

**Steps (all npm steps use `working-directory: extension`):**

1. `actions/checkout@v4` — checkout repository
2. `actions/setup-node@v4` with Node.js 20 LTS, npm cache keyed on `extension/package-lock.json`
3. `npm ci` — reproducible install from lockfile
4. `npx tsc --noEmit` — TypeScript strict typecheck (catches type errors before runtime)
5. `npm run build` — esbuild bundle producing `dist/extension.js`
6. **Verify manifest** — inline Node.js script checking: publisher+name == `whardier.this-code`, `extensionKind == ["workspace"]`, `onStartupFinished` in activationEvents, no `commands` contribution, settings keys == `thisCode.enable,thisCode.logLevel`
7. **Verify dist output** — `test -f dist/extension.js` confirms esbuild produced output
8. **Check no save trigger** — `grep -r "onDidSaveTextDocument" src/ --exclude-dir=test` — enforces TRACK-05 on every CI run; `--exclude-dir=test` prevents false positive from test file's own string literal assertion

**Phase 1 CI scope note:** Full `npm test` (VS Code integration tests via `@vscode/test-electron`) requires Xvfb on Linux (virtual framebuffer) and a real GUI session. That setup is deferred to Phase 4 (Marketplace packaging). Phase 1 CI validates typecheck, build, manifest, and static source assertions on both platforms.

### PLAT-01 Test Assertions (extension/src/test/extension.test.ts)

**Test 1 — CI matrix existence:**
```typescript
suite("PLAT-01: macOS and Linux", () => {
  test("CI workflow exists with macos-latest and ubuntu-latest matrix", () => {
    const ciPath = path.resolve(__dirname, "..", "..", "..", "..", ".github", "workflows", "ci.yml");
    assert.ok(fs.existsSync(ciPath), `CI workflow must exist at ${ciPath}`);
    const ciContent = fs.readFileSync(ciPath, "utf-8");
    assert.ok(ciContent.includes("macos-latest"), "CI must include macos-latest");
    assert.ok(ciContent.includes("ubuntu-latest"), "CI must include ubuntu-latest");
    assert.ok(ciContent.includes("fail-fast: false"), "CI must have fail-fast: false");
  });
```

Path resolution: `__dirname` is the compiled test output directory (e.g., `extension/out/test/`); four `..` segments navigate to the project root where `.github/workflows/ci.yml` lives.

**Test 2 — Platform path resolution:**
```typescript
  test("os.homedir() returns non-empty string on current platform", () => {
    const homeDir = os.homedir();
    assert.ok(typeof homeDir === "string" && homeDir.length > 0, ...);
    assert.ok(homeDir.startsWith("/"), "home dir must be an absolute POSIX path on macOS/Linux");
  });
```

Validates that `os.homedir()` returns a POSIX absolute path on both CI platforms — a foundational requirement for all `~/.this-code/` path construction in the extension.

### REQUIREMENTS.md Corrections

**STOR-03** updated to reflect D-07 (locked schema):

Before:
```
SQLite schema includes: `id`, `recorded_at`, `workspace_path`, `user_data_dir`, `profile`, `server_commit_hash`, `server_bin_path`, `open_files` (JSON array)
```

After:
```
SQLite schema includes: `id`, `invoked_at`, `workspace_path`, `user_data_dir`, `profile`, `local_ide_path`, `remote_name`, `remote_server_path`, `server_commit_hash`, `server_bin_path`, `open_files` (JSON array)
```

Changes: `recorded_at` → `invoked_at` (D-07); added missing columns `local_ide_path`, `remote_name`, `remote_server_path` to bring the requirements document in sync with the actual 11-column schema implemented in Plans 02-03.

## Threat Mitigations Applied

| Threat ID | Mitigation | Verification |
|-----------|------------|--------------|
| T-07-01 | `npm ci` uses package-lock.json; locked versions only | CI step uses `npm ci` not `npm install` |
| T-07-02 | `fail-fast: false` — both platforms attempted independently | PLAT-01 test asserts `fail-fast: false` in ci.yml |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TRACK-05 grep false positive on test file**
- **Found during:** Task 1 verification
- **Issue:** The CI "Check no save trigger" step used `grep -r "onDidSaveTextDocument" src/` which matches the test file's own assertion string (`!src.includes("onDidSaveTextDocument")`). This would cause every CI run to fail the TRACK-05 check.
- **Fix:** Added `--exclude-dir=test` to the grep command so only production source files are checked.
- **Files modified:** `.github/workflows/ci.yml`
- **Commit:** e06db1f

### Plan Clarification: REQUIREMENTS.md path corrections

The plan described replacing `~/.this-code/` with `~/.this-code/` per D-06. On examination, the REQUIREMENTS.md file already used `~/.this-code/` throughout (the path rename had already been applied by prior plans). The only substantive correction needed was STOR-03's `recorded_at` → `invoked_at` per D-07, plus expanding the 8-column list to the full 11-column schema. No `~/.which-code/` or similar old-name paths were found to replace.

## Known Stubs

None — all Phase 1 stubs have been resolved:
- PLAT-01 test stub: replaced in this plan (Task 2)
- STOR-04 test stub: replaced in Plan 05
- All other stubs from Plans 01-06: resolved in their respective plans

## Threat Flags

No new threat surface introduced. CI workflow only reads npm registry (mitigated by `npm ci` + lockfile) and performs read-only filesystem operations.

## Self-Check: PASSED

- `.github/workflows/ci.yml` exists: FOUND
- ci.yml contains `macos-latest`: FOUND
- ci.yml contains `ubuntu-latest`: FOUND
- ci.yml contains `fail-fast: false`: FOUND
- ci.yml contains `npx tsc --noEmit`: FOUND
- ci.yml contains `npm ci`: FOUND
- ci.yml contains `npm run build`: FOUND
- extension.test.ts PLAT-01 test 1 (CI matrix assertion): FOUND
- extension.test.ts PLAT-01 test 2 (os.homedir): FOUND
- REQUIREMENTS.md `invoked_at`: FOUND
- REQUIREMENTS.md no `recorded_at`: CONFIRMED
- TypeScript strict compile (`npx tsc --noEmit`): exits 0
- TRACK-05 grep (--exclude-dir=test): no false positive
- Commit d2f3159 (Task 1 CI workflow): FOUND
- Commit 556c853 (Task 2 PLAT-01 test): FOUND
- Commit 44ff6e3 (Task 3 REQUIREMENTS.md): FOUND
- Commit e06db1f (Rule 1 bug fix): FOUND
