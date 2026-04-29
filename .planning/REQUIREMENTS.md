# Requirements: This Code

**Defined:** 2026-04-25
**Core Value:** Developers using VS Code remote development with multiple profiles never have to think about which instance or --user-data-dir to use — this-code remembers and routes automatically.

## v1 Requirements

### Extension Core

- [x] **EXT-01
**: Extension ID is `whardier.this-code`; marketplace name is "This Code"
- [x] **EXT-02
**: Extension sets `extensionKind: ["workspace"]` so it runs where files are (local or SSH remote)
- [x] **EXT-03
**: Extension activates on `onStartupFinished` (non-blocking, fires on every window)
- [x] **EXT-04
**: Extension has no UI — config-only with an Output Channel for diagnostics
- [x] **EXT-05
**: Extension exposes VS Code configuration settings (e.g., enable/disable recording, log level)

### Session Storage

- [x] **STOR-01
**: Extension writes per-instance session state as a text/JSON file inside `~/.vscode-server/bin/{commit-hash}/this-code-session.json` (or `.vscode/` for local)
- [x] **STOR-02
**: Extension maintains a SQLite index at `~/.this-code/sessions.db` (WAL mode, busy timeout) aggregating all instance state
- [x] **STOR-03
**: SQLite schema includes: `id`, `invoked_at`, `workspace_path`, `user_data_dir`, `profile`, `local_ide_path`, `remote_name`, `remote_server_path`, `server_commit_hash`, `server_bin_path`, `open_files` (JSON array)
- [x] **STOR-04
**: Extension scans and indexes existing `~/.vscode-server/bin/*/` directories on activation to populate the SQLite index
- [x] **STOR-05
**: Extension creates `~/.this-code/` directory on first activation if it does not exist

### File Tracking

- [x] **TRACK-01
**: Extension records workspace root path when workspace opens
- [x] **TRACK-02
**: Extension records VS Code Server commit hash (parsed from `vscode.env.appRoot` or equivalent)
- [x] **TRACK-03
**: Extension records `--user-data-dir` and `--profile` associated with this instance (via `globalStorageUri` path parsing or config)
- [x] **TRACK-04
**: Extension records open file manifest (file paths) on `onDidOpenTextDocument` and `onDidCloseTextDocument` events
- [x] **TRACK-05
**: Extension does NOT trigger on file save — open/close events only

### CLI Binary

- [x] **CLI-01**: CLI command name is `this-code`; also installable as `code` shim via symlink or copy
- [x] **CLI-02**: CLI is a single Rust binary using clap 4.6 + figment 0.10 + rusqlite 0.39 (bundled)
- [x] **CLI-03**: CLI intercepts `code` command when placed leftmost in PATH
- [x] **CLI-04**: CLI self-detects recursive invocation (environment variable guard + PATH stripping) before calling real `code`
- [x] **CLI-05**: CLI finds the real `code` binary by removing its own directory from PATH and using `which`/PATH resolution
- [x] **CLI-06**: CLI installs into a dedicated directory (`~/.this-code/bin/`) to avoid PATH pollution

### Shell Integration

- [x] **SHELL-01**: CLI provides `this-code init bash`, `this-code init zsh`, and `this-code init fish` subcommands that print shell-specific integration scripts
- [x] **SHELL-02**: Shell integration adds `~/.this-code/bin/` to leftmost PATH position
- [x] **SHELL-03**: Shell integration for zsh sets PATH in `~/.zshrc` (not `~/.zshenv`) to run after macOS `path_helper`
- [x] **SHELL-04**: Shell integration for fish uses `fish_add_path` (not `eval`)

### Session Querying

- [x] **QUERY-01**: CLI reads session state from text files in `~/.vscode-server/bin/*/` and/or `~/.this-code/sessions.db`
- [x] **QUERY-02**: CLI supports `this-code query [path]` to show last-known session for a given directory
- [x] **QUERY-03**: CLI supports `--dry-run` flag to print what it would do instead of executing
- [x] **QUERY-04**: v1 default behavior is pass-through only — CLI captures context and calls real `code` with original args (routing logic is v2)

