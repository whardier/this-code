# Technology Stack

**Project:** This Code (VS Code extension + Rust CLI launcher)
**Researched:** 2026-04-24

## Recommended Stack

### VS Code Extension (TypeScript)

| Technology            | Version        | Purpose                | Why                                                                                                                                                                                                                    |
| --------------------- | -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript            | ~5.7           | Extension language     | VS Code extensions are TypeScript by convention; strict mode required                                                                                                                                                  |
| @types/vscode         | ^1.75.0        | VS Code API types      | Pin to minimum supported engine version (1.75+), not latest, so type-checking reflects the real API surface                                                                                                            |
| @vscode/sqlite3       | ^5.1.12-vscode | SQLite database access | Microsoft-maintained fork with Node-API prebuilt binaries for all VS Code target platforms. Async API requires promisify wrapper but avoids all native module compilation issues. See "SQLite Library Decision" below. |
| esbuild               | ^0.28.0        | Bundling               | Official VS Code recommendation; fast, simple config, replaces webpack                                                                                                                                                 |
| @vscode/vsce          | ^3.9.0         | Packaging/publishing   | Official CLI for VSIX packaging and Marketplace publishing                                                                                                                                                             |
| @vscode/test-cli      | latest         | Test runner            | Official VS Code test CLI, provides `vscode-test` command                                                                                                                                                              |
| @vscode/test-electron | latest         | Test host              | Runs tests inside a real VS Code instance with full API access                                                                                                                                                         |

### Rust CLI Binary

| Technology         | Version      | Purpose               | Why                                                                                        |
| ------------------ | ------------ | --------------------- | ------------------------------------------------------------------------------------------ |
| Rust               | edition 2024 | Language edition      | Stable since Rust 1.85 (Feb 2025); matches periphore conventions                           |
| clap               | 4.6          | CLI argument parsing  | Derive API for declarative arg definitions; actively maintained, periphore-verified        |
| figment            | 0.10         | Configuration         | Hierarchical config merging (TOML + env vars); periphore-verified                          |
| rusqlite           | 0.39         | SQLite database reads | Synchronous, lightweight, perfect for CLI. No async runtime needed. Bundled SQLite 3.51.3. |
| rusqlite_migration | 2.4          | Schema migrations     | Works natively with rusqlite; const-friendly `Migrations::from_slice`                      |
| serde              | 1.0          | Serialization         | Required by figment and for JSON field handling (open_files array)                         |
| serde_json         | 1.0          | JSON parsing          | Deserialize open_files JSON array from SQLite                                              |
| tracing            | 0.1          | Structured logging    | Matches periphore conventions; better than log crate for structured output                 |
| tracing-subscriber | 0.3          | Log output            | Console subscriber with env-filter for RUST_LOG support                                    |
| directories        | 6.0          | Platform paths        | XDG-compliant paths for config/data dirs on macOS and Linux                                |
| thiserror          | 2.0          | Error types           | Derive-based error enums; matches periphore conventions                                    |
| anyhow             | 1.0          | Error propagation     | Top-level error handling in main(); matches periphore conventions                          |

### Build and CI Tooling

| Technology   | Version    | Purpose              | Why                                                          |
| ------------ | ---------- | -------------------- | ------------------------------------------------------------ |
| prek         | (existing) | Git hooks            | Already configured in project; commitizen + pre-commit hooks |
| commitizen   | v4.13.10   | Conventional commits | Already configured; matches periphore conventions            |
| cargo clippy | (bundled)  | Rust linting         | pedantic level, matching periphore workspace lints           |
| cargo fmt    | (bundled)  | Rust formatting      | Standard Rust formatting                                     |

## SQLite Library Decision: The Critical Stack Choice

This is the most important and complex stack decision. Both the extension and CLI must read/write the same SQLite database file. The challenges are:

1. VS Code extensions run on Electron, which has a different Node.js ABI than system Node.js
2. The CLI is a standalone Rust binary with no VS Code dependencies
3. Both processes may access the database concurrently (WAL mode required)

### Database Location: `~/.this-code/sessions.db`

Per the pitfalls analysis (PITFALLS.md), the database should live at a **fixed well-known path** rather than inside `globalStorageUri`. Rationale:

