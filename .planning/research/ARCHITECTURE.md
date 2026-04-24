# Architecture Patterns

**Domain:** VS Code extension + companion CLI (launch interceptor / session tracker)
**Researched:** 2026-04-24

## Recommended Architecture

Which Code is a two-process system with a shared SQLite database. The VS Code extension (TypeScript) is the **writer** -- it records session data. The Rust CLI is the **reader** -- it queries session data to route `code` invocations. The database file lives at the extension's `globalStorageUri` path, readable by both processes.

```
+-----------------------------------------------------------+
|  User Shell                                                |
|                                                            |
|  $ code ~/project                                          |
|       |                                                    |
|       v                                                    |
|  ~/.which-code/bin/code  (Rust binary, leftmost in PATH)   |
|       |                                                    |
|       +-- reads SQLite DB for routing context              |
|       |       (globalStorageUri path, WAL mode, read-only) |
|       |                                                    |
|       +-- strips self from PATH                            |
|       |                                                    |
|       +-- execs real `code` binary (next in PATH)          |
|                    |                                       |
+-----------------------------------------------------------+
                     |
                     v
+-----------------------------------------------------------+
|  VS Code (Electron)                                        |
|                                                            |
|  Extension Host (local)                                    |
|  +--------------------------------------------------+      |
|  |  whardier.which-code extension                    |      |
|  |                                                   |      |
|  |  activate()                                       |      |
|  |    +-- Open/create SQLite DB at globalStorageUri   |      |
|  |    +-- Record invocation row (workspace, profile,  |      |
|  |    |   user-data-dir, IDE paths, timestamp)        |      |
|  |    +-- Subscribe: onDidOpenTextDocument             |      |
|  |    +-- Subscribe: onDidCloseTextDocument            |      |
|  |    +-- Update open_files manifest on events        |      |
|  |                                                   |      |
|  |  deactivate()                                     |      |
|  |    +-- Close SQLite connection                    |      |
|  |    +-- Flush pending writes                       |      |
|  +--------------------------------------------------+      |
|                                                            |
+-----------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | Language |
|-----------|---------------|-------------------|----------|
| VS Code Extension | Records invocation data, tracks open files | SQLite DB (write), VS Code API (read) | TypeScript |
| SQLite Database | Persistent storage of session records | Extension (writer), CLI (reader) | N/A (file) |
| Rust CLI (`which-code`) | Intercepts `code` command, queries routing context, passes through to real binary | SQLite DB (read), shell PATH (read/modify), real `code` binary (exec) | Rust |
| Shell Integration | Injects CLI into PATH, provides shell functions | User's shell (bash/zsh/fish), PATH env | Shell script |

### Data Flow

**Write path (Extension -> Database):**

1. VS Code starts, extension activates via `onStartupFinished`
2. Extension reads: `vscode.workspace.workspaceFolders`, `vscode.env.remoteName`, `vscode.env.appRoot`
3. Extension opens SQLite at `context.globalStorageUri` + `/which-code.db`
4. Extension inserts one invocation row with current session metadata
5. Extension subscribes to `workspace.onDidOpenTextDocument` and `workspace.onDidCloseTextDocument`
6. On file open/close events, extension updates the `open_files` JSON column for the current invocation row

**Read path (CLI -> Database):**

1. User runs `code ~/project` from shell
2. Shell resolves to `~/.which-code/bin/code` (leftmost in PATH)
3. Rust binary reads SQLite DB in WAL mode (read-only connection)
4. CLI queries for matching workspace, profile, or routing hints
5. CLI strips its own directory from PATH
6. CLI execs the real `code` binary (next match in modified PATH)

## VS Code Extension API Details

### globalStorageUri Physical Paths

The extension accesses storage via `context.globalStorageUri`, which resolves to a per-extension directory. **Confidence: HIGH** (official docs + community verification).

| Platform | Path |
|----------|------|
| **macOS** | `~/Library/Application Support/Code/User/globalStorage/whardier.which-code/` |
| **Linux** | `~/.config/Code/User/globalStorage/whardier.which-code/` |

The database file should be created at `${globalStorageUri.fsPath}/which-code.db`.

**Critical note:** The extension must call `vscode.workspace.fs.createDirectory(context.globalStorageUri)` before first write -- the directory may not exist on first activation.

**Profile variants:** When VS Code profiles are in use, the path may differ. The `globalStorageUri` API handles this transparently -- always use the API, never hardcode paths. The Rust CLI will need the path passed to it (see CLI Database Discovery below).

### vscode.env.remoteName

Returns a `string | undefined`. **Confidence: HIGH** (official API reference).

| Context | Value |
|---------|-------|
| Local workspace | `undefined` |
| SSH Remote | `"ssh-remote"` |
| Dev Container | `"attached-container"` or `"dev-container"` |
| WSL | `"wsl"` |
| Codespaces | `"codespaces"` |

**Architectural implication:** The Which Code extension must run on the **local** machine (not the remote Extension Host) because it writes to the local `globalStorageUri`. Set `"extensionKind": ["ui"]` in `package.json` to force local execution.

When `remoteName` is defined, the extension should record it in the invocation row. This tells the CLI that the session involves a remote workspace, which is critical for routing `code` vs `remote-code` calls.

### vscode.env.appRoot

Returns a `string` -- the VS Code installation root. **Confidence: HIGH**.

| Platform | Typical Value |
|----------|---------------|
| **macOS** | `/Applications/Visual Studio Code.app/Contents/Resources/app` |
| **Linux** | `/usr/share/code/resources/app` (system install) or extracted path |

This is the `local_ide_path` field in the database. For remote sessions, the remote VS Code Server path is at `~/.vscode-server/` on the remote host (but the extension records the local path, since it runs locally).

### Extension Activation Lifecycle

```
VS Code starts
    |
    v
