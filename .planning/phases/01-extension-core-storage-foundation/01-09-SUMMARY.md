---
plan: 01-09
phase: 01-extension-core-storage-foundation
status: complete
completed: 2026-04-27
gaps_closed:
  - UAT-T2
  - UAT-T6
self_check: PASSED
---

# Plan 01-09 Summary: cli/servers/Stable-{hash} Path Extraction

## What Was Built

Added dual-pattern extraction to `extractCommitHash()` and `extractServerBinPath()` in
`extension/src/session.ts` to handle the current VS Code remote server path structure
(`cli/servers/Stable-{40-hex}/server`). The legacy `bin/{40-hex}` strategy is preserved
as Strategy 1; the new `cli/servers` strategy is Strategy 2.

## Changes

### extension/src/session.ts

- **`extractCommitHash()`**: Added Strategy 2 — locates the `servers` path segment via
  `lastIndexOf("servers")`, extracts the `Stable-{hash}` segment immediately after it,
  and strips the `Stable-` prefix returning the raw 40-char hex hash. Legacy Strategy 1
  (`bin/{hash}`) unchanged.

- **`extractServerBinPath()`**: Added Strategy 2 — for `cli/servers` paths, returns the
  path up to and including the `Stable-{hash}` segment (not including `/server`). Legacy
  Strategy 1 unchanged.

### extension/src/test/extension.test.ts

Added a third test in the `SESSION-HELPERS` suite:
`"cli/servers/Stable-{hash} path: getSessionJsonPath uses SSH path"` — verifies that
when `server_commit_hash` is set (as the fixed `extractCommitHash()` would produce) and
`remote_name` is `"ssh-remote"`, `getSessionJsonPath()` routes to
`~/.vscode-server/.../this-code-session.json` containing the commit hash.

## Verification

- `serversIdx` present in session.ts: 7 occurrences ✓
- `Stable-` present in session.ts: 5 occurrences ✓
- `binIdx` (legacy) still present: 7 occurrences ✓
- `cli/servers` in extension.test.ts: 2 occurrences ✓
- `npx tsc --noEmit`: exits 0 ✓
- `npm run build`: exits 0, dist/extension.js contains `Stable-` ✓

## Gaps Closed

- **UAT-T2**: SSH remote session JSON now contains `server_commit_hash` (40-char hex) extracted
  from `local_ide_path` when path follows `cli/servers/Stable-{hash}/server` structure.
- **UAT-T6**: `getSessionJsonPath()` now routes SSH sessions to `~/.vscode-server/...` instead
  of the local fallback, because `server_commit_hash` is no longer null.

## Deviations

None. Implementation followed the plan exactly.
