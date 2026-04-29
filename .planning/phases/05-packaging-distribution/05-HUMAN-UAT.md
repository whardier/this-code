---
status: partial
phase: 05-packaging-distribution
source: [05-VERIFICATION.md]
started: "2026-04-29T00:00:00.000Z"
updated: "2026-04-29T00:00:00.000Z"
---

## Current Test

[awaiting human testing]

## Tests

### 1. Extension release workflow end-to-end

expected: Push `ext/v0.1.0` tag; all 4 platform VSIX jobs run, integration tests pass with Xvfb on Linux, GitHub Release created with 4 `.vsix` files attached.
result: [pending]

### 2. CLI release workflow end-to-end

expected: Push `cli/v0.1.0` tag; 4 native-built binaries (`this-code-linux-x64`, `this-code-linux-arm64`, `this-code-darwin-arm64`, `this-code-darwin-x64`) appear in a GitHub Release.
result: [pending]

### 3. CLI-missing notification in live VS Code

expected: Install extension when `~/.this-code/bin/this-code` does not exist; information notification with "Download" button appears and opens the releases URL.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