- `globalStorageUri` resolves to different paths depending on platform, VS Code profile, `--user-data-dir`, and whether the extension host is local or remote
- The Rust CLI cannot call VS Code APIs to discover `globalStorageUri`
- Profile scoping may fragment the database across profiles
- A fixed path (`~/.this-code/sessions.db`) is discoverable by both extension and CLI without any coordination mechanism

The extension will still use `context.globalStorageUri` for its own internal state but writes session records to the shared `~/.this-code/` directory.

### Extension-Side SQLite: `@vscode/sqlite3`

**Recommendation: `@vscode/sqlite3` v5.1.12-vscode** -- Microsoft's fork of node-sqlite3.

| Criterion              | @vscode/sqlite3                                                     | better-sqlite3                     | node-sqlite3-wasm | sql.js                                 |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------- | ----------------- | -------------------------------------- |
| ABI compatibility      | Node-API (stable across Node/Electron versions)                     | Requires Electron-specific rebuild | N/A (WASM)        | N/A (WASM)                             |
| Prebuilt binaries      | darwin-x64, darwin-arm64, linux-x64, linux-arm64, win-x64, win-ia32 | Not Electron-compatible            | N/A               | N/A                                    |
| API style              | Async (callback/promisify)                                          | Synchronous                        | Synchronous       | Synchronous                            |
| File persistence       | Native file I/O, WAL mode                                           | Native file I/O, WAL mode          | VFS emulation     | In-memory only (serialize/deserialize) |
| Maintained for VS Code | Yes (Microsoft)                                                     | No                                 | No                | No                                     |
| Weekly downloads       | ~230K                                                               | ~3.7M                              | ~2K               | ~500K                                  |
| Concurrent access      | Full WAL support                                                    | Full WAL support                   | Limited           | No                                     |
| Confidence             | HIGH                                                                | REJECTED                           | MEDIUM            | REJECTED                               |

**Why @vscode/sqlite3 over the alternatives:**

- **vs better-sqlite3:** better-sqlite3 has the best API (synchronous, clean), but **it does not work in VS Code extensions** without `electron-rebuild` per Electron version. This is documented across issues #385, #1194, and #1321 on the better-sqlite3 repo. The `NODE_MODULE_VERSION` mismatch is persistent and well-known. `@vscode/sqlite3` uses Node-API (N-API) which is ABI-stable across Node.js versions, eliminating this problem entirely.

- **vs node-sqlite3-wasm:** node-sqlite3-wasm has an appealing synchronous API and zero native dependencies. However, it has only ~2K weekly downloads, implements file persistence through a custom VFS layer (less battle-tested than native SQLite I/O), and WAL mode behavior through WASM VFS is not well-documented. For a project where database reliability is critical, the Microsoft-maintained native binding is more trustworthy.

- **vs sql.js:** sql.js operates in-memory only. Persistence requires serializing the entire database to disk. This breaks WAL mode (no concurrent access from CLI) and risks data loss on crash (in-memory data not yet flushed). Completely inappropriate for an append-only session log.

**The async API trade-off:** `@vscode/sqlite3` has an async callback API, not synchronous. This is less ergonomic than better-sqlite3 but manageable:

```typescript
import sqlite3 from "@vscode/sqlite3";
import { promisify } from "util";

// Wrap in promise-based API
class Database {
  private db: sqlite3.Database;

  constructor(path: string) {
    this.db = new sqlite3.Database(path);
  }

  run(sql: string, ...params: any[]): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  all<T>(sql: string, ...params: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }
}
```

This wrapper is ~20 lines and will be written once. The async nature aligns well with VS Code's event-driven architecture.

**Packaging requirement:** `@vscode/sqlite3` requires platform-specific VSIX packaging:

```bash
# Build platform-specific packages
npx @vscode/vsce package --target darwin-arm64
npx @vscode/vsce package --target darwin-x64
npx @vscode/vsce package --target linux-x64
npx @vscode/vsce package --target linux-arm64
```

This is more CI work but is the official approach for extensions with native modules. A GitHub Actions matrix build handles this.

### CLI-Side SQLite: `rusqlite` with `bundled` Feature

