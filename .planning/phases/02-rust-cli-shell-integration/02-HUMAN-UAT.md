---
status: partial
phase: 02-rust-cli-shell-integration
source: [02-VERIFICATION.md]
started: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end shim pass-through

expected: Run `code .` via the installed shim (`~/.this-code/bin/code`) against a real VS Code binary. VS Code launches normally with no infinite recursion, no error output, no hung process. `THIS_CODE_ACTIVE=1` appears in VS Code's environment.
result: [pending]

### 2. macOS zsh path_helper ordering

expected: On macOS with zsh, after adding `. "$HOME/.this-code/env"` to `~/.zshrc` and opening a new terminal, `which code` returns `/Users/spencersr/.this-code/bin/code` (not the system VS Code path). The case-colon guard in the env file keeps the shim leftmost even after `/etc/zprofile` (macOS path_helper) runs.
result: [pending]

### 3. Recursion guard end-to-end

expected: With the symlink active, invoke `THIS_CODE_ACTIVE=1 ~/.this-code/bin/code --help`. The recursion guard fires (`is_ok_and(|v| v == "1")` returns true), the binary proceeds directly to `discover_real_code()` + `exec_real_code()`, the real VS Code binary is exec'd exactly once, and the process does not recurse.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
