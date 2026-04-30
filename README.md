# This Code

> Never think about which VS Code instance or profile to use again.

**This Code** (`whardier.this-code`) is a VS Code extension + Rust CLI pair that silently records session state wherever VS Code runs and routes subsequent `code` invocations to the right instance automatically.

The extension tracks workspace, open files, `--user-data-dir`, `--profile`, and server commit hash into per-instance JSON files and a shared SQLite index. The CLI (`this-code`) sits leftmost in your PATH as `code`, reads the session store, and passes through to the real binary with full context.

---

## How It Works

```
$ code ~/project
       |
       v
~/.this-code/bin/code   (Rust shim, leftmost in PATH)
       |
       +-- reads ~/.this-code/sessions.db for routing context
       +-- strips self from PATH (recursion guard)
       +-- execs real `code` binary with original args
                    |
                    v
          VS Code starts, extension activates
                    |
                    +-- writes session JSON alongside VS Code Server binary
                    +-- upserts row in ~/.this-code/sessions.db
                    +-- tracks open/close file events
```

The extension and CLI communicate entirely through a shared SQLite database at `~/.this-code/sessions.db` (WAL mode — no locking conflicts between concurrent readers and writers).

---

## Components

| Component | Language | Purpose |
|-----------|----------|---------|
| VS Code Extension (`whardier.this-code`) | TypeScript | Records session metadata; tracks open file manifest |
| Rust CLI (`this-code`) | Rust | PATH shim; session querying; shell integration |
| SQLite index (`~/.this-code/sessions.db`) | SQL | Shared store; append-only invocation log |
| Per-instance JSON | JSON | Per-server-binary record; zero locking; survives DB failures |

---

## Installation

### Extension

Install from the VS Code Marketplace:

```
ext install whardier.this-code
```

Or install a platform-specific VSIX from [Releases](../../releases):

```bash
code --install-extension this-code-<version>-darwin-arm64.vsix
```

Platform targets: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`.

### CLI

Download the binary for your platform from [Releases](../../releases) and install it:

```bash
# macOS (Apple Silicon)
curl -Lo ~/.this-code/bin/this-code \
  https://github.com/whardier/this-code/releases/latest/download/this-code-darwin-arm64
chmod +x ~/.this-code/bin/this-code

# Linux (x64)
curl -Lo ~/.this-code/bin/this-code \
  https://github.com/whardier/this-code/releases/latest/download/this-code-linux-x64
chmod +x ~/.this-code/bin/this-code
```

#### Shell Integration

Add the shim to your PATH so `code` resolves to `this-code`:

**bash / zsh** — add to `~/.zshrc` (zsh) or `~/.bashrc` (bash):
```bash
eval "$(this-code init zsh)"   # or bash
```

**fish** — add to `~/.config/fish/config.fish`:
```fish
this-code init fish | source
```

> **macOS / zsh note:** Use `~/.zshrc`, not `~/.zshenv`. macOS `path_helper` in `/etc/zprofile` reorders PATH before `~/.zshenv` runs, stripping the shim. `~/.zshrc` runs after `path_helper`.

---

## CLI Usage

```
this-code [OPTIONS] <COMMAND>

Commands:
  install   Install shell integration and code symlink
  init      Print shell integration script (eval this)
  query     Query session history for a path
  which     Print the real code binary path for a given path
  help      Print help

Options:
  -v, --verbose   Enable verbose logging
  -h, --help      Print help
  -V, --version   Print version
```

### Examples

```bash
# Query last-known session for a directory
this-code query ~/project

# Dry-run: show what would happen without executing
this-code query ~/project --dry-run

# JSON output for scripting
this-code query ~/project --json

# Show which real code binary would be used
this-code which ~/project

