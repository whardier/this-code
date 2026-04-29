# Phase 5: Packaging + Distribution - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 6 (3 new, 3 modified)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/src/cliDetect.ts` | utility/service | request-response (async probe) | `extension/src/storage.ts` | role-match (async fs + error swallow pattern) |
| `extension/src/extension.ts` | activation entry | event-driven | `extension/src/extension.ts` (self) | exact (fire-and-forget pattern already present) |
| `extension/src/test/extension.test.ts` | test | request-response | `extension/src/test/extension.test.ts` (self) | exact (extend existing suite file) |
| `.github/workflows/ci.yml` | CI config | event-driven | `.github/workflows/ci.yml` (self) | exact (add steps to existing job) |
| `.github/workflows/ext-release.yml` | CI release config | event-driven + batch | `.github/workflows/cli-ci.yml` | role-match (matrix build pattern) |
| `.github/workflows/cli-release.yml` | CI release config | event-driven + batch | `.github/workflows/cli-ci.yml` | exact (same Rust toolchain + matrix pattern) |

---

## Pattern Assignments

### `extension/src/cliDetect.ts` (utility/service, request-response)

**Analog:** `extension/src/storage.ts`

**Imports pattern** (`extension/src/storage.ts` lines 1-5):
```typescript
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { Database } from "./db";
import { SessionMetadata } from "./session";
```

**New file imports** (adapt from storage.ts pattern — add `child_process` + `util` + `vscode`):
```typescript
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
```

**Core async-probe + error-swallow pattern** (`extension/src/storage.ts` lines 32-44):
```typescript
export async function scanExistingRemoteSessions(
  db: Database,
  binDir: string = path.join(os.homedir(), ".vscode-server", "bin"),
): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(binDir);
  } catch {
    // binDir does not exist — local-only machine, skip silently
    return;
  }
  // ...
}
```

**Pattern to copy for cliDetect.ts:** The two-phase try/catch — outer catch for "not found, return early" and inner catch for "found but unusable" — mirrors `scanExistingRemoteSessions`. Apply same structure:

```typescript
const execFileAsync = promisify(execFile);

const EXPECTED_CLI_MAJOR = 0; // update when CLI protocol breaks compatibility

const CLI_PATH = path.join(os.homedir(), ".this-code", "bin", "this-code");
const CLI_DOWNLOAD_URL = "https://github.com/whardier/this-code/releases";

export async function checkCliPresence(): Promise<void> {
  // Phase 1: existence check (mirrors storage.ts readdir try/catch early-return)
  try {
    await fs.access(CLI_PATH);
  } catch {
    const action = await vscode.window.showInformationMessage(
      "This Code: CLI not found at ~/.this-code/bin/this-code",
      "Download",
    );
    if (action === "Download") {
      await vscode.env.openExternal(vscode.Uri.parse(CLI_DOWNLOAD_URL));
    }
    return;
  }

  // Phase 2: version check (mirrors storage.ts inner try/catch per entry)
  try {
    const { stdout } = await execFileAsync(CLI_PATH, ["--version"], {
      timeout: 3000,
    });
    const match = stdout.trim().match(/(\d+)\.\d+\.\d+/);
    if (match) {
      const majorVersion = parseInt(match[1], 10);
      if (majorVersion !== EXPECTED_CLI_MAJOR) {
        await vscode.window.showWarningMessage(
          `This Code: CLI major version mismatch. Extension expects v${EXPECTED_CLI_MAJOR}.x, found v${majorVersion}.x. Some features may not work correctly.`,
        );
      }
    }
  } catch {
    await vscode.window.showWarningMessage(
      "This Code: CLI found but could not run `this-code --version`. Try reinstalling the CLI.",
    );
  }
}
```

**Key constraint from analog:** Inner catch blocks in `storage.ts` (line 89-92) swallow all errors silently. `cliDetect.ts` may surface a notification (not throw) — same spirit: never let the probe throw to the caller.

---

### `extension/src/extension.ts` (activation entry — MODIFY)

**Analog:** `extension/src/extension.ts` (self — fire-and-forget call pattern)

