# Phase 5: Packaging + Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 05-packaging-distribution
**Areas discussed:** CLI binary bundling behavior, Platform build matrix strategy, Release trigger and publish automation, VS Code integration tests in CI

---

## CLI binary bundling behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Extension auto-extracts it | On first activation, copies bundled binary to ~/.this-code/bin/this-code. Requires extension activation code changes. | |
| Bundle as convenience only | Binary in VSIX at bin/this-code; documented manual extraction step. | |
| Other (user provided) | CLI binary NOT bundled. Extension shows notification instead. | ✓ |

**User's choice:** CLI binary is not bundled at all. An executable script placeholder was considered but the user clarified: no script placed on the remote system. Extension shows a VS Code notification if CLI is missing, pointing to the GitHub release page. Also checks version compatibility if CLI is found.

| Option | Description | Selected |
|--------|-------------|----------|
| Extension shows a notification | Activation check; info notification if missing; warning if version incompatible. | ✓ |
| Bundled shell script in VSIX | Script ships in VSIX; extension logs its path for manual execution. | |
| Output Channel message only | Silent output channel message, no popup. | |

| Option | Description | Selected |
|--------|-------------|----------|
| No — extension and CLI are independent | Extension only writes SQLite, no CLI awareness. | |
| Yes — extension should detect and report CLI status | Extension detects CLI presence and version at activation. | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Run this-code --version, compare major version | Parse semver; warn if major version differs. | ✓ |
| Run this-code --version, require exact match | Warn on any version mismatch. | |
| Claude's discretion | Leave threshold to planner. | |

**Notes:** User explicitly noted this is for v1 simplicity. Future enhancement: a proper shell script installer served from the GitHub repo. The notification should include a "Download" action button that opens the releases page.

---

## Platform build matrix strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 4 native GitHub runners | ubuntu-latest, ubuntu-24.04-arm, macos-latest, macos-13. Clean, no cross-compilation. | ✓ |
| 2 native + cross for linux-arm64 | Use cross crate for ARM. Unreliable for native modules. | |
| Skip linux-arm64 for v1 | Ship 3 targets initially. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same 4 native runners as VSIX | Rust CLI built natively per platform in the same release workflow. | ✓ |
| Cross-compile with cross crate | Docker + QEMU from linux-x64. Doesn't work for macOS targets. | |
| Claude's discretion | Let planner decide. | |

**Notes:** Decision was quick — native runners for both VSIX and CLI binary builds. No cross-compilation complexity.

---

## Release trigger and publish automation

| Option | Description | Selected |
|--------|-------------|----------|
| Git tag push on v* pattern | Standard GitHub release pattern. | |
| Manual workflow dispatch | Developer controls release from GitHub UI. | |
| On merge to main | Every merge triggers pre-release build. | |
| Separate tag patterns (user provided) | ext/v* for extension, cli/v* for CLI. | ✓ |

**User's choice:** Separate release patterns for VSIX and CLI binary, tagged differently. User wants independent release cadences.

| Option | Description | Selected |
|--------|-------------|----------|
| ext/v* and cli/v* prefix | Extension: ext/v0.1.0. CLI: cli/v0.1.0. Path-style prefixes. | ✓ |
| extension-v* and cli-v* | Flat tag names without path separators. | |
| Single v* tag triggers both | Coupled release cadence. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Automated — PAT in GitHub secret | vsce publish in CI. Fully hands-off. | |
| Semi-automated — CI uploads, developer publishes | CI builds + uploads VSIXes to GitHub Release. Developer runs vsce publish manually. | ✓ |
| Manual only | No CI involvement in Marketplace publish. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-release channel first | vsce publish --pre-release for initial iteration. | ✓ |
| Stable channel directly | Go straight to stable. | |

**Notes:** The independent tag patterns allow bumping the CLI without re-packaging the extension and vice versa. Marketplace publish is manual for Phase 5 safety; automation can be added once the process is validated.

---

## VS Code integration tests in CI

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add to packaging CI workflow | Xvfb + vscode-test added to existing ci.yml. | ✓ |
| Yes — separate test workflow | New integration-test.yml file. | |
| Defer again | Keep existing CI as-is. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gate the release workflow | Release workflow needs: [build-and-test]. | ✓ |
| Parallel, non-blocking | Tests run alongside packaging but don't block. | |
| N/A — deferring | Not applicable. | |

**Notes:** The existing CI comment said Xvfb was deferred to "Phase 4 / Marketplace packaging" — that's now Phase 5. User chose to add it now and gate releases on it.

---

## Claude's Discretion

- VSIX artifact naming convention per platform
- CLI binary naming convention per platform
- GitHub Release asset organization
- Exact `vsce package --target` flag syntax
- How extension stores its expected CLI major version constant
- npm install flags in packaging workflow

## Deferred Ideas

- Shell script CLI installer (future enhancement, user mentioned explicitly)
- Automated Marketplace publish via PAT secret
- Stable channel Marketplace listing (after pre-release validation)
- PKG-03 original scope (bundled CLI in VSIX) — reversed, may revisit
