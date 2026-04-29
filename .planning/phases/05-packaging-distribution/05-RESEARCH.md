# Phase 5: Packaging + Distribution - Research

**Researched:** 2026-04-28
**Domain:** VS Code extension packaging, GitHub Actions release workflows, CLI binary releases, Xvfb integration testing
**Confidence:** HIGH (core packaging/CI patterns); MEDIUM (macos-13 deprecation finding)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** CLI binary is NOT bundled in the VSIX. No binary and no installer script is placed on the remote system.
- **D-02:** On activation, extension checks for the CLI binary at `~/.this-code/bin/this-code`. If not found, extension shows a VS Code information notification with a link to https://github.com/whardier/this-code instructing the user to download a release.
- **D-03:** If the CLI binary IS found, extension runs `this-code --version`, parses the semver output, and compares major versions against the extension's declared expected CLI major version. If major versions differ, extension shows a compatibility warning notification.
- **D-04:** CLI detection runs during extension activation (`onStartupFinished`). Detection is non-blocking — extension continues recording session data regardless of CLI status.
- **D-05:** 4 native GitHub Actions runners are used for VSIX builds:
  - `ubuntu-latest` → `linux-x64`
  - `ubuntu-24.04-arm` → `linux-arm64`
  - `macos-latest` → `darwin-arm64`
  - `macos-13` → `darwin-x64`
- **D-06:** CLI binary GitHub Release assets are also built natively on the same 4 runners in the same release workflow (no cross-compilation).
- **D-07:** Two separate release workflows with distinct tag patterns:
  - `ext/v*` (e.g., `ext/v0.1.0`) → triggers extension release
  - `cli/v*` (e.g., `cli/v0.1.0`) → triggers CLI release
- **D-08:** Marketplace publish is semi-automated. CI builds and uploads VSIX artifacts to the GitHub Release. Developer runs `vsce publish --pre-release` manually.
- **D-09:** Marketplace channel is pre-release for the first publication.
- **D-10:** No PAT stored in CI for automated Marketplace publish (Phase 5 is manual).
- **D-11:** Xvfb + `vscode-test` added to existing `ci.yml`. Runs on every push/PR alongside typecheck and build.
- **D-12:** Integration tests gate the release workflow — extension release workflow declares `needs: [build-and-test]`.

### Claude's Discretion

- VSIX artifact naming convention per platform (e.g., `this-code-0.1.0-darwin-arm64.vsix`)
- CLI binary naming convention per platform (e.g., `this-code-darwin-arm64`, `this-code-linux-x64`)
- GitHub Release asset organization (separate releases per tag vs single release with all assets)
- Exact `vsce package --target` flag syntax for each platform target
- How extension stores its "expected CLI major version" (hardcoded constant, package.json field, or separate config)
- `npm ci --omit=dev` vs full `npm ci` in the packaging workflow (only production deps in VSIX)

### Deferred Ideas (OUT OF SCOPE)