**Fire-and-forget pattern** (`extension/src/extension.ts` lines 112-115):
```typescript
    log("info", "Starting background session scan...");
    // Fire-and-forget — do NOT await (Pitfall 6)
    scanExistingRemoteSessions(db).catch((err) => {
      log("info", `Startup scan error: ${(err as Error).message}`);
    });
```

**Pattern to copy for CLI detection call:** Add immediately after the existing fire-and-forget scan call (before the final `log("info", "This Code activated...")`). Use the identical `.catch(() => {})` pattern — no `await`, no blocking:

```typescript
    // Fire-and-forget — do NOT await (D-04: non-blocking, never delays session recording)
    checkCliPresence().catch(() => {});
```

**Import to add** (line 8 block — follow existing named-import style):
```typescript
import { checkCliPresence } from "./cliDetect";
```

**Placement:** The call goes inside the `try` block in `activate()`, after `scanExistingRemoteSessions(db).catch(...)` and before the closing `log("info", "This Code activated successfully...")`. This mirrors the existing scan call at lines 111-115.

---

### `extension/src/test/extension.test.ts` (test — MODIFY)

**Analog:** `extension/src/test/extension.test.ts` (self — extend existing file)

**Suite pattern** (lines 9-15):
```typescript
suite("EXT-01: Extension ID", () => {
  test("publisher.name is whardier.this-code", () => {
    // Verified by manifest check in CI — no runtime assertion needed
    const pkg = require("../../package.json");
    assert.strictEqual(pkg.publisher + "." + pkg.name, "whardier.this-code");
  });
});
```

**Async test pattern with tmp dir teardown** (lines 46-81 — STOR-01):
```typescript
suite("STOR-01: Per-instance JSON", () => {
  test("JSON file contains all SessionMetadata fields", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { writeSessionJson } = require("../storage");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    // ...
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
```

**Source-read assertion pattern** (lines 436-452 — TRACK-04 static grep test):
```typescript
  test("open_files UPDATE uses parameterized query — no SQL injection surface", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "src", "extension.ts"),
      "utf-8",
    );
    const sqlTemplatePattern = /UPDATE invocations.*\$\{/;
    assert.ok(
      !sqlTemplatePattern.test(src),
      "SQL must use ? placeholders, not template literals",
    );
  });
```

**PKG-03 test suites to add** (copy suite + test structure from existing file, append after last suite):
```typescript
suite("PKG-03: CLI detection — missing binary", () => {
  test("checkCliPresence resolves without throwing when CLI absent", async () => {
    // Uses a guaranteed-absent path to exercise the not-found branch
    const { checkCliPresence } = require("../cliDetect");
    // This test requires a mock of fs.access and vscode.window — see plan for sinon usage or
    // testable-export pattern (pass cliPath as parameter to checkCliPresence)
  });
});

suite("PKG-03: CLI detection — version mismatch", () => {
  test("checkCliPresence resolves without throwing when version mismatches", async () => {
    // Exercises the execFile branch with a mock or stub
  });
});
```

**Note on testability:** The `checkCliPresence` function can be made testable by accepting an optional `cliPath` parameter (same pattern as `scanExistingRemoteSessions(db, binDir)` at `storage.ts` line 33 — `binDir` has a default but accepts override for tests). This is the established project pattern for injectable paths.

---

### `.github/workflows/ci.yml` (CI config — MODIFY)

**Analog:** `.github/workflows/ci.yml` (self)

**Existing step structure to insert after** (lines 37-39):
```yaml
      - name: Build extension bundle
        working-directory: extension
        run: npm run build
```

**Xvfb pattern to insert** (from RESEARCH.md Pattern 2, matches VS Code official CI docs):
```yaml
      - name: Run integration tests (Linux — requires Xvfb)
        run: xvfb-run -a npm test
        if: runner.os == 'Linux'
        working-directory: extension

      - name: Run integration tests (macOS)
        run: npm test
        if: runner.os != 'Linux'
        working-directory: extension
```

