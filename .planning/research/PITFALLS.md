# Domain Pitfalls

**Domain:** VS Code extension + Rust CLI PATH shim (session tracking with SQLite)
**Researched:** 2026-04-24

## Critical Pitfalls

Mistakes that cause rewrites or architectural failures.

### Pitfall 1: globalStorageUri Lives on DIFFERENT Machines in Local vs Remote Sessions

**What goes wrong:** The extension records session data to `context.globalStorageUri`, which resolves to completely different filesystem paths depending on where the extension host runs. On local macOS: `~/Library/Application Support/Code/User/globalStorage/whardier.this-code/`. On a remote SSH host: `~/.vscode-server/data/User/globalStorage/whardier.this-code/` on the REMOTE machine. The Rust CLI shim runs on the LOCAL machine and needs to read the database. If the user is in a remote SSH session, the database the extension writes to is on the remote server -- the CLI on the local machine cannot see it.

**Why it happens:** VS Code's remote architecture runs workspace extensions in the remote extension host. The `globalStorageUri` API correctly resolves to a writable path on whichever machine the extension host is running. This is by design for most extensions but is catastrophic for This Code because the CLI consumer is always local.

**Consequences:**

- CLI on local machine finds no session data for remote workspaces
- Session routing fails entirely for the primary use case (SSH remote dev)
- Architecture is fundamentally broken for the core value proposition

**Prevention:**

- The extension MUST detect remote sessions using `vscode.env.remoteName` (returns `"ssh-remote"`, `"wsl"`, `"dev-container"`, `"codespaces"`, or `undefined` for local)
- When running in a remote extension host, the extension must communicate session data BACK to the local machine. Options:
  1. **Preferred: Write to a well-known local path via VS Code's `vscode.workspace.fs` API** -- but this only accesses the remote filesystem when remote
  2. **Alternative: Use `globalState` (key-value) instead of file-based SQLite** for the critical routing metadata, since `globalState` is synced by VS Code -- but `globalState` is per-profile and has size limits
  3. **Practical approach: Accept that the database is per-machine.** The CLI on the local machine reads local sessions. The CLI on the remote machine (if installed) reads remote sessions. The extension writes to `globalStorageUri` wherever it runs. The `this-code` CLI must also be installed on remote machines to be useful there.
  4. **Hybrid: Extension writes a lightweight "breadcrumb" file to a known path readable by the local CLI**, perhaps via a custom VS Code command or terminal integration

**Detection:** During development, test by opening an SSH remote session and checking `context.globalStorageUri.fsPath` -- it will show a path on the remote server, not the local machine.

**Phase impact:** Must be resolved in architecture/design phase (Phase 1). This is THE critical architectural decision.

**Confidence:** HIGH -- verified against VS Code Remote Extensions documentation and observed paths (`~/.vscode-server/data/User/globalStorage/`).

---

### Pitfall 2: SQLite Native Module Packaging for VS Code Marketplace

**What goes wrong:** Using `better-sqlite3` (the most popular Node.js SQLite library) in a VS Code extension causes `NODE_MODULE_VERSION` mismatch errors because the native C++ addon is compiled against a specific Node.js version that differs from VS Code's bundled Electron Node.js version. Users get cryptic errors like: "The module was compiled against NODE_MODULE_VERSION 115. This version of Node.js requires NODE_MODULE_VERSION 127."

