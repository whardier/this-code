---
phase: post-milestone
fixed_at: 2026-04-29T00:00:00Z
review_path: .planning/post-milestone-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Post-Milestone: Code Review Fix Report

**Fixed at:** 2026-04-29T00:00:00Z
**Source review:** .planning/post-milestone-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical, 4 Warning)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: `ipc_hook_cli` silently dropped — `server_bin_path` receives `remote_server_path` twice

**Files modified:** `extension/src/extension.ts`
**Commit:** b132fc5
**Applied fix:** Added clarifying comments to the two ambiguous values in the INSERT values array. Position [7] (`remote_server_path` aliased to `server_bin_path`) now carries `// server_bin_path — intentional alias; SessionMetadata has no dedicated server_bin_path field` and position [8] (`ipc_hook_cli`) now carries `// ipc_hook_cli`. The actual data was already correct in the current code — `metadata.ipc_hook_cli` was at position [8] as required. The fix documents the intentional aliasing so future readers do not mistake position [7] for a copy-paste error.

---

### WR-01: Schema v2 migration silently no-ops on fresh installs

**Files modified:** `extension/src/db.ts`
**Commit:** bcb3308
**Applied fix:** Replaced the two stale `(versionRow?.user_version ?? 0)` guard expressions with a single `let currentVersion = versionRow?.user_version ?? 0` variable declared before the first migration block. Each block now updates `currentVersion` after setting `PRAGMA user_version` (`currentVersion = 1` after the v1 block, `currentVersion = 2` after the v2 block). This ensures any future v3 migration gate reads the post-migration version rather than the value captured before any migrations ran.

---

### WR-02: `resolve_shim_lookup_path` strips colons from absolute paths and Windows paths

**Files modified:** `cli/src/shim.rs`
**Commit:** 029dc6a
**Applied fix:** Extracted a new `strip_goto_suffix(s: &str) -> &str` helper that walks backward from the end of the string using `rfind(':')`. It only strips when the trailing colon-separated segments are entirely ASCII digits (empty segments are not stripped). A `file.ts:10:5` loses both suffixes; a Windows path `C:\Users\foo\bar.ts:10:5` correctly loses only `:10:5` since `C` is not all-digits; a path with a colon in a directory name like `some:dir/file.ts` is left intact since `dir/file.ts` is not all-digits. Added 7 unit tests covering all these cases. All 35 CLI tests pass.

---

### WR-03: `session_to_json` omits `ipc_hook_cli` from JSON output

**Files modified:** `cli/src/query.rs`
**Commit:** 1554f1b
**Applied fix:** Added `"ipc_hook_cli": session.ipc_hook_cli` to the `json!({...})` literal in `session_to_json`, placed between `server_bin_path` and `open_files`. The `Session` struct already carried the field (confirmed by the existing test's `make_test_session`). All 35 CLI tests pass.

---

### WR-04: `scanExistingRemoteSessions` does not populate `ipc_hook_cli` when backfilling

**Files modified:** `extension/src/storage.ts`
**Commit:** e286702
**Applied fix:** Added `ipc_hook_cli?: string | null` to the inline parsed-session type cast, extended the INSERT column list to include `ipc_hook_cli` (10 columns total), updated `VALUES` to `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` (10 placeholders), and added `session.ipc_hook_cli ?? null` at position [8] in the params array. Sessions backfilled from on-disk `this-code-session.json` files will now carry the IPC socket path into the index, enabling shim routing for pre-existing SSH sessions.

---

_Fixed: 2026-04-29T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