**Insert location:** Between `Build extension bundle` (line 39) and `Verify manifest` (line 41). The two conditional steps replace the deferred comment at lines 69-73.

**Existing matrix pattern preserved** (lines 14-16 — do not change):
```yaml
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest]
      fail-fast: false
```

---

### `.github/workflows/ext-release.yml` (NEW — extension release workflow)

**Analog:** `.github/workflows/cli-ci.yml` (matrix build + step structure)

**Trigger pattern** (new — tag-based, not in existing CI):
```yaml
on:
  push:
    tags:
      - 'ext/v*'
```

**Matrix structure** (adapt `cli-ci.yml` lines 18-22 — expand to 4 runners with target labels):
```yaml
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
            target: linux-x64
          - os: ubuntu-24.04-arm
            target: linux-arm64
          - os: macos-latest
            target: darwin-arm64
          - os: macos-15-large
            target: darwin-x64
    runs-on: ${{ matrix.os }}
```

**Node.js setup + npm ci** (adapt `ci.yml` lines 22-31):
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: extension/package-lock.json

      - name: Install dependencies
        working-directory: extension
        run: npm ci
```

**Xvfb test gate** (same pattern as ci.yml addition above, required before packaging):
```yaml
      - name: Run integration tests (Linux — requires Xvfb)
        run: xvfb-run -a npm test
        if: runner.os == 'Linux'
        working-directory: extension

      - name: Run integration tests (macOS)
        run: npm test
        if: runner.os != 'Linux'
        working-directory: extension
```

**VSIX packaging step** (new — no analog exists; from RESEARCH.md Pattern 1):
```yaml
      - name: Package VSIX
        run: |
          VERSION="${{ github.ref_name }}"
          VERSION="${VERSION#ext/v}"
          npx @vscode/vsce package --target ${{ matrix.target }} \
            -o this-code-${VERSION}-${{ matrix.target }}.vsix
        working-directory: extension

      - uses: actions/upload-artifact@v4
        with:
          name: vsix-${{ matrix.target }}
          path: extension/this-code-*.vsix
```

**Release aggregation job** (new — no analog exists; follows RESEARCH.md Pattern 3):
```yaml
  release:
    name: Create GitHub Release
    needs: [build-and-test]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: vsix-*
          merge-multiple: true
          path: dist/

      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*.vsix
          name: Extension ${{ github.ref_name }}
```

---

### `.github/workflows/cli-release.yml` (NEW — CLI release workflow)

**Analog:** `.github/workflows/cli-ci.yml` (exact Rust toolchain + cache pattern)

**Trigger pattern** (new — tag-based):
```yaml
on:
  push:
    tags:
      - 'cli/v*'
