# Phase 5: Packaging + Distribution - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers:

1. Platform-specific VSIX packages for 4 targets (darwin-arm64, darwin-x64, linux-x64, linux-arm64) with correct `@vscode/sqlite3` prebuilts per platform
2. Extension activation logic that checks for the CLI binary and notifies users if it is missing or version-incompatible
3. Two separate GitHub Actions release workflows — `ext/v*` tags for extension releases, `cli/v*` tags for CLI binary releases
4. VS Code integration tests (vscode-test + Xvfb) wired into `ci.yml` and gating the release workflow
5. Documentation/instructions for manual Marketplace pre-release publication

**Note on PKG-03:** The original requirement specified bundling the Rust CLI binary inside the VSIX. This decision has been revised — the CLI binary is NOT bundled. The extension instead detects CLI presence at activation and surfaces install guidance via VS Code notifications. PKG-03 scope is now: extension detects + guides CLI install, CLI binary ships as a separate GitHub Release asset.

</domain>

<decisions>
## Implementation Decisions

### CLI Status Detection (Extension Activation)

- **D-01:** CLI binary is NOT bundled in the VSIX. No binary and no installer script is placed on the remote system.
- **D-02:** On activation, extension checks for the CLI binary at `~/.this-code/bin/this-code`. If not found, extension shows a VS Code information notification with a link to https://github.com/whardier/this-code instructing the user to download a release.
- **D-03:** If the CLI binary IS found, extension runs `this-code --version`, parses the semver output, and compares major versions against the extension's declared expected CLI major version. If major versions differ, extension shows a compatibility warning notification.
- **D-04:** CLI detection runs during extension activation (`onStartupFinished`). Detection is non-blocking — extension continues recording session data regardless of CLI status.

### Platform Build Matrix

- **D-05:** 4 native GitHub Actions runners are used for VSIX builds (required to get the correct `@vscode/sqlite3` prebuilt per platform):
  - `ubuntu-latest` → `linux-x64`
  - `ubuntu-24.04-arm` → `linux-arm64`
  - `macos-latest` → `darwin-arm64`
  - `macos-13` → `darwin-x64`
- **D-06:** CLI binary GitHub Release assets are also built natively on the same 4 runners in the same release workflow (no cross-compilation). Each runner produces a platform-specific `this-code` binary uploaded as a release asset.

### Release Workflow Design

- **D-07:** Two separate release workflows with distinct tag patterns:
  - `ext/v*` (e.g., `ext/v0.1.0`) → triggers extension release: builds 4 platform VSIXes, uploads as GitHub Release assets
  - `cli/v*` (e.g., `cli/v0.1.0`) → triggers CLI release: builds 4 platform Rust binaries, uploads as GitHub Release assets
- **D-08:** Marketplace publish is semi-automated. CI builds and uploads VSIX artifacts to the GitHub Release. Developer downloads artifacts and runs `vsce publish --pre-release` manually for the initial release.
- **D-09:** Marketplace channel is **pre-release** for the first publication. Graduate to stable channel after validation.
- **D-10:** No PAT stored in CI for automated Marketplace publish (can be added later). Marketplace publish step is always a manual developer action for Phase 5.

### CI Integration Tests

- **D-11:** Xvfb + `vscode-test` (npm run test) added to the existing `ci.yml` extension workflow. Runs on every push/PR alongside typecheck and build. Linux runner uses `Xvfb` to provide a virtual display for the VS Code test host.
- **D-12:** Integration tests gate the release workflow — extension release workflow declares `needs: [build-and-test]` so integration tests must pass on all platforms before VSIX packaging begins.

### Claude's Discretion

- VSIX artifact naming convention per platform (e.g., `this-code-0.1.0-darwin-arm64.vsix`)
- CLI binary naming convention per platform (e.g., `this-code-darwin-arm64`, `this-code-linux-x64`)
- GitHub Release asset organization (separate releases per tag vs single release with all assets)
- Exact `vsce package --target` flag syntax for each platform target
- How extension stores its "expected CLI major version" (hardcoded constant, package.json field, or separate config)
- `npm ci --omit=dev` vs full `npm ci` in the packaging workflow (only production deps in VSIX)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Extension Packaging