### Packaging

- [x] **PKG-01**: Extension is published to the VS Code Marketplace as `whardier.this-code`
- [x] **PKG-02**: VSIX packages are built per-platform: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64` (via `vsce package --target`)
- [x] **PKG-03**: Rust CLI binary is bundled inside the VSIX for convenience (one per platform target)
- [x] **PKG-04**: GitHub Actions CI matrix builds all 4 platform VSIX packages on release

### Platform

- [x] **PLAT-01
**: macOS and Linux are primary supported platforms
- [x] **PLAT-02**: Windows support is best-effort (paths and shell integration may differ)

## v2 Requirements

### Routing

- **ROUTE-01**: CLI routes `code [path]` to the last-known VS Code instance for that workspace, applying saved `--user-data-dir` and `--profile`
- **ROUTE-02**: CLI prompts user when multiple recent sessions exist for a path (disambiguation)
- **ROUTE-03**: CLI supports staleness threshold (skip routing if last session older than N days)

### Remote Development

- **REMOTE-01**: CLI detects when running on SSH remote host and constructs `--folder-uri vscode-remote://` URIs
- **REMOTE-02**: Extension captures `vscode.env.remoteName` to tag sessions as local vs SSH vs container

### Advanced Tracking

- **ADV-01**: Session pruning — configurable max age (default 90 days)
- **ADV-02**: Intercept `claude` command (in addition to `code`) for AI-aware routing

## Out of Scope

| Feature                           | Reason                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| Intercepting `claude` command     | v1 focuses on `code` interception; `claude` routing is deferred     |
| GUI / settings webview            | Config-only extension; output channel is sufficient for v1          |
| Windows as primary target         | macOS and Linux path conventions (.vscode-server) are Unix-specific |
| File-save triggers                | Open/close events capture sufficient context without save noise     |
| Real-time IPC socket manipulation | `remote-code` works without this; complexity not justified          |

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| EXT-01      | Phase 1 | Pending |
| EXT-02      | Phase 1 | Pending |
| EXT-03      | Phase 1 | Pending |
| EXT-04      | Phase 1 | Pending |
| EXT-05      | Phase 1 | Pending |
| STOR-01     | Phase 1 | Pending |
| STOR-02     | Phase 1 | Pending |
| STOR-03     | Phase 1 | Pending |
| STOR-04     | Phase 1 | Pending |
| STOR-05     | Phase 1 | Pending |
| TRACK-01    | Phase 1 | Pending |
| TRACK-02    | Phase 1 | Pending |
| TRACK-03    | Phase 1 | Pending |
| TRACK-04    | Phase 1 | Pending |
| TRACK-05    | Phase 1 | Pending |
| CLI-01      | Phase 2 | Complete |
| CLI-02      | Phase 2 | Complete |
| CLI-03      | Phase 2 | Complete |
| CLI-04      | Phase 2 | Complete |
| CLI-05      | Phase 2 | Complete |
| CLI-06      | Phase 2 | Complete |
| SHELL-01    | Phase 2 | Complete |
| SHELL-02    | Phase 2 | Complete |
| SHELL-03    | Phase 2 | Complete |
| SHELL-04    | Phase 2 | Complete |
| QUERY-01    | Phase 3 | Complete |
| QUERY-02    | Phase 3 | Complete |
| QUERY-03    | Phase 3 | Complete |
| QUERY-04    | Phase 3 | Complete |
| PKG-01      | Phase 4 | Complete |
| PKG-02      | Phase 4 | Complete |
| PKG-03      | Phase 4 | Complete |
| PKG-04      | Phase 4 | Complete |
| PLAT-01     | Phase 1 | Pending |
| PLAT-02     | Phase 2 | Complete |

**Coverage:**

- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

---

_Requirements defined: 2026-04-25_
_Last updated: 2026-04-25 after initial definition_