onStartupFinished fires (after VS Code UI is ready, non-blocking)
    |
    v
activate(context: ExtensionContext) called
    |
    +-- Ensure globalStorageUri directory exists
    +-- Open SQLite database connection
    +-- Insert invocation row
    +-- Register event listeners via context.subscriptions:
    |     - workspace.onDidOpenTextDocument
    |     - workspace.onDidCloseTextDocument
    +-- Create OutputChannel for diagnostics
    |
    v
Extension running (event-driven, no UI)
    |
    v
VS Code shutting down
    |
    v
context.subscriptions auto-disposed
    |
    v
deactivate() called
    +-- Close SQLite connection (return Promise if async)
    +-- Flush any buffered writes
```

**Key lifecycle facts:**
- `onStartupFinished` is preferred over `*` because it does not slow VS Code startup. The extension activates after the window is ready.
- `deactivate()` must return a `Promise` if cleanup is async. VS Code gives limited time for cleanup -- keep it fast.
- All subscriptions pushed to `context.subscriptions` are auto-disposed before `deactivate()` is called.
- The extension has no UI contributions (no commands, views, or webviews), so there are no other activation triggers.

### Remote Extension Architecture

The Which Code extension MUST declare `"extensionKind": ["ui"]` in its `package.json`. This forces the extension to run in the **local Extension Host**, even when connected to a remote workspace.

Rationale:
- The extension writes to `globalStorageUri`, which is a **local** path
- The Rust CLI reads this same database from the **local** filesystem
- If the extension ran in the Remote Extension Host, it would write to the remote machine's filesystem, making the database invisible to the local CLI

When VS Code is connected to a remote (SSH, container, WSL):
- The extension still runs locally
- `vscode.env.remoteName` returns the remote type (e.g., `"ssh-remote"`)
- `vscode.workspace.workspaceFolders` returns the remote workspace paths
- The extension records both the local IDE path (`vscode.env.appRoot`) and notes the remote context

### remote_server_path Field

The `remote_server_path` in the database schema captures where the VS Code Server is installed on the remote machine. By default this is `~/.vscode-server/` on the remote host.

**How to obtain it from the extension:** The extension running locally does not have direct access to the remote server path. Options:
1. **Convention-based:** Default to `~/.vscode-server/` (correct for >95% of cases)
2. **Settings-based:** Read `remote.SSH.serverInstallPath` from VS Code settings, which maps hostnames to custom paths
3. **Store as nullable:** Record `null` when not in a remote session

Recommendation: Use option 2 with fallback to option 1. The `remote.SSH.serverInstallPath` setting is a `Record<string, string>` mapping hostname to path.

## SQLite Schema

```sql
-- Enable WAL mode for concurrent read access from CLI
PRAGMA journal_mode=WAL;

-- Single table: append-only invocation log
CREATE TABLE IF NOT EXISTS invocations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoked_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
    workspace_path  TEXT,           -- Remote path when remote, local path otherwise
    user_data_dir   TEXT,           -- --user-data-dir if custom, NULL otherwise
    profile         TEXT,           -- --profile name if set, NULL otherwise
    local_ide_path  TEXT NOT NULL,  -- vscode.env.appRoot
    remote_name     TEXT,           -- vscode.env.remoteName (NULL if local)
    remote_server_path TEXT,        -- ~/.vscode-server/ path on remote, NULL if local
    open_files      TEXT NOT NULL DEFAULT '[]'  -- JSON array of open file paths
);