- `extension/package.json` — Extension metadata (publisher, name, version, scripts, dependencies). `vsce package` script already present. `@vscode/vsce ^3.9.0` in devDependencies.
- `extension/.vscodeignore` — Controls VSIX contents. Already includes `!node_modules/@vscode/sqlite3/**` for native SQLite prebuilts. Needs review for platform-specific packaging.
- `extension/esbuild.js` — Bundler config. `@vscode/sqlite3` marked as `external` — must remain so for native prebuilts to work.

### Existing CI

- `.github/workflows/ci.yml` — Extension CI (typecheck + build + manifest verify). Xvfb integration tests will be added here (D-11).
- `.github/workflows/cli-ci.yml` — CLI CI (fmt + clippy + build + test). Separate from release workflow.

### CLI

- `cli/Cargo.toml` — CLI crate metadata (`version = "0.1.0"`, `publish = false`). `rusqlite` uses `bundled` feature (no system SQLite dependency — portable binary).

### Requirements

- `.planning/REQUIREMENTS.md` — PKG-01 through PKG-04 (packaging requirements, noting PKG-03 scope change per D-01)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `extension/package.json` `"package": "vsce package"` script — base for platform-targeted packaging
- `@vscode/vsce ^3.9.0` already installed — no new tooling needed for packaging
- `extension/.vscodeignore` already handles `@vscode/sqlite3` native prebuilt inclusion pattern
- `cli/Cargo.toml` `rusqlite = { version = "0.39", features = ["bundled"] }` — CLI binary is self-contained, no dynamic SQLite dependency

### Established Patterns

- GitHub Actions matrix with `fail-fast: false` — already used in both `ci.yml` and `cli-ci.yml`; same pattern extends to release matrix
- `dtolnay/rust-toolchain@stable` + `actions/cache@v4` for Cargo — already in `cli-ci.yml`, reuse in release workflow
- `actions/setup-node@v4` with `cache: npm` — already in `ci.yml`, reuse in release workflow
- `npm ci` installs platform-specific `@vscode/sqlite3` prebuilts automatically — native runner per target is the correct approach

### Integration Points

- Extension activation code (`extension/src/extension.ts`) — CLI detection logic (D-02, D-03, D-04) adds to the existing `activate()` function
- `~/.this-code/bin/this-code` — the hardcoded CLI path the extension checks (established in Phase 2 install command)
- `onStartupFinished` activation event — CLI check runs in the same activation flow as session recording

</code_context>

<specifics>
## Specific Ideas

- CLI binary download page: https://github.com/whardier/this-code (releases page)
- Extension notification for missing CLI should include a direct link — `vscode.window.showInformationMessage('This Code: CLI not found', 'Download')` pattern with `Open External` action
- Future enhancement noted by user: shell script installer for CLI binary (out of scope for Phase 5, tracked as deferred)
- Tag examples: `ext/v0.1.0` for first extension release, `cli/v0.1.0` for first CLI release
- Platform VSIX targets map to `vsce package --target` values: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`
</specifics>

<deferred>
## Deferred Ideas

- **Shell script CLI installer** — User noted this as a future enhancement. A script at a known URL that downloads + installs the correct CLI binary for the current platform. Not in scope for Phase 5.
- **Automated Marketplace publish via PAT** — Can be added to the release workflow once manual publish is validated. Requires storing `VSCE_PAT` as a GitHub Actions secret.
- **Stable channel Marketplace listing** — After pre-release iteration, promote to stable with `vsce publish` (without `--pre-release`).
- **PKG-03 original scope** — Bundling CLI binary inside VSIX was the original intent. Reversed in Phase 5; may revisit if notification-based guidance proves insufficient.

</deferred>

---

_Phase: 05-packaging-distribution_
_Context gathered: 2026-04-28_