**Recommendation: `rusqlite` v0.39** -- the standard Rust SQLite binding.

- **Why rusqlite, not sqlx:** sqlx is async-first and requires a tokio runtime. For a CLI that reads a SQLite database, invokes `exec()`, and exits, async is pure overhead. rusqlite is synchronous, lightweight, and compiles faster (no tokio dependency tree).
- **`bundled` feature:** Statically links SQLite into the binary. No system SQLite dependency required. The bundled version (3.51.3) matches or exceeds the SQLite version in `@vscode/sqlite3`.
- **Read-only access:** CLI opens with `OpenFlags::SQLITE_OPEN_READ_WRITE` (needed for WAL `-shm` file access) but only performs SELECT queries.

## VS Code Extension Configuration

### package.json (Extension Manifest)

Required fields for Marketplace publishing:

```json
{
  "name": "this-code",
  "displayName": "This Code",
  "description": "Session tracking for VS Code launch context and open file manifests",
  "version": "0.1.0",
  "publisher": "whardier",
  "engines": {
    "vscode": "^1.75.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "extensionKind": ["workspace"],
  "contributes": {
    "configuration": {
      "title": "This Code",
      "properties": {}
    }
  }
}
```

Key decisions:

- **`engines.vscode: "^1.75.0"`** -- Minimum version for profile support and stable `globalStorageUri`
- **`activationEvents: ["onStartupFinished"]`** -- Activates after VS Code startup completes, not blocking startup. Essential since this extension tracks sessions passively
- **`main: "./dist/extension.js"`** -- Points to esbuild bundle output
- **`extensionKind: ["workspace"]`** -- Runs where the workspace is: local host for local workspaces, remote host for SSH/container. This ensures the extension sees workspace file events regardless of context. The trade-off (per PITFALLS.md Pitfall 1) is that the SQLite database will be on whichever machine hosts the workspace. Using `~/.this-code/sessions.db` mitigates this: each machine gets its own session database at the same well-known path.
- **No `contributes.commands`** -- This extension has no commands; it is config-only with an Output Channel

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Note: `noEmit: true` because esbuild handles transpilation. TypeScript compiler is used only for type-checking.

### esbuild Configuration

```javascript
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode", "@vscode/sqlite3"],
    logLevel: "warning",
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Key points:

- `external: ['vscode']` -- VS Code module provided at runtime by the host
- `external: ['@vscode/sqlite3']` -- Native module cannot be bundled by esbuild; must ship alongside as unbundled dependency

### VSIX Packaging

```bash
# Package with platform targeting (native module requires per-platform builds)
npx @vscode/vsce package --target darwin-arm64
npx @vscode/vsce package --target darwin-x64
npx @vscode/vsce package --target linux-x64
npx @vscode/vsce package --target linux-arm64

# Publish all platform packages
npx @vscode/vsce publish --packagePath \
  this-code-darwin-arm64-0.1.0.vsix \
  this-code-darwin-x64-0.1.0.vsix \
  this-code-linux-x64-0.1.0.vsix \
  this-code-linux-arm64-0.1.0.vsix