-- Index for CLI queries: find sessions by workspace
CREATE INDEX IF NOT EXISTS idx_invocations_workspace
    ON invocations(workspace_path);

-- Index for CLI queries: find most recent session
CREATE INDEX IF NOT EXISTS idx_invocations_time
    ON invocations(invoked_at DESC);
```

**Schema design notes:**
- `open_files` is a JSON array updated in-place as documents open/close. Use SQLite's JSON1 extension (`json_insert`, `json_remove`) or replace the whole value.
- `invoked_at` uses ISO 8601 with milliseconds for precise ordering.
- `remote_name` is separated from the original spec's `remote_server_path` for cleaner querying.
- WAL mode is set once on database creation. Both the extension and CLI benefit: the extension writes without blocking CLI reads, and the CLI reads without blocking extension writes.

### SQLite Library Choice for the Extension

**Recommendation: `@vscode/sqlite3`** -- Microsoft's own fork of node-sqlite3, purpose-built for VS Code extensions.

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `@vscode/sqlite3` | Prebuilt N-API binaries for macOS (x64, arm64), Linux (x64, arm64, glibc, musl); maintained by Microsoft; async API | Async-only (callback style, needs promisify wrapper) | **Use this** |
| `better-sqlite3` | Synchronous API, fast | Native addon requires rebuild for Electron; notorious compatibility issues in VS Code extensions; users may need C++ toolchain | Avoid |
| `sql.js` (WASM) | Zero native deps, works everywhere | In-memory only; must serialize entire DB to disk on every change; no WAL mode support; terrible for concurrent access from CLI | Avoid |

**Confidence: HIGH** -- `@vscode/sqlite3` is what VS Code itself uses internally, ships prebuilt binaries for all target platforms, and uses Node-API for version-independent compatibility.

### SQLite Library for the CLI (Rust)

**Recommendation: `rusqlite`** -- the standard Rust SQLite binding.

- Open the database with `OpenFlags::SQLITE_OPEN_READ_ONLY` to avoid accidental writes
- The database is in WAL mode (set by the extension), so reads never block the extension's writes
- Use `rusqlite::Connection::open_with_flags()` for explicit read-only access

## Shell Shim Self-Detection Pattern

### How pyenv/rbenv Do It (Reference Pattern)

The pyenv/rbenv shim pattern is the gold standard for PATH interception. Key mechanisms:

**1. Shim Script (the interceptor):**
```bash
#!/usr/bin/env bash
# Every shim is identical -- captures its own name, delegates to the tool
set -e
program="${0##*/}"          # Extract binary name from argv[0]
exec pyenv exec "$program" "$@"
```

**2. PATH Stripping (avoiding self-invocation):**
```bash
# pyenv's remove_from_path function
remove_from_path() {
  local path_to_remove="$1"
  local result=":${PATH}:"
  while [[ "$result" == *":$path_to_remove:"* ]]; do
    result="${result//:$path_to_remove:/:}"
  done
  result="${result#:}"
  echo "${result%:}"
}

# Usage: find system binary by removing shims from PATH
PATH="$(remove_from_path "$SHIMS_DIR")" command -v python
```

**3. Shell Init (injecting into PATH):**
```bash
# Added to ~/.bashrc or ~/.zshrc
eval "$(pyenv init -)"   # Prepends shims dir to PATH, installs shell function
```

### Which Code's Adaptation

The which-code pattern is simpler than pyenv because:
- There is only one binary to intercept (`code`), not dozens
- There is no version selection logic, just pass-through with routing
- The CLI is a compiled Rust binary, not a shell script shim

**Shell Integration (`~/.which-code/bin/which-code.sh`):**
```bash
# Sourced by user's shell profile (~/.bashrc, ~/.zshrc)
# Prepends which-code's bin directory to PATH

export WHICH_CODE_HOME="${WHICH_CODE_HOME:-$HOME/.which-code}"

# Only add once (idempotent)
case ":${PATH}:" in
  *":${WHICH_CODE_HOME}/bin:"*) ;;
  *) export PATH="${WHICH_CODE_HOME}/bin:${PATH}" ;;
esac
```

**Rust CLI Self-Detection Algorithm:**

```
1. Get own executable path: std::env::current_exe()
2. Get own canonical path: fs::canonicalize(current_exe)
3. Split PATH into components: env::var("PATH").split(':')
4. Filter out entries where:
   - The directory is the which-code bin dir, OR
   - The directory contains a `code` that resolves to our own binary