# Install shell integration
this-code install
```

---

## Extension Behavior

- **Activation:** `onStartupFinished` — fires after VS Code is fully ready, never blocks startup
- **Storage:** Writes two records per session:
  - Per-instance JSON at `~/.vscode-server/bin/{commit-hash}/this-code-session.json` (SSH remote) or `~/.this-code/sessions/{hash}.json` (local)
  - Row in `~/.this-code/sessions.db` (WAL mode, aggregated across all instances)
- **Tracking:** `onDidOpenTextDocument` / `onDidCloseTextDocument` update the `open_files` manifest in real time
- **No saves tracking:** Open/close events only — no save noise
- **No UI:** Config settings + Output Channel only (no commands, views, or webviews)
- **SSH Remote:** Runs as `extensionKind: ["workspace"]` — executes on the remote host where files live, writes session data to that machine's `~/.this-code/`

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `thisCode.enable` | `true` | Enable or disable session recording |
| `thisCode.logLevel` | `"info"` | Output channel verbosity (`"debug"`, `"info"`, `"warn"`, `"error"`) |

---

## Storage Schema

### Per-Instance JSON

Written alongside each VS Code Server binary. Fields:

```json
{
  "schema_version": 1,
  "recorded_at": "2026-04-29T12:00:00.000Z",
  "workspace_path": "/home/user/project",
  "user_data_dir": "/home/user/.config/Code",
  "profile": null,
  "local_ide_path": "/home/user/.vscode-server/bin/{hash}/resources/app",
  "remote_name": "ssh-remote",
  "remote_server_path": "/home/user/.vscode-server/bin/{hash}",
  "server_commit_hash": "abc123...",
  "ipc_hook_cli": "/tmp/vscode-ipc-abc123.sock",
  "open_files": ["/home/user/project/src/main.rs"]
}
```

### SQLite (`~/.this-code/sessions.db`)

```sql
CREATE TABLE invocations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  invoked_at         TEXT NOT NULL,        -- ISO 8601 with milliseconds
  workspace_path     TEXT,
  user_data_dir      TEXT,
  profile            TEXT,
  local_ide_path     TEXT NOT NULL,
  remote_name        TEXT,                 -- 'ssh-remote', 'dev-container', NULL for local
  remote_server_path TEXT,
  server_commit_hash TEXT,
  server_bin_path    TEXT,
  ipc_hook_cli       TEXT,
  open_files         TEXT NOT NULL         -- JSON array
);
```

WAL mode is enabled on creation. The CLI opens read-write (WAL `-shm` requires write access) but only performs SELECT queries.

---

## Technology Stack

### Extension (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| TypeScript | ~5.7 | Strict mode |
| `@types/vscode` | ^1.75.0 | VS Code API types (pinned to minimum engine) |
| `@vscode/sqlite3` | ^5.1.12-vscode | SQLite — Node-API prebuilts, ABI-stable across Electron |
| `esbuild` | ^0.28.0 | Bundler (VS Code official recommendation) |
| `@vscode/vsce` | ^3.9.0 | VSIX packaging and Marketplace publishing |

> `better-sqlite3` is intentionally **not used** — it requires per-Electron-version rebuilds and has documented `NODE_MODULE_VERSION` mismatches. `@vscode/sqlite3` uses Node-API (N-API) for stable ABI across all VS Code versions.

### CLI (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `clap` | 4.6 | CLI argument parsing (derive API) |
| `figment` | 0.10 | Hierarchical config (TOML + env vars) |
| `rusqlite` | 0.39 (bundled) | SQLite — statically links libsqlite3; no system dependency |
| `tracing` | 0.1 | Structured logging |
| `thiserror` + `anyhow` | 2.0 / 1.0 | Error types and propagation |

Edition 2024. Single binary crate (not a workspace).

---

## Development

### Prerequisites

- Node.js 22+, npm
- Rust stable (edition 2024, via `rustup`)

### Extension

```bash
cd extension
npm install
npm run build        # development build (with source maps)
npm run build:prod   # production build (minified)
npx tsc --noEmit     # type-check only
npm test             # integration tests via @vscode/test-electron
```

### CLI

```bash
cd cli
cargo build --release
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

### Running Tests

Extension tests run inside a real VS Code instance. On Linux, Xvfb is required:

```bash
# Linux
xvfb-run -a npm test

# macOS
npm test
```

---

## CI / CD

| Workflow | Trigger | What It Does |
|----------|---------|-------------|
| `ci.yml` | push / PR to `main` | Typecheck, build, integration tests (macOS + Linux matrix) |
| `cli-ci.yml` | push / PR to `cli/**` | `cargo fmt`, clippy, build, test (macOS + Linux matrix) |
| `ext-release.yml` | tag `ext/v*` | Build + test all 4 platform VSIXes, create GitHub Release |
| `cli-release.yml` | tag `cli/v*` | Build CLI binaries for all 4 platforms, create GitHub Release |

### Releasing

**Extension:**
```bash
git tag ext/v1.0.0
git push origin ext/v1.0.0
```

**CLI:**
```bash
git tag cli/v1.0.0
git push origin cli/v1.0.0
```

---

## Platforms

| Platform | Extension | CLI |
|----------|-----------|-----|
| macOS (Apple Silicon) | Supported | Supported |
| macOS (Intel) | Supported | Supported |
| Linux x64 | Supported | Supported |
| Linux arm64 | Supported | Supported |
| Windows | Best-effort | Not supported (v1) |

---

## v2 Roadmap

- **ROUTE-01–03:** Full session-aware routing — route `code /path` to the already-running instance for that workspace with saved profile and `--user-data-dir`
- **REMOTE-01–02:** Remote URI routing — construct `--folder-uri vscode-remote://ssh-remote+host/path` for SSH/container sessions
- **ADV-01:** Session pruning (configurable max age, default 90 days)
- **ADV-02:** `claude` command interception

---

## License

MIT
