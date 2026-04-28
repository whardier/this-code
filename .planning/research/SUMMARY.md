# Project Research Summary

**Project:** This Code (VS Code extension + Rust CLI session tracker)
**Domain:** Developer tooling -- PATH shim / launch interceptor with shared SQLite state
**Researched:** 2026-04-24
**Confidence:** HIGH

## Executive Summary

This Code is a two-process system: a VS Code extension (TypeScript) that silently records session metadata into a SQLite database, and a Rust CLI binary that intercepts `code` invocations via a PATH shim, reads that database, and routes to the correct VS Code instance and profile. This pattern is well-established in the developer tools ecosystem (pyenv, rbenv, mise all use PATH shim interception), and the technology choices are mature. The core architectural challenge is ensuring two independent processes -- one inside Electron, one a standalone binary -- can reliably share a SQLite database across local and remote development contexts.

The recommended approach is: use `@vscode/sqlite3` (Microsoft's Node-API fork) in the extension with WAL mode enabled, and `rusqlite` with the `bundled` feature in the Rust CLI. The database lives at a fixed well-known path (`~/.this-code/sessions.db`) rather than inside VS Code's `globalStorageUri`. This is the most consequential architectural decision from the research -- all four researchers converged on it. The extension declares `extensionKind: ["workspace"]` so it runs wherever the workspace files are, and writes to `~/.this-code/sessions.db` on that machine. The CLI reads from the same well-known path on the same machine. Each machine (local or remote) gets its own session database at a consistent, discoverable location.

The key risks are: (1) native SQLite module packaging requires platform-specific VSIX builds with CI matrix automation, (2) the CLI PATH shim must handle recursive self-invocation with multiple layers of defense, and (3) macOS `path_helper` can silently reorder PATH entries, breaking the shim. All three are well-understood problems with documented solutions from the pyenv/rbenv/mise ecosystem.

## Resolved Decisions

These questions had conflicting or ambiguous answers across research files and have been resolved.

| Decision                 | Resolution                                         | Rationale                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database location        | `~/.this-code/sessions.db` (fixed well-known path) | `globalStorageUri` varies by platform, profile, user-data-dir, and remote context. The CLI cannot discover it without VS Code APIs. A fixed path is discoverable by both processes without coordination. PROJECT.md should be updated to reflect this.                                                                                                                                                     |
| `extensionKind`          | `["workspace"]`                                    | Architecture initially said `["ui"]` to keep the DB local; Stack said `["workspace"]`. Resolution: `["workspace"]` is correct because the extension needs to track workspace file events wherever they are. Combined with the fixed `~/.this-code/sessions.db` path, each machine (local or remote) gets its own consistent database. The extension runs where the files are, which is the right semantic. |
| Extension SQLite library | `@vscode/sqlite3`                                  | Only viable option for Marketplace distribution. `better-sqlite3` has Electron ABI mismatches. `sql.js` is in-memory only. `@vscode/sqlite3` uses Node-API (ABI-stable) with prebuilt binaries for all targets.                                                                                                                                                                                            |
| CLI SQLite library       | `rusqlite` with `bundled` feature                  | Synchronous, no async runtime needed, statically links SQLite 3.51.3. `sqlx` would require tokio -- pure overhead for a read-and-exec CLI.                                                                                                                                                                                                                                                                 |

## Key Findings

### Recommended Stack

The extension is TypeScript with esbuild bundling, `@vscode/sqlite3` for database access, and `onStartupFinished` activation. The CLI is Rust edition 2024 with clap 4.6, figment 0.10, rusqlite 0.39, and the standard periphore tooling conventions (tracing, thiserror, anyhow, clippy pedantic). See STACK.md for full version pinning and configuration details.

**Core technologies:**

- **@vscode/sqlite3** (extension): Microsoft-maintained Node-API SQLite binding -- the only native SQLite option that works reliably in VS Code extensions without Electron rebuild gymnastics
- **rusqlite + bundled** (CLI): Synchronous Rust SQLite binding with statically linked SQLite -- no system dependency, no async runtime
- **esbuild** (extension bundling): Official VS Code recommendation, fast, simple config; native module marked as external
- **clap 4.6 + figment 0.10** (CLI config): Derive-based CLI args with hierarchical config merging (TOML + env vars)
- **WAL mode + busy_timeout** (shared): Non-negotiable for cross-process concurrent access to the SQLite database

### Expected Features

**Must have (table stakes):**

- Extension records invocation metadata on activation (workspace, profile, user-data-dir, IDE paths, remote context)
- Extension tracks open file manifest via `onDidOpenTextDocument` / `onDidCloseTextDocument`
- Extension uses WAL mode SQLite with `busy_timeout` at `~/.this-code/sessions.db`
- CLI PATH shim intercepts `code` with recursive self-detection (env var guard + PATH stripping + canonical path comparison)
- CLI shell integration for bash/zsh/fish (`eval "$(this-code init bash)"`)
- CLI pass-through to real `code` as safe default
- CLI `this-code sessions` query subcommand for introspection

**Should have (differentiators):**

- Session-aware routing (workspace match reuses existing VS Code instance)
- Profile-aware routing (auto-apply historical profile for workspace)
- Workspace path normalization (symlinks, `~` expansion, canonicalization)
- Session staleness detection (heartbeat + timestamp recency)
- `this-code query /path` for scripted routing decisions

**Defer (v2+):**

- Remote session routing (SSH/container URI construction -- complex, needs local-remote coordination)
- GUI / webview / tree view (explicitly an anti-feature)
- Windows support
- IPC socket manipulation
- `claude` command interception

### Architecture Approach

The system follows a writer/reader pattern with shared SQLite state. The extension is the sole writer: it creates the database, sets WAL mode, inserts invocation rows on activation, and updates the `open_files` JSON column on document events. The CLI is the reader: it opens the database read-write (required for WAL `-shm` access), queries for routing context, strips itself from PATH, and `exec`s the real `code` binary. Shell integration uses the pyenv/rbenv shim pattern -- a compiled Rust binary at `~/.this-code/bin/code` prepended to PATH via shell init scripts.

**Major components:**

1. **VS Code Extension** -- records session metadata to SQLite, tracks open files, writes to `~/.this-code/sessions.db`
2. **SQLite Database** -- shared state between extension (writer) and CLI (reader), WAL mode, append-only invocation log
3. **Rust CLI (`this-code`)** -- PATH shim binary, reads DB for routing, `exec`s real `code`, provides query/management subcommands
4. **Shell Integration** -- bash/zsh/fish init scripts that prepend `~/.this-code/bin` to PATH, following pyenv/direnv conventions

### Critical Pitfalls

1. **Database location fragmentation** -- `globalStorageUri` varies by platform, profile, user-data-dir, and remote context. Solved: use fixed `~/.this-code/sessions.db` path.
2. **Native module packaging** -- `@vscode/sqlite3` requires platform-specific VSIX builds (darwin-arm64, darwin-x64, linux-x64, linux-arm64). Must set up CI matrix from the start. Mark native module as `external` in esbuild.
3. **CLI recursive self-invocation** -- PATH shim calling itself infinitely. Solved: three layers of defense (env var `WHICH_CODE_ACTIVE`, PATH stripping, canonical path comparison via `std::env::current_exe()`).
4. **SQLite concurrent access** -- CLI must open with `SQLITE_OPEN_READWRITE` (not read-only) for WAL `-shm` access. Both processes need `PRAGMA busy_timeout=5000`. Extension uses short transactions.
5. **macOS `path_helper` reorders PATH** -- Shell integration must set PATH in `~/.zshrc` (not `~/.zshenv`) because `path_helper` in `/etc/zprofile` reorders entries set before it runs.

## Implications for Roadmap

Based on research, the build order is extension-first, CLI-second. The extension creates the database that everything else reads.

### Phase 1: Extension Core + Database Foundation

**Rationale:** The extension creates the database that everything else reads. It locks the schema before CLI development begins. This is the smallest unit that can be independently validated (inspect the SQLite file with the `sqlite3` CLI tool).
**Delivers:** Working VS Code extension that records invocation metadata to `~/.this-code/sessions.db` with WAL mode, schema migrations, and open file tracking.
**Addresses:** All extension table-stakes features from FEATURES.md -- invocation recording, file manifest tracking, output channel diagnostics, graceful activation/deactivation.
**Avoids:** Pitfall 1 (database location) by using fixed well-known path. Pitfall 2 (native module) by choosing `@vscode/sqlite3` with platform-aware packaging from day one. Pitfall 4 (concurrent access) by enabling WAL mode on creation. Pitfall 7 (activation overhead) by using `onStartupFinished`. Pitfall 11 (schema migrations) by implementing `PRAGMA user_version` from the start.

### Phase 2: Rust CLI + Shell Integration

**Rationale:** With a populated database from Phase 1, the CLI can be developed and tested against real data. The CLI and shell integration are tightly coupled (the CLI binary is what gets placed in PATH) and should be built together.
**Delivers:** Rust CLI binary that reads the session database, passes through to real `code`, and shell integration scripts for bash/zsh/fish.
**Addresses:** All CLI table-stakes features -- PATH shim, recursive self-detection, pass-through, shell integration, `this-code sessions` subcommand.
**Avoids:** Pitfall 3 (recursive invocation) with three-layer defense. Pitfall 5 (macOS path_helper) by setting PATH in `.zshrc`. Pitfall 6 (fish incompatibility) by providing separate fish script. Pitfall 12 (CLI database discovery) by using fixed well-known path with figment config override.

### Phase 3: Session-Aware Routing

**Rationale:** This is the differentiating value -- routing `code` invocations to the right VS Code instance based on session history. It requires both extension and CLI to be working and tested. The routing logic is the most complex and least well-documented part of the system.
**Delivers:** Intelligent routing based on workspace match, profile history, and session recency. Staleness detection. Path normalization.
**Addresses:** Differentiator features -- session-aware routing, profile-aware routing, workspace normalization, staleness detection, `this-code query` subcommand.
**Avoids:** Building routing logic before the data pipeline is proven.

### Phase 4: Packaging + Distribution

**Rationale:** Platform-specific VSIX builds, Marketplace publishing, CLI binary releases, and CI/CD automation. This is infrastructure work that should happen after the features are stable.
**Delivers:** Published Marketplace extension (multi-platform VSIX), GitHub release binaries for CLI, CI/CD pipeline.
**Addresses:** Pitfall 2 (native module packaging) and Pitfall 8 (esbuild bundling) with tested, automated builds.

### Phase 5: Polish + Deferred Features

**Rationale:** Database pruning, JSON output mode, configurable recording, remote session routing exploration.
**Delivers:** Production-quality tool with maintenance features.
**Addresses:** Remaining differentiator and polish features from FEATURES.md.

### Phase Ordering Rationale

- Extension must come first because it creates the database schema that the CLI depends on.
- CLI and shell integration are co-dependent -- the binary IS the shim that goes in PATH.
- Routing logic requires both extension and CLI to be working end-to-end with real data.
- Packaging is infrastructure that should stabilize after features, not before.
- The dependency chain is clear: schema -> data -> queries -> routing -> distribution.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (Routing):** Session-aware routing has MEDIUM confidence. No existing tool does instance-level routing for VS Code. The `--reuse-window`, `--user-data-dir`, and `--profile` flag interactions need empirical testing. VS Code has no public API for current profile name (open issue #177463).
- **Phase 4 (Packaging):** Platform-specific VSIX packaging with native modules is documented but fiddly. Needs hands-on CI setup and testing across all target platforms.

Phases with standard patterns (skip research-phase):

- **Phase 1 (Extension Core):** Well-documented VS Code extension patterns. `@vscode/sqlite3` usage is straightforward. WAL mode is standard SQLite.
- **Phase 2 (CLI + Shell):** PATH shim pattern is thoroughly documented by pyenv/rbenv/mise. Rust CLI with clap/figment/rusqlite is standard.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                  |
| ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | All technologies are well-established with official documentation. Version pinning verified against crates.io and npm. |
| Features     | HIGH       | Table stakes features are well-defined. Differentiators have clear implementation paths. Anti-features are explicit.   |
| Architecture | HIGH       | Two-process writer/reader with shared SQLite is a proven pattern. PATH shim is battle-tested by pyenv/rbenv.           |
| Pitfalls     | HIGH       | All critical pitfalls have documented solutions. The `globalStorageUri` vs fixed path question is resolved.            |

**Overall confidence:** HIGH

### Gaps to Address

- **VS Code profile name detection:** No public API exists for reading the current profile name (VS Code issue #177463). Workarounds (parsing `globalStorageUri` path, `process.env` inspection) need empirical validation during Phase 1.
- **`--reuse-window` behavior with `--user-data-dir`:** The interaction between these flags when routing to an existing instance is not well-documented. Needs testing during Phase 3.
- **Remote session routing (v2):** Constructing `--folder-uri vscode-remote://ssh-remote+host/path` from a remote CLI is complex and requires the local `code` binary to be reachable. Deferred but needs design thinking before Phase 5.
- **`onDidCloseTextDocument` false positives:** This event fires on language ID changes (not just tab close). The extension needs filtering logic -- test during Phase 1 to determine the false positive rate.

## Sources

### Primary (HIGH confidence)

- [VS Code Extension API Reference](https://code.visualstudio.com/api/references/vscode-api) -- env.remoteName, env.appRoot, globalStorageUri
- [VS Code Remote Extensions Guide](https://code.visualstudio.com/api/advanced-topics/remote-extensions) -- extensionKind, Extension Host architecture
- [VS Code Bundling Extensions (esbuild)](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) -- official bundling guide
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) -- onStartupFinished behavior
- [SQLite WAL Documentation](https://sqlite.org/wal.html) -- concurrent access, read-only WAL requirements
- [@vscode/sqlite3 npm](https://www.npmjs.com/package/@vscode/sqlite3) -- Node-API prebuilt binaries, platform support
- [microsoft/vscode-node-sqlite3](https://github.com/microsoft/vscode-node-sqlite3) -- source repo, actively maintained
- [rusqlite docs.rs](https://docs.rs/rusqlite/latest/rusqlite/) -- connection flags, bundled SQLite
- [pyenv shim pattern](https://www.mungingdata.com/python/how-pyenv-works-shims/) -- PATH interception reference
- [mise shims documentation](https://mise.jdx.dev/dev-tools/shims.html) -- modern shim patterns, recursion prevention

### Secondary (MEDIUM confidence)

- [VS Code Discussions #16](https://github.com/microsoft/vscode-discussions/discussions/16) -- community SQLite recommendations
- [VS Code Discussions #768](https://github.com/microsoft/vscode-discussions/discussions/768) -- native module publishing challenges
- [better-sqlite3 Issue #1321](https://github.com/WiseLibs/better-sqlite3/issues/1321) -- Electron incompatibility documentation
- [VS Code Profile name API (Issue #177463)](https://github.com/microsoft/vscode/issues/177463) -- open request, no resolution
- [code-connect](https://github.com/chvolkmann/code-connect) -- IPC socket discovery reference

### Tertiary (LOW confidence)

- VS Code `--reuse-window` + `--user-data-dir` interaction -- needs empirical testing, sparse documentation
- `onDidCloseTextDocument` false positive rate on language ID change -- needs empirical measurement

---

_Research completed: 2026-04-24_
_Ready for roadmap: yes_
