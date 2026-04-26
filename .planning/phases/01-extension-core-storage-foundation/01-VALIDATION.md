---
phase: 1
slug: extension-core-storage-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | @vscode/test-cli + @vscode/test-electron (integration tests inside real VS Code host) |
| **Config file** | `extension/.vscode-test.js` — none yet; Wave 0 creates it |
| **Quick run command** | `node -e "require('./extension/package.json')"` (manifest smoke) |
| **Full suite command** | `cd extension && npm run test` |
| **Estimated runtime** | ~30–60 seconds (integration suite launches VS Code) |

---

## Sampling Rate

- **After every task commit:** Run `node -e "require('./extension/package.json')"` (manifest smoke check)
- **After every plan wave:** Run `cd extension && npm run test` (full integration suite)
- **Before `/gsd-verify-work`:** Full suite must be green + manual VSIX install test
- **Max feedback latency:** 60 seconds (integration tests; no sub-second unit loop for VS Code extensions)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | EXT-01 | — | N/A | manifest | `node -e "const p=require('./extension/package.json');console.log(p.publisher+'.'+p.name)"` → `whardier.this-code` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | EXT-02 | — | N/A | manifest | `node -e "const p=require('./extension/package.json');console.log(JSON.stringify(p.extensionKind))"` → `["workspace"]` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | EXT-03 | — | N/A | manifest | `node -e "const p=require('./extension/package.json');console.log(p.activationEvents)"` → `onStartupFinished` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | EXT-04 | — | N/A | manifest | `node -e "const p=require('./extension/package.json');console.log(JSON.stringify(p.contributes.commands))"` → `undefined` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 0 | EXT-05 | — | N/A | manifest | `node -e "const p=require('./extension/package.json');const keys=Object.keys(p.contributes.configuration.properties);console.log(keys.sort().join(','))"` → `thisCode.enable,thisCode.logLevel` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | STOR-02 | T-1-04 | WAL mode prevents exclusive locking | integration | `sqlite3 ~/.this-code/sessions.db "PRAGMA journal_mode;"` → `wal` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | STOR-03 | T-1-02 | Parameterized queries prevent injection | integration | `sqlite3 ~/.this-code/sessions.db "PRAGMA table_info(invocations);"` lists all required columns | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | STOR-05 | — | N/A | integration | `test -d ~/.this-code` after activation | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | STOR-01 | T-1-03 | Path validated before construction | integration | `test -f ~/.vscode-server/bin/{hash}/this-code-session.json` (SSH) or `~/.this-code/sessions/{hash}.json` (local) | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 1 | TRACK-01 | — | N/A | integration | `sqlite3 ~/.this-code/sessions.db "SELECT workspace_path FROM invocations LIMIT 1;"` returns non-null | ❌ W0 | ⬜ pending |
| 1-03-03 | 03 | 1 | TRACK-02 | T-1-01 | Commit hash validated as 40-char hex | integration | `sqlite3 ... "SELECT server_commit_hash FROM invocations LIMIT 1;"` → 40-char hex or null | ❌ W0 | ⬜ pending |
| 1-03-04 | 03 | 1 | TRACK-03 | — | null-safe on no profile | integration | `sqlite3 ... "SELECT user_data_dir, profile FROM invocations LIMIT 1;"` → no exception; profile is string or null | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 2 | TRACK-04 | T-1-02 | File URIs only; scheme validated | integration | open file in test workspace; `sqlite3 ... "SELECT open_files FROM invocations LIMIT 1;"` contains file path | ❌ W0 | ⬜ pending |
| 1-04-02 | 04 | 2 | TRACK-05 | — | N/A | static | `grep -r "onDidSaveTextDocument" extension/src/` → no matches | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 2 | STOR-04 | T-1-03 | JSON parse errors caught | integration | pre-seed session JSON; activate; `sqlite3 ... "SELECT COUNT(*) FROM invocations;"` > 0 | ❌ W0 | ⬜ pending |
| 1-06-01 | 06 | 2 | PLAT-01 | — | N/A | integration | CI runs on macOS-latest and ubuntu-latest; both pass full suite | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `extension/` directory — does not exist; scaffold creates it
- [ ] `extension/package.json` — extension manifest with all contributes fields
- [ ] `extension/src/extension.ts` — entrypoint stub (activate/deactivate)
- [ ] `extension/.vscode-test.js` — test runner configuration for @vscode/test-cli
- [ ] `extension/src/test/index.ts` — test suite entrypoint
- [ ] `extension/src/test/extension.test.ts` — integration test stubs for all 16 requirements
- [ ] `cd extension && npm install` — installs @vscode/sqlite3, dev deps

*Existing infrastructure: None (greenfield). Wave 0 creates everything.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension activates in SSH remote session | EXT-02, PLAT-01 | Requires SSH remote host connection | Open SSH remote workspace; check Developer: Show Running Extensions — extension should show Remote |
| globalStorageUri profile segment logging | TRACK-03 | API behavior varies by VS Code version | Open with non-default profile; check Output Channel "This Code" for logged globalStorageUri path |
| VSIX installs cleanly | All | Requires packaged VSIX and clean VS Code install | `vsce package --target darwin-arm64`; `code --install-extension *.vsix`; reopen workspace; check Output Channel |
| open_files reconciles after language mode change | TRACK-04 | Requires manual language mode switch | Open .ts file; change language mode to JS; verify open_files in SQLite still shows the file (no false close) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING file references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (integration test constraint acknowledged)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
