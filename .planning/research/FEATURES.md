# Feature Landscape

**Domain:** VS Code launch interceptor and session tracker (CLI shim + extension)
**Researched:** 2026-04-24

## Table Stakes

Features users expect. Missing = product feels incomplete or untrustworthy.

### Extension (VS Code Side)

| Feature | Why Expected | Complexity | Confidence | Notes |
|---------|--------------|------------|------------|-------|
| Record invocation metadata on activation | Core value prop -- if the extension doesn't capture `code` launch context, everything downstream breaks | Low | HIGH | Fields: `invoked_at`, `workspace_path`, `user_data_dir`, `profile`, `local_ide_path`, `remote_server_path` |
| Track open file manifest (open/close events) | Users need to know what files were open in which session to route correctly | Medium | HIGH | Use `workspace.onDidOpenTextDocument` / `onDidCloseTextDocument`. Caveat: `onDidCloseTextDocument` fires on language ID change too, not just tab close -- needs filtering |
| SQLite at `globalStorageUri` | Only stable, writable location that survives extension updates. Extension install dir is clobbered on update | Low | HIGH | Path: `~/Library/Application Support/Code/User/globalStorage/whardier.which-code/` on macOS |
| WAL mode for SQLite | Multiple VS Code instances write to the same database concurrently. Without WAL, writers block readers and you get `SQLITE_BUSY` errors | Low | HIGH | WAL allows concurrent reads+writes. Set `busy_timeout` to at least 5000ms. Only one writer at a time even with WAL, but that's fine for append-only logging |
| Append-only immutable log | Session records should never be mutated -- append only. Simpler schema, no update conflicts, natural audit trail | Low | HIGH | One INSERT per activation, periodic INSERTs for manifest changes |
| Capture `vscode.env.sessionId` | Unique per VS Code window launch. Required to correlate CLI invocations with running instances | Low | HIGH | Changes each time the editor starts |
| Capture `vscode.env.remoteName` | Distinguishes local vs SSH vs WSL vs container sessions. Critical for routing decisions | Low | HIGH | Values: `undefined` (local), `ssh-remote`, `wsl`, `dev-container`, `codespaces` |
| Output channel diagnostics | Extension has no UI, so the output channel is the only way users can debug issues | Low | HIGH | Standard pattern for headless extensions |
| Graceful activation/deactivation | Extension must handle activation failure (can't open DB, permissions) without crashing VS Code | Low | HIGH | Use try/catch, log to output channel, degrade gracefully |

### CLI (Rust Side)

| Feature | Why Expected | Complexity | Confidence | Notes |
|---------|--------------|------------|------------|-------|
| PATH shim that intercepts `code` | The entire product premise. Must be leftmost in PATH to intercept `code` invocations before the real binary | Medium | HIGH | Install to `~/.which-code/bin/code`. Dedicated directory prevents accidental PATH pollution |
| Recursive invocation self-detection | Without this, the shim calls itself infinitely. Must detect it's running as a shim and strip itself from PATH before calling the real `code` | Medium | HIGH | Detect via: (1) environment variable marker, (2) PATH inspection removing `~/.which-code/bin`, (3) checking if argv[0] resolves to self |
| Pass-through to real `code` by default | If the shim can't determine routing, it must forward all arguments to the real `code` binary unmodified. Never break the user's workflow | Low | HIGH | Find real `code` by walking PATH with self removed |
| Shell integration script (bash/zsh/fish) | Users need `eval "$(which-code init bash)"` or equivalent. This is how pyenv, rbenv, direnv all work -- users expect this pattern | Medium | HIGH | Must support bash, zsh, fish. Output shell-specific code that prepends `~/.which-code/bin` to PATH |
| Read session database (read-only) | CLI reads SQLite to make routing decisions. Must handle the DB being locked (VS Code is writing), missing, or corrupt | Medium | HIGH | Open read-only with WAL mode. Use `busy_timeout`. Handle missing DB gracefully (fall through to default `code`) |
| Exit code preservation | Shim must propagate the real `code` binary's exit code. Anything else breaks scripts and CI | Low | HIGH | `exec` or `std::process::exit(child.status().code())` |

## Differentiators

Features that set Which Code apart. Not expected in a generic tool, but are the reason someone would adopt this over manual profile management.

| Feature | Value Proposition | Complexity | Confidence | Notes |
|---------|-------------------|------------|------------|-------|
| **Session-aware routing** | When `code /some/path` is run from an external terminal, the shim queries the session DB and routes to the VS Code instance that already has that workspace open (or the most recently active one for that path). This is the killer feature -- no other tool does this | High | MEDIUM | Routing logic: (1) exact workspace match -> reuse that instance, (2) parent directory match -> suggest instance, (3) no match -> default `code`. Use `VSCODE_IPC_HOOK_CLI` if available, or `--reuse-window` with the right `--user-data-dir` |
| **Profile-aware routing** | Route to the correct `--user-data-dir` and `--profile` automatically based on workspace history. If workspace X was always opened with profile "Python Dev", subsequent `code X` invocations auto-apply that profile | High | MEDIUM | Requires reliable profile detection from extension side. VS Code has no public API for current profile name (open issue #177463). Workaround: parse `globalStorageUri` path or use `process.env` inspection |
| **Remote session routing** | When running `code` inside an SSH session or dev container, route to the correct local VS Code instance that has the remote connection open. Uses `--folder-uri vscode-remote://ssh-remote+host/path` syntax | High | MEDIUM | Must understand `vscode.env.remoteName` values and construct appropriate `--folder-uri` URIs. Edge case: multiple local instances connected to the same remote host |
| **`which-code` query subcommand** | `which-code sessions` lists active sessions with their workspace, profile, and remote status. `which-code query /path` shows which session owns a path. Developer introspection tool | Medium | HIGH | Pure read from SQLite. Format as human-readable table or JSON for scripting |
| **Session staleness detection** | Detect and mark sessions whose VS Code instance is no longer running. Prevents routing to dead instances | Medium | MEDIUM | Extension writes heartbeat timestamps. CLI checks `invoked_at` recency + optionally probes IPC sockets. Stale threshold configurable (default: 4 hours, matching VS Code's own socket staleness heuristic) |
| **Workspace path normalization** | Resolve symlinks, canonicalize paths, handle `~` expansion. Without this, `/home/user/project` and `~/project` are treated as different workspaces | Low | HIGH | Use `std::fs::canonicalize` in Rust. Extension should store canonical paths too |
| **Database pruning / retention** | Auto-prune sessions older than N days. Append-only log grows unbounded without this | Low | HIGH | CLI subcommand `which-code prune --older-than 30d`. Extension could also prune on activation |

## Anti-Features

Features to explicitly NOT build. These are tempting but wrong for the project.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **GUI / webview / tree view** | Project explicitly has no UI. Adding one creates maintenance burden and scope creep. Config + output channel is the right abstraction for a utility extension | Expose all state via CLI (`which-code sessions`, `which-code query`). Use output channel for diagnostics |
| **IPC socket manipulation** | Directly creating or managing VS Code IPC sockets (`vscode-ipc-*.sock`) is fragile, undocumented, and version-dependent. VS Code doesn't clean up stale sockets reliably. This is a maintenance nightmare | Use higher-level routing: `--folder-uri`, `--reuse-window`, `--user-data-dir`, `--profile` flags. Let VS Code handle its own IPC |
| **Settings Sync / profile synchronization** | VS Code already has built-in Settings Sync and profile management. Reimplementing this is a losing battle against a first-party feature | Record which profile was used (for routing), but never try to sync or manage profile contents |
| **File save tracking** | Tracking every save creates massive noise in the database. The signal-to-noise ratio is terrible for routing decisions | Track open/close only. The set of open files is what matters for session identity, not save frequency |
| **Windows support (v1)** | PATH shim patterns, IPC sockets, and shell integration all work fundamentally differently on Windows. Supporting it in v1 doubles the surface area for no immediate user base | macOS + Linux only. Revisit if there's demand. The extension itself will work on Windows, but the CLI shim won't |
| **Intercepting `claude` or other commands** | Out of scope per PROJECT.md. Expanding the shim to other commands is feature creep | Focus on `code` interception only. If the pattern proves valuable, other commands can be added later in a separate project |
| **Real-time session sync between CLI and extension** | Building a bidirectional communication channel (filesystem watcher, named pipe, etc.) between the CLI and extension adds significant complexity | Shared SQLite database is the communication channel. CLI reads, extension writes. One-directional is sufficient for v1 |
| **Auto-update or self-update for CLI** | Managing binary updates is complex (signatures, rollback, platform detection). Not worth it for v1 | Document manual update process. Consider `cargo install` or release binaries on GitHub |

## Feature Dependencies

```
[Extension: SQLite at globalStorageUri]
    |
    +--> [Extension: Record invocation metadata]
    |        |
    |        +--> [Extension: Capture sessionId + remoteName]
    |        |
    |        +--> [Extension: Track open file manifest]
    |
    +--> [CLI: Read session database]
             |
             +--> [CLI: Session-aware routing]  (requires session data to exist)
             |        |
             |        +--> [CLI: Profile-aware routing]  (requires profile in session records)
             |        |
             |        +--> [CLI: Remote session routing]  (requires remoteName in session records)
             |
             +--> [CLI: which-code query subcommand]  (requires readable DB)
             |
             +--> [CLI: Session staleness detection]  (requires timestamps)

[CLI: PATH shim intercepts `code`]
    |
    +--> [CLI: Recursive invocation self-detection]  (required for safety)
    |
    +--> [CLI: Pass-through to real `code`]  (required for safety)
    |
    +--> [CLI: Shell integration script]  (user-facing install mechanism)

[CLI: Workspace path normalization]  (independent, but improves routing accuracy)

[CLI: Database pruning]  (independent, maintenance feature)
```

**Critical path:** Extension DB setup -> Extension metadata recording -> CLI DB reading -> CLI routing. Everything else branches from this spine.

## Shell Shim Pattern Analysis

Which Code's CLI shim draws from established patterns. Here is how they compare.

### pyenv / rbenv Model (Closest Match)
- **Mechanism:** Dedicated shims directory (`~/.pyenv/shims/`) prepended to PATH. Each shim is a tiny bash script that calls back into the manager binary
- **Version resolution:** `.python-version` file in current/parent directories, then global setting
- **Rehash:** After installing new packages, `pyenv rehash` regenerates shims. Not needed for Which Code since we only shim one command (`code`)
- **Relevance to Which Code:** HIGH. Same pattern: dedicated directory, PATH prepend, intercept-then-delegate. Difference: Which Code routes to running *instances* not *versions*

### mise Model (Modern Evolution)
- **Two modes:** PATH activation (zero overhead, `which node` shows real path) vs shims (works in non-interactive shells, IDEs)
- **Key insight:** mise found that shims and PATH activation conflict -- if both are active, shims dir is now auto-removed on `activate`. Which Code should pick one strategy
- **Relevance to Which Code:** MEDIUM. The binary shim approach (not shell function) is better for Which Code because it needs to work from external terminals, not just interactive shells

### direnv Model (Environment, Not Binary)
- **Mechanism:** Shell hook (`eval "$(direnv hook bash)"`) runs before each prompt. Loads/unloads env vars from `.envrc`
- **Security:** Requires explicit `direnv allow` before loading a new `.envrc`. Good security model
- **PATH manipulation:** `PATH_add` prepends, `PATH_rm` removes. Clean enter/exit semantics
- **Relevance to Which Code:** LOW for core shim. But the `eval "$(which-code init bash)"` pattern for shell integration is directly borrowed from direnv's hook model

### nvm Model (Shell Function, Not Shim)
- **Mechanism:** Pure shell function, no shims. Must be loaded into every shell session
- **Drawback:** Doesn't work in non-interactive contexts (scripts, IDEs, cron)
- **Relevance to Which Code:** LOW. Which Code needs to work from any terminal, including ones not sourced with the shell function

**Recommendation for Which Code:** Use the pyenv/rbenv shim binary pattern with direnv-style shell init. Binary in `~/.which-code/bin/code` (a compiled Rust binary, not a bash script). Shell integration via `eval "$(which-code init bash)"` for PATH setup. This gives maximum compatibility -- works from any terminal, any context.

## Multi-Instance Routing Scenarios

### Scenario 1: Two local VS Code windows, different workspaces
- Window A: `/home/user/project-alpha` (Default profile)
- Window B: `/home/user/project-beta` (Python profile)
- User runs: `code /home/user/project-alpha/src/main.rs`
- **Expected behavior:** Opens file in Window A (workspace match). Uses `--reuse-window` targeting Window A's instance
- **Implementation:** Query DB for sessions with `workspace_path` matching or containing the target path. Most recent active session wins

### Scenario 2: Same workspace, different profiles
- Window A: `/home/user/project` (Default profile)
- Window B: `/home/user/project` (Teaching profile, different user-data-dir)
- User runs: `code /home/user/project/README.md`
- **Expected behavior:** Ambiguous. Route to most recently active instance by default. Allow `--profile` override
- **Implementation:** If multiple sessions match workspace, prefer the most recently activated. CLI flag `--profile "Teaching"` overrides

### Scenario 3: Remote SSH session
- Local Window A: Connected to `devbox:/home/user/project` via Remote-SSH
- User SSHs into devbox manually, runs `code .`
- **Expected behavior:** This is the hardest case. The `code` command on the remote host should ideally open in the local Window A that already has the SSH connection. But without `VSCODE_IPC_HOOK_CLI` set (since user is in a non-VS-Code terminal), this requires the CLI to construct `--folder-uri vscode-remote://ssh-remote+devbox/home/user/project` and invoke the local `code`
- **Implementation:** CLI detects it's running on a remote host (no local VS Code, or `SSH_CONNECTION` env var set). Constructs remote URI. Invokes `code` with `--folder-uri`. Requires the local `code` binary to be reachable (or a separate mechanism). **This is the v2+ scenario -- complex, needs IPC or local-remote coordination**

### Scenario 4: Dev Container
- Local Window A: Dev container attached to `my-container` at `/workspace`
- Inside container terminal: `code /workspace/src/app.ts`
- **Expected behavior:** If `VSCODE_IPC_HOOK_CLI` is set (integrated terminal), VS Code handles this natively. If not set (external exec into container), need the same remote-URI routing as SSH
- **Implementation:** Check `VSCODE_IPC_HOOK_CLI` first. If set, delegate to real `code` (it already works). If not set, construct `--folder-uri vscode-remote://attached-container+<hex_id>/workspace/src/app.ts`

### Scenario 5: No running instance
- No VS Code windows open
- User runs: `code /home/user/project`
- **Expected behavior:** Launch VS Code normally with the historically associated profile (if any). Fall back to default if no history
- **Implementation:** Query DB for most recent session with this workspace. If found, launch with `--profile` and/or `--user-data-dir` from that session. If not found, pass through to default `code`

## MVP Recommendation

**Phase 1 -- Foundation (must ship):**
1. Extension: SQLite DB setup at `globalStorageUri` with WAL mode
2. Extension: Record invocation metadata (all fields from schema)
3. Extension: Track open file manifest (open/close events)
4. CLI: PATH shim with recursive self-detection
5. CLI: Shell integration (`which-code init bash/zsh/fish`)
6. CLI: Pass-through to real `code` (safe default)
7. CLI: `which-code sessions` query subcommand (read DB, list sessions)

**Phase 2 -- Routing (the value):**
1. CLI: Session-aware routing (workspace match -> reuse instance)
2. CLI: Profile-aware routing (auto-apply historical profile)
3. CLI: Workspace path normalization
4. CLI: Session staleness detection + heartbeat in extension
5. Extension: Capture `vscode.env.sessionId` and `vscode.env.remoteName`

**Phase 3 -- Polish:**
1. CLI: Database pruning / retention
2. CLI: Remote session routing (SSH/container URI construction)
3. CLI: JSON output mode for scripting
4. Extension: Configurable recording (exclude patterns, disable tracking)

**Defer indefinitely:**
- GUI/webview/tree view
- IPC socket manipulation
- Windows support
- Settings Sync integration
- `claude` command interception

## Sources

- [pyenv - How it works (shim pattern)](https://www.mungingdata.com/python/how-pyenv-works-shims/)
- [rbenv - How it works](https://medium.com/@Sudhagar/rbenv-how-it-works-e5a0e4fa6e76)
- [mise - Shims vs PATH activation](https://mise.jdx.dev/dev-tools/shims.html)
- [direnv - Shell integration patterns](https://direnv.net/)
- [VS Code CLI documentation](https://code.visualstudio.com/docs/configure/command-line)
- [VS Code Remote Development FAQ](https://code.visualstudio.com/docs/remote/faq)
- [VS Code Extension API - env namespace](https://code.visualstudio.com/api/references/vscode-api)
- [code-connect - IPC socket discovery](https://github.com/chvolkmann/code-connect)
- [VS Code IPC socket issues](https://github.com/microsoft/vscode/issues/157275)
- [VS Code profile name API request (open issue)](https://github.com/microsoft/vscode/issues/177463)
- [VS Code globalState per-profile behavior](https://github.com/microsoft/vscode/issues/270356)
- [SQLite WAL mode documentation](https://sqlite.org/wal.html)
- [VS Code Extension Storage Explained](https://medium.com/@krithikanithyanandam/vs-code-extension-storage-explained-the-what-where-and-how-3a0846a632ea)
- [VS Code --folder-uri for remote connections](https://dev.to/hacksore/vscode-remote-ssh-from-the-command-line-4p28)
- [Controlling VS Code from tmux (VSCODE_IPC_HOOK_CLI)](https://www.vinnie.work/blog/2024-06-29-controlling-vscode-from-tmux)
