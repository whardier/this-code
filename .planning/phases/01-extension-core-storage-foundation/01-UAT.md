---
status: complete
phase: 01-extension-core-storage-foundation
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
  - 01-04-SUMMARY.md
  - 01-05-SUMMARY.md
  - 01-06-SUMMARY.md
  - 01-07-SUMMARY.md
  - 01-08-SUMMARY.md
started: 2026-04-26T23:15:00Z
updated: 2026-04-26T23:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Extension Activates Without Error

expected: |
  Install the VSIX (or sideload via "Install from VSIX" using `npm run package` output),
  open any folder in VS Code, then open the Output panel and switch to the "This Code"
  channel. You should see:
    [info] This Code activating...
    [info] Database initialized: /Users/you/.this-code/sessions.db
    [info] Session JSON written: /Users/you/.this-code/sessions/XXXXXXXXXXXXXXXX.json
    [info] Starting background session scan...
    [info] This Code activated successfully. Invocation ID: 1

  No error toast, no notification popup, no "activation failed" message.
result: pass
reported: "[info] This Code activating... [info] Database initialized: /Users/spencersr/.this-code/sessions.db [info] Session JSON written: /Users/spencersr/.this-code/sessions/4b4cb29aefa622b2.json [info] Invocation recorded. ID: 1 [info] Starting background session scan... [info] This Code activated successfully. Invocation ID: 1"

### 2. Session JSON Written With Correct Fields