**Why it happens:** VS Code runs on Electron, which bundles its own Node.js version. Native addons compiled for system Node.js are binary-incompatible. Each VS Code update can change the Electron version, breaking previously working native modules. There is no officially supported approach for distributing VS Code extensions with native modules (see microsoft/vscode#658).

**Consequences:**

- Extension fails to activate on user machines
- Different failures across platforms (macOS, Linux, different architectures)
- Marketplace reviews tank
- Requires users to have C++ compilers and Python installed as fallback

**Prevention:** Choose one of these SQLite strategies (ordered by recommendation):

| Option            | Pros                                                                                                                                                            | Cons                                                                                                                                                     | Recommendation                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@vscode/sqlite3` | Microsoft-maintained, Node-API (stable ABI across Node versions), prebuilt for darwin-x64, darwin-arm64, linux-x64, linux-arm64 (glibc+musl), win-x64, win-ia32 | Async API (not synchronous like better-sqlite3), requires platform-specific VSIX packaging via `vsce package --target`                                   | **Use this** -- it is the only native SQLite option designed for VS Code's constraints |
| `sql.js` (WASM)   | Zero native dependencies, works everywhere including web                                                                                                        | In-memory only -- must serialize/deserialize entire DB to/from disk, ~1MB WASM binary, no concurrent access, poor performance for append-heavy workloads | Viable fallback if native packaging proves too painful                                 |
| `better-sqlite3`  | Fastest, synchronous API, most popular                                                                                                                          | **Fundamentally incompatible** with Marketplace distribution without extreme CI gymnastics                                                               | **Do not use**                                                                         |

If using `@vscode/sqlite3`, you MUST:

- Build platform-specific VSIX packages using `vsce package --target linux-x64`, `vsce package --target darwin-arm64`, etc.
- Set up CI/CD (GitHub Actions matrix) to build and publish all platform variants
- Mark the native `.node` file as external in esbuild config (`external: ['@vscode/sqlite3']`) and ensure it ships alongside the bundle
- Test on all target platforms before each release

**Detection:** Test extension activation on a clean machine (no dev tools installed). If it fails, your native module packaging is broken.

**Phase impact:** Must be decided in Phase 1 (stack selection). Affects CI/CD setup, testing strategy, and release process for the entire project lifecycle.

**Confidence:** HIGH -- verified via multiple GitHub issues, npm documentation for `@vscode/sqlite3`, and VS Code discussions confirming no official native module support path.

---

### Pitfall 3: CLI PATH Shim Recursive Self-Invocation (Infinite Loop)

**What goes wrong:** The `this-code` CLI installs itself as `code` in a directory prepended to PATH (`~/.this-code/bin/code`). When the user runs `code .`, the shim executes. The shim then needs to call the REAL `code` binary. If it simply calls `code` again, it finds itself (the shim) first in PATH, creating an infinite recursion loop that either hangs the terminal or spawns processes until the system runs out of resources.

**Why it happens:** PATH resolution is positional -- the first match wins. If the shim directory is leftmost, every `code` invocation resolves to the shim, including the shim's own attempt to invoke the real VS Code.

**Consequences:**

- Terminal hangs or system becomes unresponsive
- User loses trust in the tool
- Potential data loss from runaway processes
- Hard to debug because the failure mode is "nothing happens" or system slowdown

**Prevention:** Multiple layers of defense required:

1. **Environment variable guard:** Set `WHICH_CODE_ACTIVE=1` before invoking the real `code`. If the shim starts and this variable is already set, skip shim logic and call the real binary directly. This is the primary recursion breaker.

2. **PATH manipulation:** Before calling the real `code`, remove `~/.this-code/bin` from PATH so the subprocess resolves to the actual VS Code binary. This is how `mise` and `pyenv` prevent shim recursion.

3. **Use `which_all()` from the Rust `which` crate:** Find ALL `code` binaries in PATH, skip entries that resolve to the shim's own path (`std::env::current_exe()`), and use the next match. The `which` crate's `which_all()` function returns an iterator over all matches.

4. **Absolute path resolution:** On first successful resolution, cache the absolute path to the real `code` binary to avoid re-searching PATH.

**Detection:** Test with: `PATH=~/.this-code/bin:$PATH code .` -- if the terminal hangs, recursion protection is broken.

**Phase impact:** Core CLI implementation phase. Must be tested exhaustively before any release.

**Confidence:** HIGH -- well-documented pattern from pyenv, mise, rbenv, and other PATH shim tools.

---

### Pitfall 4: SQLite Concurrent Access Between Extension and CLI

**What goes wrong:** The VS Code extension writes session records to the SQLite database while the CLI simultaneously tries to read from it. Without proper concurrency handling, this causes `SQLITE_BUSY` errors, database locks, or corrupted reads.

**Why it happens:** SQLite is a file-based database. By default (rollback journal mode), a writer takes an exclusive lock that blocks all readers. Even in WAL mode, there are constraints: the `-shm` (shared memory) file requires write permissions from ALL processes, including "read-only" ones.

**Consequences:**

- CLI hangs waiting for lock
- CLI returns stale or incomplete data
- Potential database corruption if locks are not properly managed
- Error messages that confuse users

**Prevention:**

1. **Use WAL mode** -- set `PRAGMA journal_mode=WAL;` when the extension creates the database. WAL allows concurrent readers and a single writer without blocking each other.

2. **CLI must open with write permissions** (not read-only) -- counterintuitively, even read-only WAL consumers need write access to the `-shm` file. The Rust CLI must open the database with `SQLITE_OPEN_READWRITE` (or at minimum have write permissions to the directory). Opening with `SQLITE_OPEN_READONLY` will fail unless the `-shm` and `-wal` files already exist AND are readable.

3. **Short transactions** -- the extension should write session records in brief transactions (single INSERT, then commit). Never hold a write transaction open for extended periods.

4. **Busy timeout** -- both extension and CLI should set `PRAGMA busy_timeout=5000;` (5 seconds) so transient locks are retried rather than immediately failing.

5. **Same machine requirement** -- WAL mode requires all processes to be on the same host sharing memory-mapped files. This works for the local case but reinforces Pitfall 1: the CLI and extension must access the same filesystem.

6. **Use `SQLITE_FCNTL_PERSIST_WAL`** on the extension side so that `-wal` and `-shm` files persist even when the extension closes its connection. This ensures the CLI can always open the database without needing to create these files.

**Detection:** Run the extension and CLI simultaneously. If the CLI gets `SQLITE_BUSY` or `SQLITE_READONLY` errors, concurrency is misconfigured.

**Phase impact:** Database initialization code in Phase 1. Must be established before any writes occur.

**Confidence:** HIGH -- verified against SQLite WAL documentation (sqlite.org/wal.html) and SQLite forums.

---

## Moderate Pitfalls

### Pitfall 5: macOS path_helper Reorders PATH, Breaking Shim Priority

**What goes wrong:** On macOS, `/etc/zprofile` calls `/usr/libexec/path_helper`, which reads `/etc/paths` and `/etc/paths.d/` to construct PATH. This utility REORDERS PATH so system paths come first, potentially pushing `~/.this-code/bin` behind `/usr/local/bin` (where the real `code` lives). The shim stops intercepting `code` calls silently.

**Why it happens:** `path_helper` runs in login shells via `/etc/zprofile` BEFORE `~/.zprofile` or `~/.zshrc`. It takes any existing PATH entries and appends them after the system paths. If the user sets PATH in `~/.zshenv` (which runs before `/etc/zprofile`), their customizations get reordered to the end.

**Consequences:**

- Shim appears to be installed but never fires
- Silent failure -- no error, `code` just opens VS Code normally without session tracking
- User reports "it doesn't work" with no diagnostic information

**Prevention:**

- Shell integration scripts MUST set PATH in `~/.zshrc` (interactive shell config), NOT `~/.zshenv`, because `~/.zshrc` runs AFTER `path_helper`
- For bash: use `~/.bashrc` (same reasoning -- runs after `/etc/profile`)
- For fish: use `fish_add_path --prepend ~/.this-code/bin` in `config.fish`
- Document this clearly in installation instructions
- The `this-code` CLI should include a `this-code doctor` subcommand that checks PATH order and warns if the shim is not in the leftmost position

**Detection:** After installation, run `This Code` -- if it doesn't show `~/.this-code/bin/code`, PATH ordering is wrong.

**Phase impact:** Shell integration implementation phase. Must be tested on macOS specifically.

**Confidence:** HIGH -- verified against macOS zsh documentation and path_helper behavior.

---

### Pitfall 6: Fish Shell Syntax Incompatibility

**What goes wrong:** Fish shell uses fundamentally different syntax from bash/zsh. Shell integration scripts using `export`, `$()` command substitution, `[[` conditionals, or `source ~/.this-code/env.sh` will silently fail or produce errors in fish.

**Why it happens:** Fish is intentionally non-POSIX. It uses `set -x` instead of `export`, `(command)` instead of `$(command)`, `test` or `if` with different syntax, and stores PATH as a list (not colon-delimited string). A single shell script cannot target both POSIX shells and fish.

**Consequences:**

- Fish users cannot use shell integration
- Potential silent failures if fish partially parses POSIX syntax
- Community perception of "doesn't support fish" limits adoption

**Prevention:**

- Provide THREE separate shell integration files:
  - `env.bash` (for bash, also works in zsh)
  - `env.zsh` (for zsh, can source the bash version or be standalone)
  - `env.fish` (for fish, completely separate syntax)
- Fish-specific: use `fish_add_path --prepend ~/.this-code/bin` (built-in, handles deduplication)
- Fish-specific: use `set -gx WHICH_CODE_ACTIVE 1` instead of `export WHICH_CODE_ACTIVE=1`
- Test all three shells in CI

**Detection:** Run `source ~/.this-code/env.fish` in fish -- if it errors on `export` or `$()`, the script is not fish-compatible.

**Phase impact:** Shell integration phase. Can be deferred to after bash/zsh support ships, but should be planned from the start.

**Confidence:** HIGH -- well-documented fish incompatibilities.

---

### Pitfall 7: Extension Activation Overhead with onStartupFinished

**What goes wrong:** Using `"*"` (activate on everything) as the activation event causes the extension to load during VS Code startup, slowing the editor. However, using a too-narrow activation event means the extension misses session tracking for windows opened without triggering that event.

**Why it happens:** This Code needs to track EVERY `code` invocation, which means it must activate on every window open. But it also must not block VS Code startup.

**Consequences:**

- If `"*"`: Extension contributes to startup lag, user may disable it
- If too narrow (e.g., `onCommand`): Misses passive window opens, breaks the core tracking function
- VS Code team reviews extensions with `"*"` activation unfavorably for Marketplace featuring

**Prevention:**

- Use `"onStartupFinished"` activation event -- this activates the extension AFTER VS Code has fully loaded, so it does not block startup, but still fires for every window
- Keep `activate()` function extremely lightweight: just register event listeners and write one session record
- Defer heavy initialization (SQLite connection, schema migration) to first actual use or via `setImmediate`/`setTimeout`
- Use esbuild to bundle the extension, minimizing load time
- Monitor activation time via `Developer: Show Running Extensions` -- target under 50ms

**Detection:** Open VS Code with `Developer: Startup Performance` and check if the extension appears in slow activation list.

**Phase impact:** Extension implementation phase. Easy to get right if considered from the start.

**Confidence:** HIGH -- directly from VS Code activation events documentation.

---

### Pitfall 8: esbuild Bundling of Native SQLite Module

**What goes wrong:** esbuild cannot bundle native `.node` addon files. If you try to bundle `@vscode/sqlite3` with esbuild, it either fails to resolve the native binary or bundles it as a string path rather than a loadable module.

**Why it happens:** Native Node.js addons (`.node` files) are shared libraries loaded at runtime via `process.dlopen()`. They cannot be inlined into a JavaScript bundle. esbuild's `{ ".node": "file" }` loader copies the file but the require path may break at runtime.

**Consequences:**

- Extension fails to load SQLite at runtime
- Error: "Cannot find module './napi-v6-darwin-arm64/...'"
- Works in development (unbundled) but fails in packaged VSIX

**Prevention:**

- Mark the native module as external in esbuild config: `external: ['@vscode/sqlite3']`
- Include the `@vscode/sqlite3` package (with its platform-specific binary) in the VSIX via `.vscodeignore` configuration (do NOT ignore `node_modules/@vscode/sqlite3/`)
- Alternatively, use `--no-dependencies` flag with `vsce package` to prevent vsce from handling dependencies, and manually ensure the native module is included
- Test the PACKAGED VSIX (not the dev version) before publishing: `code --install-extension ./this-code-0.0.1.vsix`

**Detection:** Package the extension (`vsce package`), install it in a clean VS Code instance, and check if SQLite operations work. If they fail, the bundling is wrong.

**Phase impact:** Build/packaging phase. Must be verified before first Marketplace publish.

**Confidence:** HIGH -- confirmed via esbuild issue #1051 and VS Code bundling documentation.

---

## Minor Pitfalls

### Pitfall 9: Extension Runs in Wrong Host When extensionKind is Misconfigured

**What goes wrong:** If `extensionKind` is set to `["ui"]`, the extension runs in the local extension host even during remote sessions. It then cannot access the remote workspace's file events. If set to `["ui", "workspace"]`, VS Code may choose the local host when the remote host would be more appropriate.

**Why it happens:** The `extensionKind` property determines where the extension runs. This Code needs workspace access (file events, workspace path), so it must run where the workspace is.

**Prevention:**

- Set `"extensionKind": ["workspace"]` in `package.json` -- this ensures the extension always runs where the workspace is located
- This means: local host for local workspaces, remote host for SSH workspaces
- Accept the trade-off: the SQLite database will be on whichever machine hosts the workspace (connects to Pitfall 1)

**Detection:** Open a remote SSH session, check `Developer: Show Running Extensions` -- the extension should show "Remote" not "Local".

**Phase impact:** Extension manifest configuration in Phase 1.

**Confidence:** HIGH -- directly from VS Code Extension Host documentation.

---

### Pitfall 10: VS Code Profile Support Complicates globalStorageUri

**What goes wrong:** VS Code Profiles (introduced in 1.75) can affect extension storage. The `globalStorageUri` may or may not be profile-scoped depending on VS Code version and configuration. If profile-scoped, different profiles get different databases, fragmenting session history.

**Why it happens:** VS Code issue #160466 requests a `globalStorageUri` that respects the active Profile. The behavior has evolved across versions.

**Prevention:**

- Test with multiple VS Code profiles to determine if `globalStorageUri` is shared or per-profile
- If per-profile: consider using a fixed, well-known path outside VS Code's control (e.g., `~/.this-code/sessions.db`) instead of relying solely on `globalStorageUri`
- The CLI already needs to know where the database is -- a fixed path simplifies discovery for both extension and CLI

**Detection:** Create two profiles, activate the extension in each, and compare `context.globalStorageUri.fsPath` values.

**Phase impact:** Architecture phase. Using a well-known path may be simpler than `globalStorageUri` for this specific use case.

**Confidence:** MEDIUM -- profile behavior around `globalStorageUri` is evolving and not fully documented for all cases.

---

### Pitfall 11: Database Schema Migrations on Extension Updates

**What goes wrong:** When the extension updates, the SQLite schema may need to change (new columns, indexes). If migrations are not handled carefully, the extension crashes on startup because it expects new columns that don't exist in the old database.

**Why it happens:** VS Code auto-updates extensions. The new code runs against the old database immediately after update, with no migration step.

**Prevention:**

- Use a `schema_version` table or `PRAGMA user_version` to track database version
- Run migrations in `activate()` before any queries
- Migrations must be idempotent (safe to run multiple times)
- Use `ALTER TABLE ... ADD COLUMN` which is backwards-compatible in SQLite (new columns default to NULL)
- Never rename or remove columns in production

**Detection:** Simulate an upgrade by deploying a new schema against an existing database file.

**Phase impact:** Extension implementation phase. Must be designed in from the beginning.

**Confidence:** HIGH -- standard SQLite application pattern.

---

### Pitfall 12: CLI Cannot Locate Database Without Hardcoded Path Knowledge

**What goes wrong:** The CLI needs to find the SQLite database that the extension writes. But `globalStorageUri` resolves to a path that includes the VS Code data directory (which varies by platform, installation type, and profile). The CLI cannot call VS Code APIs to discover this path.

**Why it happens:** The CLI is a standalone Rust binary with no access to VS Code's internal path resolution. It must independently know or discover where the database file lives.

**Prevention:**

- **Option A (recommended): Use a fixed, well-known path** like `~/.this-code/sessions.db`. The extension writes here (in addition to or instead of `globalStorageUri`). The CLI reads here. Both sides agree on the location without needing VS Code APIs.
- **Option B: Extension writes a breadcrumb** -- on activation, the extension writes a small file to `~/.this-code/db-path.txt` containing the resolved `globalStorageUri` path. The CLI reads this breadcrumb to find the database.
- **Option C: CLI searches known paths** -- check `~/Library/Application Support/Code/User/globalStorage/whardier.this-code/` (macOS), `~/.config/Code/User/globalStorage/whardier.this-code/` (Linux), and `~/.vscode-server/data/User/globalStorage/whardier.this-code/` (remote).

**Detection:** Install extension, then run CLI without any configuration -- if it can't find the database, path discovery is broken.

**Phase impact:** Architecture phase (Phase 1). The extension and CLI must agree on database location before either is implemented.

**Confidence:** HIGH -- inevitable consequence of having two independent processes access the same file.

---

## Phase-Specific Warnings

| Phase Topic              | Likely Pitfall                                                                                              | Mitigation                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture / Design    | Pitfall 1 (globalStorageUri remote path), Pitfall 12 (CLI database discovery), Pitfall 10 (profile scoping) | Decide on fixed well-known path (`~/.this-code/sessions.db`) vs `globalStorageUri` early. Accept per-machine databases.              |
| Stack Selection          | Pitfall 2 (native module packaging)                                                                         | Choose `@vscode/sqlite3` with platform-specific VSIX, or use a well-known path and let the extension write via `vscode.workspace.fs` |
| Extension Implementation | Pitfall 7 (activation overhead), Pitfall 9 (extensionKind), Pitfall 11 (schema migrations)                  | Use `onStartupFinished`, set `extensionKind: ["workspace"]`, implement versioned migrations                                          |
| CLI Implementation       | Pitfall 3 (recursive invocation), Pitfall 4 (concurrent SQLite access)                                      | Environment variable guard + PATH manipulation + `which_all()`, WAL mode + busy timeout                                              |
| Shell Integration        | Pitfall 5 (macOS path_helper), Pitfall 6 (fish incompatibility)                                             | Set PATH in `.zshrc`/`.bashrc` (after path_helper), provide separate fish script                                                     |
| Packaging / Release      | Pitfall 2 (native module), Pitfall 8 (esbuild bundling)                                                     | CI matrix for platform VSIX builds, external native module in esbuild, test packaged VSIX                                            |

## Architectural Recommendation

Based on the pitfalls above, the strongest mitigation for Pitfalls 1, 10, and 12 is to **abandon `globalStorageUri` as the primary database location** and instead use a fixed, well-known path:

```
~/.this-code/sessions.db
```

**Rationale:**

- Both extension and CLI can find it without VS Code API access
- Not affected by VS Code profile scoping
- Works the same on local and remote machines (each machine gets its own database at the same well-known path)
- The extension still uses `context.globalStorageUri` for its own internal state (if needed) but writes session records to the shared location
- The CLI does not need to reverse-engineer VS Code's internal directory structure

This is a divergence from the current PROJECT.md which specifies `globalStorageUri` for SQLite storage. The pitfalls documented here provide the rationale for reconsidering that decision.

## Sources

- [VS Code Remote Extensions Guide](https://code.visualstudio.com/api/advanced-topics/remote-extensions) -- globalStorageUri behavior in remote sessions
- [VS Code Extension Host Documentation](https://code.visualstudio.com/api/advanced-topics/extension-host) -- extension host selection and extensionKind
- [SQLite WAL Documentation](https://sqlite.org/wal.html) -- concurrent access, read-only WAL requirements
- [SQLite Forum: Read-only WAL Access](https://sqlite.org/forum/info/855adb6bc430f875) -- -shm file write permission requirement
- [better-sqlite3 Issue #385](https://github.com/WiseLibs/better-sqlite3/issues/385) -- VS Code incompatibility, "don't use native modules"
- [VS Code Discussions #16](https://github.com/microsoft/vscode-discussions/discussions/16) -- SQLite options for VS Code extensions
- [VS Code Discussions #768](https://github.com/microsoft/vscode-discussions/discussions/768) -- native module publishing (not officially supported)
- [@vscode/sqlite3 npm](https://www.npmjs.com/package/@vscode/sqlite3) -- Node-API prebuilt binary support
- [VS Code Platform-Specific Sample](https://github.com/microsoft/vscode-platform-specific-sample) -- multi-platform VSIX packaging
- [mise Shims Documentation](https://mise.jdx.dev/dev-tools/shims.html) -- PATH manipulation for recursion prevention
- [pyenv Infinite Loop Issue #2696](https://github.com/pyenv/pyenv/issues/2696) -- shim recursion in practice
- [Rust `which` Crate](https://docs.rs/which) -- `which_all()` for finding all PATH matches
- [macOS path_helper Behavior](https://gist.github.com/Linerre/f11ad4a6a934dcf01ee8415c9457e7b2) -- PATH reordering on macOS
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) -- onStartupFinished behavior
- [VS Code Extension Bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) -- esbuild native module handling
- [esbuild Native Module Issue #1051](https://github.com/evanw/esbuild/issues/1051) -- .node file support
- [Fish Shell PATH Documentation](https://fishshell.com/docs/current/cmds/fish_add_path.html) -- fish-specific PATH handling
