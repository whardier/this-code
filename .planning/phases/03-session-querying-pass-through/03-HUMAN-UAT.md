---
status: partial
phase: 03-session-querying-pass-through
source: [03-VERIFICATION.md]
started: 2026-04-28T09:45:00Z
updated: 2026-04-28T09:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live query against real sessions.db

expected: `this-code query /path/to/workspace` returns session data (workspace, profile, user_data_dir, server_hash, open_files count, invoked_at) when Phase 1 extension has written a session for that path
result: [pending]

### 2. --dry-run with real code binary

expected: `this-code query /path --dry-run` prints `would exec: /path/to/real/code /path/to/workspace` without launching VS Code
result: [pending]

### 3. Shim pass-through unchanged

expected: `code /path/to/workspace` (via the `code` symlink) behaves identically to Phase 2 baseline — pure pass-through with no session-routing behavior
result: [pending]

### 4. --json output structure

expected: `this-code query /path --json` outputs valid pretty-printed JSON with `open_files` as an array (not a string), and all session fields present
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