expected: |
  After activation, run:
    cat ~/.this-code/sessions/*.json | head -1
  (or on SSH remote: cat ~/.vscode-server/bin/{hash}/this-code-session.json)

  The file should contain a JSON object with:
    schema_version: 1
    recorded_at: ISO timestamp
    workspace_path: absolute path to the open folder (or null if no folder)
    user_data_dir: on macOS → ~/Library/Application Support/Code (NOT empty string)
                   on Linux → ~/.config/Code
    open_files: [] (empty array at activation)
    server_commit_hash: null for local, 40-char hex for SSH remote
result: issue
reported: |
  {"schema_version":1,"recorded_at":"2026-04-27T08:08:48.631Z","workspace_path":"/Users/spencersr/src/github/whardier/int2x-frontend","user_data_dir":"/Users/spencersr/.vscode-server/data","profile":null,"local_ide_path":"/Users/spencersr/.vscode-server/cli/servers/Stable-10c8e557c8b9f9ed0a87f61f1c9a44bde731c409/server","remote_name":"ssh-remote","remote_server_path":null,"server_commit_hash":null,"open_files":[]}
severity: major
diagnosis: |
  SSH remote session but server_commit_hash is null and remote_server_path is null.
  Root cause: extractCommitHash() in session.ts searches for a path segment immediately
  after a "bin" segment matching /^[0-9a-f]{40}$/i. The new VS Code remote server path
  structure is cli/servers/Stable-{hash}/server — no "bin" segment, and the hash is
  prefixed with "Stable-" so the regex fails. extractServerBinPath() returns null because
  commitHash is null. getSessionJsonPath() falls back to local path (~/.this-code/sessions/)
  instead of the SSH path (~/.vscode-server/bin/{hash}/this-code-session.json).
  The hash IS present in local_ide_path — it just needs a second extraction pattern.

### 3. sessions.db Row Queryable via sqlite3 CLI

expected: |
  Run:
    sqlite3 ~/.this-code/sessions.db \
      "SELECT id, workspace_path, server_commit_hash, server_bin_path FROM invocations ORDER BY id DESC LIMIT 1;"

  Should return a row like:
    1|/Users/you/myproject||

  Key checks:
    - Row exists (not empty result)
    - workspace_path matches the folder you opened
    - server_commit_hash is NULL for local sessions (column present, not missing)
    - server_bin_path is NULL for local sessions
    - invoked_at column exists (verify: .schema invocations shows invoked_at TEXT NOT NULL)
result: pass
reported: "6|/Users/spencersr/src/github/whardier/int2x-frontend|| — row present, workspace_path correct, NULL values expected given issue logged in Test 2. ID=6 confirms startup scan inserted prior rows (STOR-04 working)"

### 4. Open Files Array Updates Within Seconds

expected: |
  With the extension active and a workspace open:
  1. Open a .ts file in the editor
  2. Wait ~2 seconds
  3. Run:
       sqlite3 ~/.this-code/sessions.db \
         "SELECT open_files FROM invocations ORDER BY id DESC LIMIT 1;"
  4. The value should be a JSON array containing the file path, e.g.:
       ["/Users/you/myproject/src/index.ts"]
  5. Close that file (Cmd+W)
  6. Wait ~2 seconds, re-run the query
  7. open_files should return to [] (empty array)
result: pass
reported: "open: [\"/Users/spencersr/src/github/whardier/int2x-frontend/nuxt.config.ts\"]; close: went down (returned to [])"

### 5. No Visible UI — Output Channel Only

expected: |
  During all of the above:
  - Zero notification popups (no toast in bottom-right corner)
  - Zero information/warning/error messages in the VS Code notification area
  - The only output is in Output > "This Code"
  - No commands appear in the Command Palette from this extension
result: pass
reported: "nothing in command palette or notifications"

### 6. Extension Activates on SSH Remote

expected: |
  Connect to an SSH remote host (via Remote-SSH), open a folder on that host.
  Check ~/.vscode-server/bin/{40-char-hash}/this-code-session.json on the REMOTE host:
    - File exists
    - server_commit_hash matches the 40-char directory name
    - remote_name is "ssh-remote"
    - workspace_path points to the remote folder

  Also check the local sessions.db (on your Mac):
    sqlite3 ~/.this-code/sessions.db \
      "SELECT remote_name, server_commit_hash FROM invocations WHERE remote_name='ssh-remote' LIMIT 1;"
  Should return: ssh-remote|{40-char-hash}
result: issue
reported: "Already tested via Test 2 — extension IS running on SSH remote (remote_name=ssh-remote confirmed). However server_commit_hash=null and remote_server_path=null due to cli/servers/Stable-{hash} path format not handled. JSON written to local path instead of ~/.vscode-server/... Path. See Test 2 gap."
severity: major

### 7. Extension Disabled State

expected: |
  Open VS Code Settings, search for "thisCode.enable", set it to false.
  Reload VS Code window (Cmd+Shift+P → "Developer: Reload Window").
  Open Output > "This Code". You should see:
    [info] This Code is disabled via thisCode.enable. Set thisCode.enable to true to enable session recording.

  And NO activation or database messages after that line.
  No new row should be inserted in sessions.db.
result: pass
reported: "[info] This Code is disabled via thisCode.enable. Set thisCode.enable to true to enable session recording."

### 8. Build + CI Workflow (Automated)

expected: |
  Run from extension/:
    npx tsc --noEmit     → exits 0, no errors
    npm run build        → exits 0, produces dist/extension.js

  .github/workflows/ci.yml exists and includes:
    - macos-latest matrix entry
    - ubuntu-latest matrix entry
    - fail-fast: false
result: pass
auto_verified: true
notes: "tsc --noEmit: OK, npm run build: OK (dist/extension.js 13941 bytes), tsc -p tsconfig.test.json: OK (out/test/extension.test.js emitted), ci.yml verified in prior verification step"

## Summary

total: 8
passed: 6
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "SSH remote session JSON contains server_commit_hash (40-char hex) and remote_server_path"
  status: failed
  reason: "User reported: SSH remote session shows server_commit_hash:null and remote_server_path:null. local_ide_path is cli/servers/Stable-{hash}/server — new VS Code remote path structure not handled by extractCommitHash()"
  severity: major
  test: 2
  artifacts:
    - path: "extension/src/session.ts"
      issue: "extractCommitHash() only handles bin/{hash} path pattern; cli/servers/Stable-{hash}/server is the new VS Code Server path structure and is not matched"
    - path: "extension/src/session.ts"
      issue: "extractServerBinPath() returns null because commitHash is null; server binary directory path is lost"
  missing:
    - "Add cli/servers/Stable-{hash} extraction pattern to extractCommitHash() — strip 'Stable-' prefix and validate 40-char hex"
    - "Add corresponding path construction to extractServerBinPath() for the cli/servers path structure"
    - "getSessionJsonPath() falls back to local path when server_commit_hash is null — SSH sessions written to wrong location"