```

The `--target` flag tells vsce to build a platform-specific VSIX. VS Code 1.61+ automatically selects the matching platform package on install. A fallback universal package (without `--target`) can be published for unsupported platforms.

### .vscodeignore

```
.vscode/**
.vscode-test/**
src/**
out/**
node_modules/**
!node_modules/@vscode/sqlite3/**
*.ts
tsconfig.json
esbuild.js
.gitignore
```

Note: `node_modules/@vscode/sqlite3/` is explicitly NOT ignored because it contains the native binary that must ship with the VSIX. All other node_modules are excluded because esbuild bundles them.

## Rust CLI Configuration

### Cargo.toml

```toml
[package]
name = "this-code"
version = "0.1.0"
edition = "2024"
authors = ["Shane Spencer"]
license = "MIT"
repository = "https://github.com/whardier/this-code"
publish = false

[dependencies]
clap = { version = "4.6", features = ["derive"] }
figment = { version = "0.10", features = ["toml", "env"] }
rusqlite = { version = "0.39", features = ["bundled"] }
rusqlite_migration = "2.4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
directories = "6.0"
thiserror = "2.0"
anyhow = "1.0"

[lints.rust]
unsafe_code = "warn"
unreachable_pub = "warn"

[lints.clippy]
pedantic = { level = "warn", priority = -1 }
module_name_repetitions = "allow"
missing_errors_doc = "allow"
missing_panics_doc = "allow"
```

Key decisions:

- **`rusqlite` with `bundled` feature** -- Statically links SQLite; no system dependency required. Produces a self-contained binary.
- **Single crate, not a workspace** -- Per PROJECT.md, workspace overhead is not justified at v1.
- **Edition 2024** -- Matches periphore conventions; stable since Feb 2025.
- **Clippy pedantic with overrides** -- Matches periphore lint configuration exactly.
- **No tokio** -- This CLI is fully synchronous. No async runtime needed for reading a SQLite DB and exec'ing the real `code` binary.

### Shell Integration

The CLI needs shell integration scripts that users `source` to inject `this-code` into PATH. These are generated by `this-code init <shell>` or provided as static files:

**Bash/Zsh (sourced from ~/.bashrc or ~/.zshrc):**

```bash
export WHICH_CODE_HOME="${WHICH_CODE_HOME:-$HOME/.this-code}"
case ":${PATH}:" in
  *":${WHICH_CODE_HOME}/bin:"*) ;;
  *) export PATH="${WHICH_CODE_HOME}/bin:${PATH}" ;;
esac
```

**Fish (sourced from ~/.config/fish/conf.d/this-code.fish):**

```fish
set -gx WHICH_CODE_HOME "$HOME/.this-code"
if not contains "$WHICH_CODE_HOME/bin" $PATH
    fish_add_path --prepend "$WHICH_CODE_HOME/bin"
end
```

**Critical macOS note:** PATH must be set in `~/.zshrc` (not `~/.zshenv`) because macOS `path_helper` in `/etc/zprofile` reorders PATH entries set before it runs. `~/.zshrc` runs after `path_helper`.

## Shared SQLite Schema

Both the extension and CLI must agree on the database schema. The schema lives as a migration in both codebases (TypeScript and Rust). The extension creates the database; the CLI reads it.

```sql
-- Enable WAL mode for concurrent read access from CLI
PRAGMA journal_mode=WAL;

-- Track schema version
PRAGMA user_version = 1;

-- Single table: append-only invocation log
CREATE TABLE IF NOT EXISTS invocations (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    invoked_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
    workspace_path     TEXT,
    user_data_dir      TEXT,
    profile            TEXT,
    local_ide_path     TEXT    NOT NULL,
    remote_name        TEXT,
    remote_server_path TEXT,
    open_files         TEXT    NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_invocations_workspace
    ON invocations(workspace_path);

CREATE INDEX IF NOT EXISTS idx_invocations_time
    ON invocations(invoked_at DESC);
```

Schema notes:

- `open_files` stores a JSON array, updated in-place as documents open/close
- `invoked_at` uses ISO 8601 with milliseconds for precise ordering
- `remote_name` captures `vscode.env.remoteName` (e.g., `"ssh-remote"`, `"dev-container"`, `undefined` for local)
- WAL mode is set once on database creation; benefits both writer (extension) and reader (CLI)
- `PRAGMA user_version` tracks schema version for migrations

## Alternatives Considered

| Category          | Recommended              | Alternative       | Why Not                                                                                                                                     |
| ----------------- | ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension SQLite  | @vscode/sqlite3          | better-sqlite3    | Electron ABI mismatch; native module requires rebuild per Electron version; well-documented failure mode                                    |
| Extension SQLite  | @vscode/sqlite3          | node-sqlite3-wasm | Only ~2K weekly downloads; VFS-based file persistence less proven than native I/O; WAL behavior undocumented                                |
| Extension SQLite  | @vscode/sqlite3          | sql.js            | In-memory only; no WAL support; serialize/deserialize entire DB breaks concurrent access                                                    |
| Extension bundler | esbuild                  | webpack           | esbuild is simpler, faster, officially recommended by VS Code docs                                                                          |
| DB location       | ~/.this-code/sessions.db | globalStorageUri  | globalStorageUri varies by platform/profile/user-data-dir; CLI cannot discover it without VS Code APIs; remote host writes to wrong machine |
| Rust SQLite       | rusqlite                 | sqlx              | sqlx is async-first, requires tokio runtime; overkill for a synchronous CLI                                                                 |
| Rust SQLite       | rusqlite                 | diesel            | ORM overhead unnecessary; raw SQL is fine for 1-2 simple queries                                                                            |
| Rust config       | figment                  | config-rs         | Periphore standardized on figment; hierarchical merging is cleaner                                                                          |
| Rust errors       | thiserror + anyhow       | eyre              | Periphore standardized on thiserror + anyhow                                                                                                |
| Rust logging      | tracing                  | log + env_logger  | tracing is the modern standard; structured; periphore convention                                                                            |
| Activation event  | onStartupFinished        | "\*"              | "\*" blocks VS Code startup; onStartupFinished fires after UI is ready                                                                      |

## Installation Commands

### Extension Development

```bash
# Core dependencies
npm install @vscode/sqlite3

# Dev dependencies
npm install -D typescript @types/vscode esbuild @vscode/vsce @vscode/test-cli @vscode/test-electron
```

### Rust CLI Development

```bash
# Initialize (single binary crate, not workspace)
cargo init --name this-code

# Build
cargo build --release

# Install locally for testing
cargo install --path .
```

## Database Path Discovery

The extension and CLI must agree on the database location. The strategy uses figment's hierarchical config merging:

**Extension (writer):**

1. On activation, ensures `~/.this-code/` directory exists
2. Opens/creates `~/.this-code/sessions.db`
3. Writes session records there

**CLI (reader):**

1. `WHICH_CODE_DB` env var (explicit override for testing)
2. `~/.this-code/config.toml` with `db_path = "..."` (figment reads this)
3. Default: `~/.this-code/sessions.db` (convention)

This matches figment's merge semantics: env vars override config file, which overrides defaults.

## Sources

### VS Code Extension

- [VS Code Bundling Extensions (esbuild)](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) -- Official esbuild configuration guide
- [VS Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest) -- Required package.json fields
- [VS Code Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) -- vsce packaging with --target and --no-dependencies
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) -- onStartupFinished vs "\*"
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension) -- @vscode/test-cli and @vscode/test-electron
- [VS Code SQLite Discussion](https://github.com/microsoft/vscode-discussions/discussions/16) -- Community recommendations for SQLite in extensions
- [Native Modules in Extensions Discussion](https://github.com/microsoft/vscode-discussions/discussions/768) -- No officially supported path for native modules
- [better-sqlite3 Electron Issue #1321](https://github.com/WiseLibs/better-sqlite3/issues/1321) -- Documented incompatibility with VS Code/Electron
- [@vscode/sqlite3 npm](https://www.npmjs.com/package/@vscode/sqlite3) -- v5.1.12-vscode, Node-API prebuilt binaries
- [microsoft/vscode-node-sqlite3 GitHub](https://github.com/microsoft/vscode-node-sqlite3) -- Source repo, actively maintained (Jan 2026)

### Rust CLI

- [rusqlite on crates.io](https://crates.io/crates/rusqlite) -- v0.39.0, bundled SQLite 3.51.3
- [clap on crates.io](https://crates.io/crates/clap) -- v4.6.x with derive feature
- [figment on crates.io](https://crates.io/crates/figment) -- v0.10.19, TOML + env providers
- [rusqlite_migration](https://crates.io/crates/rusqlite_migration) -- v2.4.1, schema migration for rusqlite
- [Rust 2024 Edition](https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/) -- Stable since Rust 1.85 (Feb 2025)
- [Rust ORMs Comparison 2026](https://aarambhdevhub.medium.com/rust-orms-in-2026-diesel-vs-sqlx-vs-seaorm-vs-rusqlite-which-one-should-you-actually-use-706d0fe912f3) -- Confirms rusqlite as best for sync CLI

### Reference Project

- Periphore (`../periphore/`) -- Rust conventions reference: clap 4.6, figment 0.10, edition 2024, tracing, thiserror, anyhow, clippy pedantic
