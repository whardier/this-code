# Release Guide

## Pre-Release Matrix Verification

Before tagging either component, run the full 4-platform matrix manually to catch build or test failures across all targets:

**Extension** — go to Actions → Extension Release → Run workflow, enter the target version (e.g. `1.1.0`). All four platform jobs run; the GitHub Release step is skipped.

**CLI** — go to Actions → CLI Release → Run workflow, enter the target version (e.g. `1.0.0-alpha.1`). All four platform binaries are built and uploaded as artifacts; the GitHub Release step is skipped.

Download the artifacts from the workflow run and smoke-test on your platform before proceeding to tag.

---

## Extension Release (Marketplace)

### 1. Tag and trigger CI

```bash
git tag ext/v1.1.0
git push origin ext/v1.1.0
```

This triggers `.github/workflows/ext-release.yml`, which builds 4 platform VSIXes and uploads them to a GitHub Release.

### 2. Download VSIX artifacts

Download all 4 `.vsix` files from the GitHub Release at:
https://github.com/whardier/this-code/releases

### 3. Authenticate with Marketplace

```bash
npx @vscode/vsce login whardier
```

You will be prompted for a Personal Access Token (PAT) with **Marketplace > Manage** scope.

### 4. Publish to pre-release channel

```bash
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-1.1.0-linux-x64.vsix
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-1.1.0-linux-arm64.vsix
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-1.1.0-darwin-arm64.vsix
npx @vscode/vsce publish --pre-release \
  --packagePath this-code-1.1.0-darwin-x64.vsix
```

> **Important:** The `--pre-release` flag must be included on every `vsce publish` call.
> Omitting it publishes to the stable channel instead of pre-release.

### 5. Verify

Install `whardier.this-code` from the VS Code Marketplace (pre-release tab) and confirm it activates correctly.

---

## CLI Release (GitHub Releases only)

### 1. Tag and trigger CI

```bash
git tag cli/v1.0.0-alpha.1
git push origin cli/v1.0.0-alpha.1
```

This triggers `.github/workflows/cli-release.yml`, which builds 4 platform binaries and uploads them to a GitHub Release.

### 2. Install from GitHub Release

Users download the binary for their platform from:
https://github.com/whardier/this-code/releases

Then run `this-code install` to set up shell integration.

---

## Notes

- Extension and CLI are released independently via separate tag prefixes (`ext/v*` vs `cli/v*`).
- macOS darwin-x64 builds use `macos-15-large` runner. If builds fail on that runner, try `macos-15-intel` (free-tier standard label may change).
- Automated Marketplace publish via CI (storing `VSCE_PAT` as a secret) can be added in a future phase.
