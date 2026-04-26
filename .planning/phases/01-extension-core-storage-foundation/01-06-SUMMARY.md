---
phase: "01-extension-core-storage-foundation"
plan: "06"
subsystem: "extension-logging"
tags: ["typescript", "vscode-extension", "output-channel", "logging", "logLevel-gating"]
dependency_graph:
  requires:
    - phase: "01-extension-core-storage-foundation"
      plan: "04"
      provides: "activate() with document event handlers and updateOpenFiles()"
    - phase: "01-extension-core-storage-foundation"
      plan: "05"
      provides: "scanExistingRemoteSessions() and fire-and-forget scan in activate()"
    - phase: "01-extension-core-storage-foundation"
      plan: "01"
      provides: "config.ts with isEnabled() and getLogLevel() complete"
  provides:
    - "Full OutputChannel logging integrated throughout activate(), deactivate(), updateOpenFiles()"
    - "log() helper with 'off'/'info'/'debug' logLevel gating"
    - "globalStorageUri.fsPath emitted at debug level for empirical D-01 validation"
    - "All metadata fields logged at debug level on activation"
    - "Always-emit paths for disabled state and activation failure (not gated by logLevel)"
    - "EXT-04 compliance: no UI calls (no showInformationMessage/showWarningMessage/showErrorMessage)"
  affects:
    - "01-07 (PLAT-01 platform tests — final plan in phase)"
tech_stack:
  added: []
  patterns:
    - "log() helper gates appendLine via getLogLevel() — 'off' suppresses all, 'debug' enables verbose"
    - "outputChannel?.appendLine optional chaining — safe before channel creation (never called before)"
    - "Always-emit pattern for disabled and error messages — bypasses logLevel gate"
    - "getLogLevel() called on every log() invocation — reads live config, no caching"
key_files:
  created: []
  modified:
    - "extension/src/extension.ts"
decisions:
  - "getLogLevel imported at module level via ES import — consistent with all other imports, avoids inline require"
  - "log() reads getLogLevel() on every call — ensures live config changes take effect without restart"
  - "Disabled-state message uses direct outputChannel.appendLine (not log()) — always emits even when logLevel=off"
  - "Activation failure message uses direct outputChannel?.appendLine — always emits, optional chaining handles pre-creation edge case"
  - "D-01 globalStorageUri.fsPath comment retained inline with log call — explains why this specific field matters"
metrics:
  duration_seconds: 97
  completed_date: "2026-04-26"
  tasks_completed: 1
  files_created: 0
  files_modified: 1
---

# Phase 01 Plan 06: OutputChannel Logging Integration Summary

**OutputChannel 'This Code' fully wired throughout activate(), deactivate(), and updateOpenFiles() with logLevel-gating via a log() helper — getLogLevel() imported at module level, globalStorageUri.fsPath logged at debug for D-01 empirical validation, disabled and error paths always emit regardless of logLevel.**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Integrate OutputChannel logging and logLevel-gating throughout extension.ts | d2c492b | extension/src/extension.ts |

## Implementation Details

### Log Levels Emitted

**`logLevel = "off"`:**
- No appendLine calls except:
  - Always-emit: disabled-state message (when `thisCode.enable = false`)
  - Always-emit: activation failure message (catch block)

**`logLevel = "info"` (default):**
- "This Code activating..."
- "Database initialized: {dbPath}"
- "Session JSON written: {sessionJsonPath}"
- "Invocation recorded. ID: {id}"
- "Starting background session scan..."
- "This Code activated successfully. Invocation ID: {id}"
- "Startup scan error: {message}" (if background scan throws)
- "This Code deactivating..."
- Plus all always-emit messages above

**`logLevel = "debug"`:**
- All info lines above, plus:
- "Ensured directories: {thisCodeDir}"
- "globalStorageUri.fsPath = {path}" (D-01 empirical validation)
- "workspace_path = {path|(none)}"
- "remote_name = {name|(local)}"
- "server_commit_hash = {hash|(not SSH remote)}"
- "user_data_dir = {path|(null)}"
- "profile = {id|(null — default profile or parse failed)}"
- "local_ide_path = {path}"
- "onDidOpenTextDocument fired — rebuilding open_files"
- "onDidCloseTextDocument fired — rebuilding open_files"
- "open_files rebuilt: {N} file(s)"
- "Database closed."

### log() Helper

```typescript
function log(level: "info" | "debug", message: string): void {
  const currentLevel = getLogLevel();
  if (currentLevel === "off") { return; }
  if (level === "debug" && currentLevel !== "debug") { return; }
  outputChannel?.appendLine(`[${level}] ${message}`);
}
```

`getLogLevel()` is called on every invocation — live config changes take effect immediately without requiring extension reload.

### Module-Level Import

```typescript
import { isEnabled, getLogLevel } from "./config";
```

ES import at the top of the module — not an inline `require()`. Consistent with all other imports in the file.

### EXT-04 Compliance

No `vscode.window.showInformationMessage`, `showWarningMessage`, or `showErrorMessage` calls exist in extension.ts. All user-facing output goes exclusively through the OutputChannel named "This Code".

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation | Verification |
|-----------|------------|--------------|
| T-06-01 | File paths in debug log output only visible to local VS Code user; logLevel defaults to 'info' (paths suppressed unless user enables debug) | grep confirms no paths logged at info level |
| T-06-02 | thisCode.enable early return is a user preference gate, not a security boundary | isEnabled() check present before any DB/event initialization |
| T-06-03 | log() on document events only when logLevel=debug (opt-in); OutputChannel.appendLine is synchronous but lightweight | debug guard in log() helper confirmed |

## Known Stubs

None — this plan adds no new stubs. Remaining from prior plans:
- PLAT-01 test suite: Plan 07 (final plan in phase)

## Threat Flags

No new threat surface beyond the plan's threat model. T-06-01 through T-06-03 all addressed.

## Self-Check: PASSED

- extension/src/extension.ts contains `getLogLevel`: FOUND (import line + log() body)
- extension/src/extension.ts contains `globalStorageUri.fsPath`: FOUND (log call line 60)
- extension/src/extension.ts contains `function log`: FOUND
- extension/src/extension.ts contains no `showInformationMessage`: CONFIRMED
- extension/src/extension.ts contains no `onDidSaveTextDocument`: CONFIRMED
- extension/src/extension.ts contains no `require('./config')`: CONFIRMED
- Commit d2c492b exists: FOUND
- tsc --noEmit exits 0: CONFIRMED