- Shell script CLI installer
- Automated Marketplace publish via PAT
- Stable channel Marketplace listing
- PKG-03 original scope (CLI binary bundled in VSIX)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-01 | Extension published to VS Code Marketplace as `whardier.this-code` | Pre-release publish via `vsce publish --pre-release` with manually downloaded VSIXes; D-08/D-09 constrain to semi-automated manual step |
| PKG-02 | VSIX packages built per-platform: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64` via `vsce package --target` | Verified target string syntax; native runner per target is correct approach for `@vscode/sqlite3` prebuilts |
| PKG-03 (revised) | Extension detects CLI presence at activation; shows notification if missing or version-incompatible | `fs.access` for binary check; `execFile` for version; `showInformationMessage` with action button |
| PKG-04 | GitHub Actions CI matrix builds all 4 platform VSIX packages on release | `ext/v*` workflow with 4-runner matrix, `actions/upload-artifact@v4`, `softprops/action-gh-release@v2` |
</phase_requirements>

---

## Summary

Phase 5 delivers four interconnected capabilities: platform-aware VSIX packaging that correctly ships `@vscode/sqlite3` prebuilts, extension activation logic that detects and reports CLI status, two GitHub Actions release workflows (extension and CLI), and VS Code integration tests running in CI with Xvfb on Linux.

The central packaging insight is that `@vscode/sqlite3` downloads its prebuilt native binary at `npm install` time (via node-pre-gyp into `node_modules/@vscode/sqlite3/lib/binding/napi-v{n}-{platform}-{libc}-{arch}/`). Running `npm ci` on a native runner (the actual target platform) fetches the correct prebuilt. The existing `.vscodeignore` entry `!node_modules/@vscode/sqlite3/**` correctly captures the prebuilt regardless of whether it lands in `lib/binding/` (CI) or `build/Release/` (local source build). No changes to `.vscodeignore` are needed for the prebuilt path.

A critical runner label finding: `macos-13` (the darwin-x64 runner specified in D-05) was deprecated and fully unsupported as of December 2025. The current free-tier replacement for macOS x64 is `macos-15-large` (paid larger runner) or `macos-15-intel` (standard, free for public repos). This needs a decision before creating the release workflow. The research recommends `macos-15-large` if the repo is public, or skipping darwin-x64 until the user decides.

**Primary recommendation:** Use `vsce package --target <platform>` per runner in a matrix job, upload VSIX files as GitHub Release assets via `softprops/action-gh-release@v2`, and gate the release on integration tests using `xvfb-run -a npm test` on Linux runners.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLI binary existence check | Extension (Node.js) | — | `fs.access` on `~/.this-code/bin/this-code`; runs on extension host where files are (extensionKind: workspace) |
| CLI version detection | Extension (Node.js) | — | `child_process.execFile` to run `this-code --version`; extension host has process access |
| User notification (missing CLI) | Extension (VS Code API) | — | `vscode.window.showInformationMessage` with external link action |
| VSIX packaging | Build system (vsce) | GitHub Actions | vsce packages per-target; CI runs it on native runners |
| Native SQLite prebuilt | npm install (node-pre-gyp) | Extension packaging | Prebuilt downloaded at `npm ci` time per platform; packaged by vsce automatically |
| Release asset upload | GitHub Actions | softprops/action-gh-release | Collects per-runner artifacts and uploads to GitHub Release |
| CLI binary build | Rust toolchain (cargo) | GitHub Actions | `cargo build --release` per native runner |
| Integration test execution | Test runner (@vscode/test-cli) | Xvfb (Linux only) | Headless VS Code requires virtual display on Linux |
| Marketplace publish | Developer (manual) | vsce CLI | D-08/D-10 — no PAT in CI for Phase 5 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @vscode/vsce | 3.9.1 [VERIFIED: npm registry] | Package + publish VS Code extensions | Official Microsoft tool; already in devDependencies |
| @vscode/test-cli | 0.0.12 [VERIFIED: npm registry, package-lock.json] | Run integration tests inside VS Code | Official test runner; already installed |
| @vscode/test-electron | 2.5.2 [VERIFIED: npm registry, package-lock.json] | Download + manage VS Code test instance | Required by test-cli; already installed |
| softprops/action-gh-release | v2 [VERIFIED: GitHub marketplace] | Create GitHub Releases with assets from CI | Most widely-used release action; supports multi-job artifact collection |
| actions/upload-artifact | v4 [VERIFIED: npm registry shows v7] | Upload per-runner VSIX/binary artifacts | Official GitHub action for intra-workflow artifact passing |
| actions/download-artifact | v4 [VERIFIED: npm registry shows v8] | Collect artifacts in release aggregation job | Official counterpart to upload-artifact |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dtolnay/rust-toolchain | @stable | Pin Rust toolchain for release builds | Already used in cli-ci.yml; same pattern for release workflow |
| actions/cache | v4 | Cache Cargo registry, npm modules | Already used in both CI workflows; reuse in release |
| actions/checkout | v4 | Checkout repo in CI | Already used in all workflows |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| softprops/action-gh-release@v2 | `gh release create` (CLI) | gh CLI is simpler but less configurable for multi-file uploads from matrix jobs |
| actions/upload-artifact@v4 | GitHub Release direct upload | upload-artifact is the standard for intra-workflow artifact passing before the release job collects them |
| `xvfb-run -a` inline | `GabrielBB/xvfb-action` | Inline is simpler, official VS Code docs recommend it; no extra action dependency |

---

## Architecture Patterns

### System Architecture Diagram

```
Tag push (ext/v*)
    │
    ▼
[build-and-test] (matrix: 4 runners)
    │  npm ci → @vscode/sqlite3 prebuilt downloaded for runner's platform
    │  tsc + build
    │  xvfb-run npm test (Linux) / npm test (macOS)
    │  vsce package --target <platform> -o this-code-{ver}-{platform}.vsix
    │  upload-artifact: this-code-{ver}-{platform}.vsix
    │
    ▼  (needs: build-and-test)
[release] (single runner: ubuntu-latest)
    │  download-artifact: all VSIX files
    │  softprops/action-gh-release → GitHub Release with 4 VSIX assets
    │
    └─► Developer: vsce publish --pre-release --packagePath each.vsix
```

```
Tag push (cli/v*)
    │
    ▼
[build-cli] (matrix: 4 runners)
    │  cargo build --release
    │  strip binary (Linux: strip; macOS: strip)
    │  upload-artifact: this-code-{platform} binary
    │
    ▼  (needs: build-cli)
[release-cli] (single runner: ubuntu-latest)
    │  download-artifact: all CLI binaries
    │  softprops/action-gh-release → GitHub Release with 4 binary assets
```

```
Extension activation (every VS Code window)
    │
    ▼
checkCliPresence()  [non-blocking, fire-and-forget]
    │
    ├─ fs.access(~/.this-code/bin/this-code)
    │       │
    │       ├─ NOT FOUND → showInformationMessage("This Code: CLI not found", "Download")
    │       │                  button → vscode.env.openExternal(GitHub releases URL)
    │       │
    │       └─ FOUND → execFile(cliPath, ["--version"])
    │                       │
    │                       ├─ parse major version from output
    │                       └─ major !== EXPECTED_CLI_MAJOR
    │                               → showWarningMessage("CLI version mismatch...")
    │
    └─ (always) continue session recording regardless
```

### Recommended Project Structure

```
.github/workflows/
├── ci.yml                    # Updated: add Xvfb + vscode-test (D-11)
├── ext-release.yml           # New: ext/v* → VSIX build + GitHub Release
└── cli-release.yml           # New: cli/v* → Rust binary build + GitHub Release

extension/
├── src/
│   ├── extension.ts          # Updated: add checkCliPresence() call in activate()
│   └── cliDetect.ts          # New: CLI detection logic (fs.access + execFile)
└── package.json              # Updated: add "thisCode.expectedCliMajorVersion" or constant
```

### Pattern 1: vsce Platform Packaging

**What:** `vsce package --target <target>` produces a VSIX for a specific platform. VS Code 1.61+ selects the matching VSIX when installing. `npm ci` on the target runner downloads the platform-specific `@vscode/sqlite3` prebuilt.

**When to use:** Any extension with native Node.js addons (`.node` files). Required to ship the correct prebuilt.

**Valid target strings** [VERIFIED: code.visualstudio.com]:
`win32-x64`, `win32-arm64`, `linux-x64`, `linux-arm64`, `linux-armhf`, `alpine-x64`, `alpine-arm64`, `darwin-x64`, `darwin-arm64`, `web`

**Example:**
```bash
# Source: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
# Run on a linux-x64 runner after npm ci:
npx @vscode/vsce package --target linux-x64 -o this-code-0.1.0-linux-x64.vsix
```

### Pattern 2: Xvfb Integration Tests on Linux CI

**What:** VS Code requires a display to launch. Linux CI runners have no display. `xvfb-run -a` creates a virtual framebuffer for the duration of the test command.

**When to use:** Any VS Code extension integration test running on Linux in CI (including both `ci.yml` push/PR and release workflow test gate).

**Example:**
```yaml
# Source: https://code.visualstudio.com/api/working-with-extensions/continuous-integration
- name: Run integration tests (Linux)
  run: xvfb-run -a npm test
  if: runner.os == 'Linux'
  working-directory: extension

- name: Run integration tests (macOS)
  run: npm test
  if: runner.os != 'Linux'
  working-directory: extension
```

### Pattern 3: Multi-Runner Matrix + Collect-and-Release Job

**What:** Each matrix runner builds one artifact, uploads it with a unique name. A final `release` job (which `needs:` all matrix jobs) downloads all artifacts and creates the GitHub Release.

**When to use:** Any release that requires artifacts from multiple platforms.

**Example (extension release workflow excerpt):**
```yaml
# Source: https://github.com/softprops/action-gh-release (v2 docs)
jobs:
  build-and-test:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: linux-x64
          - os: ubuntu-24.04-arm
            target: linux-arm64
          - os: macos-latest
            target: darwin-arm64
          - os: macos-15-large   # NOTE: macos-13 deprecated Dec 2025 — see Pitfall 3
            target: darwin-x64
      fail-fast: false
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: extension/package-lock.json
      - run: npm ci
        working-directory: extension
      - run: xvfb-run -a npm test
        if: runner.os == 'Linux'
        working-directory: extension
      - run: npm test
        if: runner.os != 'Linux'
        working-directory: extension
      - run: npx @vscode/vsce package --target ${{ matrix.target }} -o this-code-${{ matrix.target }}.vsix
        working-directory: extension
      - uses: actions/upload-artifact@v4
        with:
          name: vsix-${{ matrix.target }}
          path: extension/this-code-${{ matrix.target }}.vsix

  release:
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
```

### Pattern 4: CLI Detection in Extension Activation

**What:** Non-blocking fire-and-forget function added to `activate()`. Uses `fs.access` (not `fs.existsSync` — async, fits extension model) for binary presence, then `child_process.execFile` for version. Semver major comparison using plain string parsing (no semver library needed for major-only comparison).

**Example:**
```typescript
// extension/src/cliDetect.ts
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);

// Stored as a constant — update when CLI protocol breaks compatibility
const EXPECTED_CLI_MAJOR = 0;  // v0.x.x

const CLI_PATH = path.join(os.homedir(), ".this-code", "bin", "this-code");
const CLI_DOWNLOAD_URL = "https://github.com/whardier/this-code/releases";

export async function checkCliPresence(): Promise<void> {
  // Check existence
  try {
    await fs.access(CLI_PATH);
  } catch {
    // CLI not found
    const action = await vscode.window.showInformationMessage(
      "This Code: CLI not found at ~/.this-code/bin/this-code",
      "Download"
    );
    if (action === "Download") {
      await vscode.env.openExternal(vscode.Uri.parse(CLI_DOWNLOAD_URL));
    }
    return;
  }

  // CLI found — check version
  try {
    const { stdout } = await execFileAsync(CLI_PATH, ["--version"]);
    // Expected output: "this-code 0.1.0"
    const match = stdout.trim().match(/(\d+)\.\d+\.\d+/);
    if (match) {
      const majorVersion = parseInt(match[1], 10);
      if (majorVersion !== EXPECTED_CLI_MAJOR) {
        await vscode.window.showWarningMessage(
          `This Code: CLI major version mismatch. Extension expects v${EXPECTED_CLI_MAJOR}.x, found v${majorVersion}.x. Some features may not work correctly.`
        );
      }
    }
  } catch {
    // execFile failed — CLI may be corrupt or wrong arch; treat as informational
    await vscode.window.showWarningMessage(
      "This Code: CLI found but could not run `this-code --version`. Try reinstalling the CLI."
    );
  }
}
```

### Pattern 5: Rust Release Build with Strip

**What:** `cargo build --release` + `strip` on the produced binary reduces size (4.3MB → ~415KB for debug symbols stripped). The `strip` profile option in `Cargo.toml` can automate this.

**Example:**
```toml
# In cli/Cargo.toml [profile.release] — optional addition
[profile.release]
strip = "debuginfo"  # Strip debug info; "symbols" strips more aggressively
```

Or in the CI workflow step:
```yaml
- name: Strip binary (Linux/macOS)
  run: strip target/release/this-code
  working-directory: cli
```

### Anti-Patterns to Avoid

- **Running `npm ci` with `--omit=dev` during packaging:** `vsce package` needs dev dependencies (TypeScript types, esbuild). Only `@vscode/vsce` itself is excluded by `.vscodeignore` — dev deps are needed at build time but excluded from the VSIX.
- **Using `macos-13` runner in 2026:** Deprecated December 2025. Workflows using it will error. Use `macos-15-large` or `macos-15-intel` instead.
- **Using `semver` npm package for major-version comparison:** Overkill; plain regex parse of `X.Y.Z` output is sufficient and adds no dependency.
- **Awaiting `checkCliPresence()` in `activate()`:** D-04 requires non-blocking. Fire-and-forget with `.catch(() => {})` so CLI check never delays session recording.
- **Blocking `vsce publish` on CI in Phase 5:** D-10 locks this to manual. CI only builds VSIXes and uploads to GitHub Releases.
- **`preview: true` in package.json:** Not required and not documented. Pre-release is controlled by `--pre-release` flag at publish time only [VERIFIED: code.visualstudio.com].

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VSIX packaging | Custom archiver/bundler | `vsce package --target` | Handles manifest validation, `.vscodeignore`, native module inclusion, platform metadata |
| Platform prebuilt selection | Custom binary copy script | `npm ci` on native runner + vsce | node-pre-gyp downloads and places the correct `.node` file automatically |
| GitHub Release creation | Custom GitHub API calls | `softprops/action-gh-release@v2` | Handles draft, asset upload, tag detection, file globbing |
| Pre-release version control | Manual version bumping | `--pre-release` flag in vsce | Marketplace handles pre-release channel routing |
| CLI version comparison | semver library | Regex major parse | Single number comparison; no range logic needed |

**Key insight:** `npm ci` + native runner is the entire "select correct prebuilt" mechanism. There is no custom selection logic needed.

---

## Common Pitfalls

### Pitfall 1: @vscode/sqlite3 Binding Path Variability

**What goes wrong:** On a developer machine, `@vscode/sqlite3` may compile from source (placing `.node` in `build/Release/vscode-sqlite3.node`). On CI with a prebuilt available, it lands in `lib/binding/napi-v{n}-{platform}-{libc}-{arch}/node_sqlite3.node`. Both paths are under `node_modules/@vscode/sqlite3/`.

**Why it happens:** node-pre-gyp tries prebuilt download first; on developer machines without network access to prebuilts or with Xcode installed, it falls back to compilation.

**How to avoid:** The current `.vscodeignore` entry `!node_modules/@vscode/sqlite3/**` correctly includes the entire sqlite3 subtree regardless of which path the binary lands in. Do not narrow this to a specific subdirectory.

**Warning signs:** VSIX installs but fails with "Cannot find module" for sqlite3 — check that `.vscodeignore` still has the broad `@vscode/sqlite3/**` pattern.

### Pitfall 2: macos-13 Runner Deprecated

**What goes wrong:** Using `macos-13` in `runs-on` causes a workflow error. The image was deprecated September 2025 and unsupported from December 2025. [VERIFIED: GitHub Changelog]

**Why it happens:** D-05 in CONTEXT.md specifies `macos-13` as the darwin-x64 runner. This decision was made before the deprecation reached end-of-life.

**How to avoid:** Replace `macos-13` with `macos-15-large` (paid) or `macos-15-intel` (standard free-tier x64). For a public repo, `macos-15-large` is free; verify with the repo owner before choosing.

**Warning signs:** Workflow fails immediately on the darwin-x64 matrix entry with "Image not found" error.

### Pitfall 3: VSIX Missing the --pre-release Flag for Initial Publish

**What goes wrong:** Running `vsce publish --packagePath my.vsix` without `--pre-release` publishes to the stable channel, not the pre-release channel. D-09 requires pre-release channel.

**Why it happens:** `--pre-release` is a publish-time flag. The VSIX file itself is not pre-release — the channel is chosen at publish.

**How to avoid:** The developer `vsce publish` command MUST include `--pre-release`. Document this in the manual publish instructions that Phase 5 must produce.

**Warning signs:** Extension appears in stable channel search results immediately.

### Pitfall 4: Version Must Be Distinct from Stable (Pre-Release Rule)

**What goes wrong:** Publishing `0.1.0` as a pre-release and then publishing `0.1.0` as a stable release will fail — the Marketplace requires distinct versions.

**Why it happens:** Marketplace pre-release and stable channels both track `major.minor.patch`. [VERIFIED: code.visualstudio.com]

**How to avoid:** Use version `0.1.0` for the pre-release. The next stable release must use a higher version (e.g., `0.2.0`). Or use odd minor for pre-release (`0.1.0`) and even minor for stable (`0.2.0`) per the official recommendation.

**Warning signs:** `vsce publish` returns "version already exists" error.

### Pitfall 5: checkCliPresence() Blocking activate()

**What goes wrong:** `await checkCliPresence()` in `activate()` delays session recording if the CLI check hangs (e.g., the `execFile` call hangs on a corrupt binary).

**Why it happens:** `execFile` with no timeout can hang indefinitely.

**How to avoid:** Fire-and-forget: `checkCliPresence().catch(() => {})` with no `await`. Also add a timeout to the `execFile` call (`{ timeout: 3000 }` option in `child_process.execFile`).

**Warning signs:** Extension activates but session recording is delayed or never starts.

### Pitfall 6: Artifact Naming Collision in Matrix Upload

**What goes wrong:** Two matrix jobs upload an artifact with the same `name:`, causing one to overwrite the other.

**Why it happens:** Artifact names must be unique per workflow run.

**How to avoid:** Name artifacts with the matrix variable: `vsix-${{ matrix.target }}` for extension, `cli-${{ matrix.target }}` for CLI.

**Warning signs:** Release has fewer than 4 VSIX files; download step has only the last-uploaded one.

### Pitfall 7: Release Workflow Tag Trigger with Nested Tags

**What goes wrong:** Using `on: push: tags: ['ext/v*']` and `on: push: tags: ['cli/v*']` may not work correctly if git tag contains slashes — some tooling treats slashes in tags as path separators.

**Why it happens:** Git allows slashes in tag names, but some GitHub Actions contexts normalize them differently.

**How to avoid:** Slashes in tag names work correctly in GitHub Actions `github.ref` (`refs/tags/ext/v0.1.0`). Extract the version from the tag with: `${{ github.ref_name }}` which gives `ext/v0.1.0`, so strip the prefix: `${{ github.ref_name | split('/') | last }}` or use a step to extract.

**Warning signs:** `softprops/action-gh-release` creates a release with the wrong name or `${{ github.ref_name }}` contains unexpected path components.

---

## Code Examples

### Extension Release Workflow (complete skeleton)

```yaml
# .github/workflows/ext-release.yml
# Source: vsce docs + softprops/action-gh-release@v2 docs + VS Code CI docs
name: Extension Release

on:
  push:
    tags:
      - 'ext/v*'

jobs:
  build-and-test:
    name: Build + Test (${{ matrix.target }})
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: linux-x64
          - os: ubuntu-24.04-arm
            target: linux-arm64
          - os: macos-latest
            target: darwin-arm64
          - os: macos-15-large   # DECISION NEEDED: macos-13 deprecated Dec 2025
            target: darwin-x64
      fail-fast: false
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: extension/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: extension

      - name: TypeScript typecheck
        run: npx tsc --noEmit
        working-directory: extension

      - name: Build extension
        run: npm run build:prod
        working-directory: extension

      - name: Run integration tests (Linux — requires Xvfb)
        run: xvfb-run -a npm test
        if: runner.os == 'Linux'
        working-directory: extension

      - name: Run integration tests (macOS)
        run: npm test
        if: runner.os != 'Linux'
        working-directory: extension

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

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*.vsix
          name: Extension ${{ github.ref_name }}
```

### CLI Release Workflow (complete skeleton)

```yaml
# .github/workflows/cli-release.yml
# Source: cli-ci.yml patterns + softprops/action-gh-release@v2 docs
name: CLI Release

on:
  push:
    tags:
      - 'cli/v*'

jobs:
  build-cli:
    name: Build CLI (${{ matrix.target }})
    strategy:
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
          - os: macos-15-large   # DECISION NEEDED: macos-13 deprecated
            target: darwin-x64
            suffix: darwin-x64
      fail-fast: false
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable

      - uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry/index/
            ~/.cargo/registry/cache/
            ~/.cargo/git/db/
            cli/target/
          key: ${{ runner.os }}-cargo-${{ hashFiles('cli/Cargo.lock') }}
          restore-keys: ${{ runner.os }}-cargo-

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

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/this-code-*
          name: CLI ${{ github.ref_name }}
```

### Updated ci.yml with Xvfb Integration Tests

```yaml
# Addition to .github/workflows/ci.yml
# New step after "Build extension bundle", before "Verify manifest":
- name: Run integration tests (Linux — requires Xvfb)
  run: xvfb-run -a npm test
  if: runner.os == 'Linux'
  working-directory: extension

- name: Run integration tests (macOS)
  run: npm test
  if: runner.os != 'Linux'
  working-directory: extension
```

### VSIX Naming Convention (Claude's Discretion)

```
this-code-{version}-{target}.vsix
Examples:
  this-code-0.1.0-linux-x64.vsix
  this-code-0.1.0-linux-arm64.vsix
  this-code-0.1.0-darwin-arm64.vsix
  this-code-0.1.0-darwin-x64.vsix
```

### CLI Binary Naming Convention (Claude's Discretion)

```
this-code-{platform}-{arch}
Examples:
  this-code-linux-x64
  this-code-linux-arm64
  this-code-darwin-arm64
  this-code-darwin-x64
```

### Expected CLI Major Version Storage (Claude's Discretion)

**Recommendation: hardcoded constant in `cliDetect.ts`**

A constant in source is the simplest approach and avoids making `package.json` parsing a runtime dependency. The extension reads its own `package.json` at build time anyway. When CLI compatibility changes, the developer updates the constant and bumps the extension version.

```typescript
// In extension/src/cliDetect.ts
// Update when CLI changes break backward compatibility with the extension
const EXPECTED_CLI_MAJOR = 0;
```

A custom `package.json` field (e.g., `"thisCode.expectedCliMajorVersion": 0`) is also valid but requires `require('../../package.json')` at runtime which has minor bundle complexity. Hardcoded constant is simpler.

### Pre-Release Marketplace Publish (Manual Instructions)

```bash
# After downloading VSIX files from the GitHub Release:
cd /path/to/downloaded-vsix

# Publish each platform-specific VSIX to the pre-release channel
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-0.1.0-linux-x64.vsix
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-0.1.0-linux-arm64.vsix
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-0.1.0-darwin-arm64.vsix
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-0.1.0-darwin-x64.vsix

# Authentication: VSCE_PAT env var must be set
# PAT scope: Azure DevOps PAT with Marketplace (Manage) scope
# Publisher: whardier (must match package.json publisher field)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `macos-13` (Intel runner) | `macos-15-intel` or `macos-15-large` | December 2025 | D-05 `macos-13` entry is invalid; needs update |
| `preview: true` in package.json | `--pre-release` flag at publish time | Pre-dates this project | No package.json change needed for pre-release |
| `actions/upload-release-asset` (deprecated) | `softprops/action-gh-release@v2` | ~2022 | Use v2; v3 requires Node 24 runtime |
| node-pre-gyp prebuilts in npm tarball | Download at install time from GitHub Releases | `@vscode/sqlite3` v5.0.2+ | `npm ci` on native runner fetches correct prebuilt automatically |

**Deprecated/outdated:**
- `macos-13`: End-of-life December 4, 2025 [VERIFIED: GitHub Changelog]
- `GabrielBB/xvfb-action`: Works but adds dependency; official VS Code docs recommend inline `xvfb-run -a` [CITED: code.visualstudio.com/api/working-with-extensions/continuous-integration]
- `actions/upload-release-asset` (original GitHub action): Superseded by `softprops/action-gh-release`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `macos-15-large` is available as a free standard runner for public GitHub repos | Standard Stack / Code Examples | If it's a "larger runner" (paid), the darwin-x64 job incurs cost. Alternative: `macos-15-intel` may be the correct free-tier label. Needs user confirmation. |
| A2 | `EXPECTED_CLI_MAJOR = 0` is correct for v0.1.0 | Code Examples (cliDetect.ts) | If CLI versioning uses a different convention for v0.x.x, major comparison may produce false positives |
| A3 | `this-code --version` outputs `this-code 0.1.0` format (Clap default) | Code Examples (cliDetect.ts) | If Clap outputs a different format, the regex `(\d+)\.\d+\.\d+` still matches standard semver in any output — low risk |

---

## Open Questions (RESOLVED)

1. **macos-13 replacement for darwin-x64**
   - What we know: `macos-13` is deprecated. `macos-15-intel` is the current Intel x64 standard runner; `macos-15-large` is a larger runner.
   - What's unclear: Whether `macos-15-intel` is free for public repos at standard tier, or requires paid plan. The GitHub docs page said macOS standard runners are free for public repos, which would include `macos-15-intel`.
   - RESOLVED: Use `macos-15-large` for darwin-x64. Flag in plan as a one-line change point if `macos-15-intel` turns out to be the correct free-tier label. Plans implement `macos-15-large`.

2. **`.vscodeignore` dev dependency exclusion during release build**
   - What we know: `vsce package` respects `.vscodeignore`. Current file excludes `node_modules/**` with exception for `@vscode/sqlite3`.
   - What's unclear: Whether `npm ci` (full install, including devDeps) or `npm ci --omit=dev` should be used before packaging. vsce handles node_modules exclusion itself via `.vscodeignore`, so full `npm ci` is fine.
   - RESOLVED: Use full `npm ci` (not `--omit=dev`) because the build step needs TypeScript and esbuild. The `.vscodeignore` already excludes all other `node_modules`. Plans implement full `npm ci`.

3. **Pre-release engines version requirement**
   - What we know: Pre-release extensions need `engines.vscode >= 1.63.0`. Current package.json has `"vscode": "^1.75.0"` which satisfies this.
   - What's unclear: Nothing — `^1.75.0` > `1.63.0`, requirement is met automatically.
   - RESOLVED: No change needed. `engines.vscode: "^1.75.0"` already satisfies the pre-release requirement.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Extension packaging | ✓ | v24.15.0 | — |
| cargo | CLI release builds | ✓ | 1.95.0 | — |
| @vscode/vsce (npx) | VSIX packaging | ✓ | 3.9.1 | — |
| xvfb-run | Linux integration tests | ✗ (macOS dev machine) | — | Xvfb is standard on GitHub ubuntu-latest runners |
| @vscode/test-cli | Integration tests | ✓ | 0.0.12 | — |
| @vscode/test-electron | Integration tests | ✓ | 2.5.2 | — |

**Missing dependencies with no fallback:**
- None that block local execution. `xvfb-run` is not available on macOS (dev machine) but is pre-installed on GitHub ubuntu-latest runners — tests run without Xvfb on macOS.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | @vscode/test-cli 0.0.12 + @vscode/test-electron 2.5.2 |
| Config file | `extension/.vscode-test.js` (exists) |
| Quick run command | `npm test` (from extension/) — macOS; `xvfb-run -a npm test` (Linux CI) |
| Full suite command | Same — all tests in one suite |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-01 | Marketplace publisher matches `whardier.this-code` | unit (manifest check) | `npm test` (extends existing EXT-01 test) | ✅ extension.test.ts |
| PKG-02 | VSIX produced per target with correct sqlite3 native | smoke (CI build check) | `vsce package --target linux-x64` in workflow | ❌ Wave 0 (CI-only verification) |
| PKG-03 | CLI detection notified when missing | integration | `npm test` (new suite) | ❌ Wave 0 |
| PKG-03 | CLI version mismatch notification | integration | `npm test` (new suite) | ❌ Wave 0 |
| PKG-04 | CI matrix builds all 4 VSIXes | smoke (CI YAML verification) | workflow run | ❌ Wave 0 (CI workflow) |

### Sampling Rate

- **Per task commit:** `npm run typecheck` (type safety gate; tests need Xvfb/VS Code binary)
- **Per wave merge:** `xvfb-run -a npm test` (on Linux) or `npm test` (on macOS)
- **Phase gate:** Full suite green on all platforms before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] New test suite in `extension/src/test/extension.test.ts` — covers PKG-03 (CLI detection logic)
- [ ] CI integration test for PKG-02 verification (VSIX contains sqlite3 native) — CI-only, not unit testable
- [ ] `.github/workflows/ext-release.yml` — covers PKG-04
- [ ] `.github/workflows/cli-release.yml` — covers D-06/D-07

*Note: The existing `extension/src/test/extension.test.ts` already tests EXT-01 through PLAT-01. PKG-03 detection logic lives in a new `cliDetect.ts` module with testable exports.*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — (no user auth in this phase) |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes (partial) | Version string from `this-code --version` parsed with regex — regex is defensive, not user-facing |
| V6 Cryptography | No | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CLI binary path traversal | Tampering | Path is hardcoded constant `~/.this-code/bin/this-code`; not user-configurable |
| Malicious `--version` output (code injection) | Tampering | Output only read as string; parsed with regex; never eval'd or shell-interpolated |
| GitHub Release asset substitution | Tampering | GitHub Release assets are immutable once uploaded; covered by repo permissions |
| VSCE_PAT exposure in CI logs | Elevation of Privilege | D-10 prohibits storing PAT in CI for Phase 5 — not applicable |

---

## Sources

### Primary (HIGH confidence)

- `/microsoft/vscode-vsce` (Context7) — package, publish, createVSIX API docs; `--target` flag; `--pre-release` flag
- [code.visualstudio.com — Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) — pre-release requirements, version numbering, valid target strings, `engines.vscode` minimum
- [code.visualstudio.com — Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) — Xvfb pattern: `xvfb-run -a npm test` conditional on Linux
- `extension/package-lock.json` + npm registry — verified @vscode/vsce@3.9.1, @vscode/test-cli@0.0.12, @vscode/test-electron@2.5.2
- `/tmp/sqlite3-inspect/package/package.json` — verified `@vscode/sqlite3` binary.module_path: `./lib/binding/napi-v{n}-{platform}-{libc}-{arch}`
- Local inspection: `extension/node_modules/@vscode/sqlite3/` — verified `.vscodeignore` covers both `lib/binding/` and `build/Release/` paths
- [softprops/action-gh-release v2](https://github.com/softprops/action-gh-release/tree/v2) — permissions: `contents: write`; files glob; merge-multiple; v3 requires Node 24

### Secondary (MEDIUM confidence)

- [GitHub Changelog — macos-13 deprecation](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/) — confirmed fully unsupported December 2025
- [GitHub Changelog — Linux arm64 GA](https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/) — `ubuntu-24.04-arm` confirmed available for public repos
- [GitHub Discussions — macOS 15 Intel runner](https://github.com/actions/runner-images/issues/13045) — `macos-15-large` label for Intel x64
- npm view: `actions/upload-artifact@v7`, `actions/download-artifact@v8` — confirmed v4 tag aliases still current

### Tertiary (LOW confidence)

- WebSearch results on `execFile` in VS Code extensions — no official VS Code docs specifically prohibit `execFile` in workspace extensions; multiple community examples use it. Marked LOW because no official API doc confirmed it.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against npm registry and context7
- Architecture patterns: HIGH — verified against official VS Code CI docs and vsce docs
- Pitfalls: MEDIUM-HIGH — macos-13 deprecation verified; others from docs/pattern analysis
- Runner labels: MEDIUM — `macos-15-large` vs `macos-15-intel` needs clarification for darwin-x64

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (GitHub Actions runner labels change frequently — recheck macos darwin-x64 label before planning)