```

**Rust toolchain + cache** (copy from `cli-ci.yml` lines 28-43 verbatim):
```yaml
      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Cargo registry and build artifacts
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry/index/
            ~/.cargo/registry/cache/
            ~/.cargo/git/db/
            cli/target/
          key: ${{ runner.os }}-cargo-${{ hashFiles('cli/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-cargo-
```

**Note:** Drop `components: clippy, rustfmt` (not needed for release builds — those are CI-only).

**Release build + strip + rename** (adapt `cli-ci.yml` lines 52-58):
```yaml
      - name: Build release binary
        run: cargo build --release
        working-directory: cli

      - name: Strip binary
        run: strip target/release/this-code
        working-directory: cli

      - name: Rename binary with platform suffix
        run: cp target/release/this-code this-code-${{ matrix.suffix }}
        working-directory: cli

      - uses: actions/upload-artifact@v4
        with:
          name: cli-${{ matrix.suffix }}
          path: cli/this-code-${{ matrix.suffix }}
```

**Matrix structure** (same 4 runners as ext-release.yml, add `suffix` field):
```yaml
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
            target: linux-x64
            suffix: linux-x64
          - os: ubuntu-24.04-arm
            target: linux-arm64
            suffix: linux-arm64
          - os: macos-latest
            target: darwin-arm64
            suffix: darwin-arm64
          - os: macos-15-large
            target: darwin-x64
            suffix: darwin-x64
```

**Release aggregation job** (mirror ext-release.yml release job, change glob):
```yaml
  release-cli:
    name: Create CLI GitHub Release
    needs: [build-cli]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: cli-*
          merge-multiple: true
          path: dist/

      - uses: softprops/action-gh-release@v2
        with:
          files: dist/this-code-*
          name: CLI ${{ github.ref_name }}
```

---

## Shared Patterns

### Fire-and-Forget Async Calls
**Source:** `extension/src/extension.ts` lines 112-115
**Apply to:** `extension/src/extension.ts` (checkCliPresence call), `extension/src/cliDetect.ts` (internal structure)
```typescript
    // Fire-and-forget — do NOT await (Pitfall 6)
    scanExistingRemoteSessions(db).catch((err) => {
      log("info", `Startup scan error: ${(err as Error).message}`);
    });
```
The `checkCliPresence` caller in `activate()` uses `.catch(() => {})` (no logging needed — the function handles its own notifications).

### Silent Error Swallow in Async Utilities
**Source:** `extension/src/storage.ts` lines 87-92
**Apply to:** `extension/src/cliDetect.ts` (both catch blocks must never throw to caller)
```typescript
    } catch {
      // Missing file, malformed JSON, or DB error — skip this entry silently
      // Startup scan must never throw to caller (fire-and-forget contract)
    }
```

### Injectable Path Parameter for Testability
**Source:** `extension/src/storage.ts` line 33
**Apply to:** `extension/src/cliDetect.ts` (add optional `cliPath` parameter), `extension/src/test/extension.test.ts` (PKG-03 tests)
```typescript
export async function scanExistingRemoteSessions(
  db: Database,
  binDir: string = path.join(os.homedir(), ".vscode-server", "bin"),
): Promise<void> {
```
Make `cliPath` an optional parameter to `checkCliPresence` so tests can pass a non-existent or mock path without real filesystem side effects.

### Node.js Module Imports in Test Bodies
**Source:** `extension/src/test/extension.test.ts` lines 47-52
**Apply to:** PKG-03 test suites in the same file
```typescript
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { writeSessionJson } = require("../storage");
```
PKG-03 tests require the module inside the test body: `const { checkCliPresence } = require("../cliDetect");`

### GitHub Actions Matrix with fail-fast: false
**Source:** `.github/workflows/cli-ci.yml` lines 18-22
**Apply to:** Both `ext-release.yml` and `cli-release.yml`
```yaml
    strategy:
      fail-fast: false
      matrix:
        os:
          - ubuntu-latest
          - macos-latest
```

### actions/checkout@v4 + working-directory Convention
**Source:** `.github/workflows/ci.yml` lines 19-20 and `.github/workflows/cli-ci.yml` lines 26-43
**Apply to:** Both new release workflows
```yaml
      - name: Checkout
        uses: actions/checkout@v4
```
All subsequent steps use `working-directory:` to scope to `extension/` or `cli/` rather than using `cd`.

---

## No Analog Found

All 6 files have analogs. No entries in this section.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | — |

---

## Metadata

**Analog search scope:** `extension/src/`, `extension/src/test/`, `.github/workflows/`
**Files read:** 8 (extension.ts, storage.ts, config.ts, extension.test.ts, ci.yml, cli-ci.yml, package.json, .vscodeignore)
**Pattern extraction date:** 2026-04-28

**Critical flags for planner:**
- `macos-13` is end-of-life (December 2025). Both release workflows must use `macos-15-large` (or `macos-15-intel` if confirmed free-tier). Flag this as a one-line decision at workflow creation.
- `extension/src/cliDetect.ts` should export `checkCliPresence(cliPath?: string)` with the default path hardcoded inside — matches `scanExistingRemoteSessions(db, binDir?)` testability pattern established in `storage.ts`.
- `npm test` in `package.json` runs `vscode-test` (line 48) — no new script needed; `xvfb-run -a npm test` wraps it on Linux.
- `build:prod` script exists in `package.json` line 44 (`node esbuild.js --production`) — release workflow should use `build:prod`, not `build`, for minified output.