5. Search remaining PATH entries for `code` binary
6. If found: exec it with original arguments
7. If not found: error ("cannot find real `code` binary")
```

**Critical detail:** The Rust binary must use `std::env::current_exe()` (which follows symlinks on most platforms) and compare canonical paths, not just string-compare directory names. This handles cases where `~/.which-code/bin/code` is a symlink to the actual binary.

### fish Shell Variant

```fish
# ~/.config/fish/conf.d/which-code.fish
set -gx WHICH_CODE_HOME "$HOME/.which-code"
if not contains "$WHICH_CODE_HOME/bin" $PATH
    set -gx PATH "$WHICH_CODE_HOME/bin" $PATH
end
```

## CLI Database Discovery

The CLI needs to find the SQLite database. Since `globalStorageUri` is determined at runtime by VS Code, the CLI must discover it independently.

**Strategy (ordered by priority):**

1. **Environment variable:** `WHICH_CODE_DB` -- explicit override, useful for testing
2. **Config file:** `~/.which-code/config.toml` with `db_path = "..."` (managed by figment)
3. **Convention:** Search known `globalStorageUri` paths:
   - macOS: `~/Library/Application Support/Code/User/globalStorage/whardier.which-code/which-code.db`
   - Linux: `~/.config/Code/User/globalStorage/whardier.which-code/which-code.db`
4. **Extension writes config:** On first activation, the extension writes the resolved `globalStorageUri` path to `~/.which-code/config.toml`

**Recommendation:** Use strategy 4 (extension writes config) as primary, with strategy 3 as fallback. The extension knows the exact path; the CLI should not guess. On activate, the extension:
1. Resolves `context.globalStorageUri.fsPath`
2. Writes `db_path = "<resolved path>"` to `~/.which-code/config.toml`

This handles profile-specific paths, custom `--user-data-dir`, and any future changes to VS Code's storage layout.

## Patterns to Follow

### Pattern 1: Append-Only Event Log
**What:** Never update or delete invocation rows. Each `code` launch creates exactly one row. File open/close events update only the `open_files` column of the current session's row.
**When:** Always -- this is the core data model.
**Why:** Simplifies concurrency (no conflicts between writer and reader), provides full history, and avoids complex state management.

### Pattern 2: WAL Mode for Cross-Process Access
**What:** Set `PRAGMA journal_mode=WAL` on database creation. Extension writes, CLI reads. Neither blocks the other.
**When:** Always -- this is non-negotiable for the two-process architecture.
**Why:** Without WAL, the CLI would get `SQLITE_BUSY` errors whenever the extension is writing, and vice versa.

### Pattern 3: Extension as UI-Only (extensionKind)
**What:** Declare `"extensionKind": ["ui"]` in `package.json` to force local execution.
**When:** Always -- the extension must write to the local filesystem.
**Why:** If the extension runs remotely, the database would be on the remote machine, invisible to the local CLI.

### Pattern 4: Idempotent Shell Integration
**What:** The shell init script checks if the path is already added before prepending.
**When:** Always -- users may source their profile multiple times.
**Why:** Prevents PATH pollution and duplicate entries (a common pyenv/rbenv issue).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using sql.js for Shared Database
**What:** Using the WASM SQLite library (sql.js) which operates in-memory.
**Why bad:** sql.js cannot support concurrent cross-process access. It loads the entire database into memory, operates on it, and writes the whole file back. A CLI reading the file while sql.js is writing would see corrupt data or a truncated file. No WAL mode support.
**Instead:** Use `@vscode/sqlite3` with native bindings and WAL mode.

### Anti-Pattern 2: Hardcoding globalStorageUri Paths
**What:** Putting `~/Library/Application Support/Code/User/globalStorage/...` directly in the CLI.
**Why bad:** The path changes with VS Code profiles, custom `--user-data-dir`, VS Code Insiders (`Code - Insiders`), and potentially future VS Code versions.
**Instead:** Have the extension write the resolved path to `~/.which-code/config.toml`.

### Anti-Pattern 3: Running Extension as Workspace Extension
**What:** Allowing the extension to run in the Remote Extension Host.
**Why bad:** The database would be written to the remote machine's filesystem. The local CLI cannot read it. The entire architecture breaks.
**Instead:** Force `"extensionKind": ["ui"]`.

### Anti-Pattern 4: String-Comparing PATH Entries for Self-Detection
**What:** Checking if a PATH entry string-equals `~/.which-code/bin`.
**Why bad:** Fails with symlinks, relative paths, trailing slashes, `$HOME` vs `~`, and case differences on macOS.
**Instead:** Canonicalize paths with `fs::canonicalize()` and compare canonical forms.

## Suggested Build Order

**Build the extension first, CLI second.**

### Rationale

1. **The extension creates the database.** The CLI reads it. You cannot develop the CLI without a database to read from.
2. **The extension defines the schema.** The CLI's queries depend on the schema. Building the extension first locks the schema before CLI development begins.
3. **The extension is simpler to validate.** You can verify it works by inspecting the SQLite file directly with `sqlite3` CLI. The Rust CLI requires the extension to be running to have data to query.
4. **Shell integration is the riskiest part.** The CLI's PATH manipulation and self-detection are the most likely to have edge cases. Building it last means you have a working database to test against.

### Build Phases

| Phase | Component | Deliverable | Depends On |
|-------|-----------|-------------|------------|
| 1 | VS Code Extension (core) | Extension that records invocations to SQLite on activate | Nothing |
| 2 | VS Code Extension (events) | File open/close tracking, manifest updates | Phase 1 |
| 3 | Rust CLI (read + pass-through) | CLI that reads DB and execs real `code` | Phase 1 schema |
| 4 | Shell Integration | Shell scripts for bash/zsh/fish, PATH injection | Phase 3 binary |
| 5 | Extension writes CLI config | Extension writes `config.toml` with DB path | Phase 1 + Phase 3 |
| 6 | Integration testing | End-to-end: shell -> CLI -> VS Code -> extension -> DB -> CLI reads | All prior phases |

## Scalability Considerations

| Concern | At 10 sessions | At 1,000 sessions | At 100,000 sessions |
|---------|----------------|---------------------|----------------------|
| DB size | <100 KB | ~5 MB | ~500 MB |
| Query speed | Instant | Instant (indexed) | Add LIMIT, consider pruning old rows |
| WAL file growth | Negligible | Checkpoint automatically | Set `PRAGMA wal_autocheckpoint` |
| open_files JSON size | <1 KB per row | Same | Could be large if 100+ files open; cap array length |

**Pruning strategy:** Not needed for v1. If the database grows, add a `PRAGMA auto_vacuum=INCREMENTAL` and a periodic cleanup command to the CLI.

## Sources

- [VS Code Extension API - Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities) -- globalStorageUri documentation
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api) -- vscode.env.remoteName, vscode.env.appRoot definitions
- [VS Code Remote Extensions Guide](https://code.visualstudio.com/api/advanced-topics/remote-extensions) -- Extension Host architecture, extensionKind
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) -- onStartupFinished behavior
- [VS Code Extension Storage Explained (Medium)](https://medium.com/@krithikanithyanandam/vs-code-extension-storage-explained-the-what-where-and-how-3a0846a632ea) -- Physical paths on macOS
- [VS Code Remote SSH Docs](https://code.visualstudio.com/docs/remote/ssh) -- .vscode-server path, serverInstallPath setting
- [pyenv Shim Pattern (MungingData)](https://www.mungingdata.com/python/how-pyenv-works-shims/) -- Shim design pattern reference
- [pyenv-which source (GitHub)](https://github.com/pyenv/pyenv/blob/master/libexec/pyenv-which) -- PATH stripping implementation
- [rbenv-which source (GitHub)](https://github.com/rbenv/rbenv/blob/master/libexec/rbenv-which) -- PATH stripping implementation
- [SQLite WAL Mode](https://sqlite.org/wal.html) -- Concurrent read/write behavior
- [better-sqlite3 VS Code Issue #385](https://github.com/WiseLibs/better-sqlite3/issues/385) -- Native addon challenges
- [better-sqlite3 Electron Issue #1321](https://github.com/WiseLibs/better-sqlite3/issues/1321) -- @vscode/sqlite3 recommendation
- [VS Code SQLite Discussion #16](https://github.com/microsoft/vscode-discussions/discussions/16) -- Community consensus on SQLite in extensions
- [@vscode/sqlite3 npm](https://www.npmjs.com/package/@vscode/sqlite3) -- Package details, prebuilt binary support
- [microsoft/vscode-node-sqlite3 (GitHub)](https://github.com/microsoft/vscode-node-sqlite3) -- Source repository
- [VS Code Extension Deactivation Issue #105484](https://github.com/microsoft/vscode/issues/105484) -- Cleanup lifecycle limitations
- [rusqlite docs.rs](https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html) -- Rust SQLite connection flags
- [rbenv PATH fix PR #507](https://github.com/rbenv/rbenv/pull/507) -- Idempotent PATH handling
