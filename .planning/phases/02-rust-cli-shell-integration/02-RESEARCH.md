# Phase 2: Rust CLI + Shell Integration - Research

**Researched:** 2026-04-27
**Domain:** Rust CLI binary — clap derive, figment config, PATH shim, shell integration, process exec
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `this-code install` creates two artifacts and prints usage instructions:
  1. `~/.this-code/env` — a POSIX `/bin/sh` script (like `~/.cargo/env`) that prepends `~/.this-code/bin` to PATH using the case-colon guard pattern. Users add `. "$HOME/.this-code/env"` to their `~/.bashrc` or `~/.zshrc` manually.
  2. `~/.this-code/bin/code` — a symlink pointing to `~/.this-code/bin/this-code`. The shim is invoked as `code` once PATH is set.
  The command does NOT modify the user's shell rc files; it only creates the artifacts and prints the source-line instruction.
- **D-02:** `this-code install --fish` creates `~/.config/fish/conf.d/this-code.fish` directly (fish's conf.d is designed for tool-dropped files; fish auto-sources it). Contents: `fish_add_path --prepend "$HOME/.this-code/bin"`.
- **D-03:** The `this-code init <shell>` subcommand design from REQUIREMENTS.md SHELL-01 is **superseded** by the `install` + flags approach. Interface: `this-code install` (bash/zsh) and `this-code install --fish`. No separate `init` subcommands.
- **D-04:** Discovery order: `THIS_CODE_CODE_PATH` env var → `code_path` in `~/.this-code/config.toml` → PATH stripping + `which` crate (pure Rust, no shelling out).
- **D-05:** Recursion guard: if `THIS_CODE_ACTIVE=1` is set, exec real binary immediately via D-04 discovery, skip guard logic.
- **D-06:** Phase 2 shim is pure pass-through — no DB reads or writes.
- **D-07:** figment config with single key `code_path` (optional string); `db_path` deferred to Phase 3.
- **THIS_CODE_HOME:** env var name for `~/.this-code/` in shell scripts (STACK.md uses old `WHICH_CODE_HOME` — authoritative name is `THIS_CODE_HOME`).

### Claude's Discretion

- Exact format of usage output printed by `this-code install` (what instructions to display, whether to include the `. "$HOME/.this-code/env"` line verbatim)
- Whether `this-code install` is idempotent (safe to re-run — it should be, overwriting env file and symlink)
- Error handling when the real `code` binary cannot be found (exit code, error message format)
- Clap subcommand structure (whether `install` is a subcommand or a flag on the root command)
- tracing/logging verbosity for the shim's pass-through path

### Deferred Ideas (OUT OF SCOPE)

- `db_path` config key in `~/.this-code/config.toml` — Phase 3 (when CLI reads the DB)
- `this-code install --modify-rc` flag (auto-appending to `~/.zshrc`/`~/.bashrc`) — possible future convenience, not needed for v1
- `this-code uninstall` — remove env file + symlink; deferred until packaging phase
- Windows PATH integration (`%USERPROFILE%\.this-code\bin` + PowerShell profile) — PLAT-02 best-effort; defer specifics to Phase 4
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | CLI command name is `this-code`; also installable as `code` shim via symlink | D-01 symlink pattern; `std::os::unix::fs::symlink` API verified |
| CLI-02 | CLI is a single Rust binary using clap 4.6 + figment 0.10 + rusqlite 0.39 (bundled) | Cargo.toml template in Standard Stack; all versions verified against crates.io |
| CLI-03 | CLI intercepts `code` command when placed leftmost in PATH | D-01 symlink + D-04 discovery; pyenv shim pattern |
| CLI-04 | CLI self-detects recursive invocation (env var guard + PATH stripping) | D-05; `THIS_CODE_ACTIVE` guard; PATH stripping code pattern documented |
| CLI-05 | CLI finds real `code` binary by removing its own dir from PATH and using `which` | D-04; `which::which_in` API verified; `which_in_all` for dedup |
| CLI-06 | CLI installs into `~/.this-code/bin/` to avoid PATH pollution | D-01; `directories::BaseDirs::home_dir()` for path construction |
| SHELL-01 | (Superseded by D-03) `install` + `--fish` flag replaces `init <shell>` subcommands | D-03 locked decision |
| SHELL-02 | Shell integration adds `~/.this-code/bin/` to leftmost PATH position | `~/.this-code/env` with case-colon guard; fish `fish_add_path --prepend` |
| SHELL-03 | Shell integration for zsh sets PATH in `~/.zshrc` (not `~/.zshenv`) to run after macOS `path_helper` | Pitfall 5 documentation; user manual instruction via `install` output |
| SHELL-04 | Shell integration for fish uses `fish_add_path` (not `eval`) | D-02; Pitfall 6; fish conf.d pattern |
| PLAT-02 | Windows support is best-effort | `Command::status()` + `process::exit()` pattern; no exec() on Windows |
</phase_requirements>

---

## Summary

Phase 2 builds the Rust CLI binary (`this-code`) from scratch. It is a greenfield crate at `cli/` inside the repo. The binary serves two roles simultaneously: a named tool (`this-code install`, `this-code --help`) and a PATH shim (`code .` when symlinked). The implementation follows the pyenv/rbenv/mise shim pattern, which is thoroughly documented in the existing PITFALLS.md and SUMMARY.md. All locked decisions (D-01 through D-07) are consistent with the research findings; no decisions need re-examination.

The key technical findings from this research are:

1. **`which` crate is at v8.0.2** (not v7 as stated in the prompt's Cargo.toml dependency). The `which_in` function signature uses `Option<U>` for the paths parameter. Update Cargo.toml to `which = "8"`.
2. **figment `Env::prefixed("THIS_CODE_")` without `.split("_")`** maps `THIS_CODE_CODE_PATH` directly to `code_path` (lowercased, no nesting). Do NOT add `.split("_")` or the key becomes `code.path` (nested), which would not deserialize into a flat struct field.
3. **`Toml::file()` silently returns empty data when the config file does not exist** (default `required = false`). The `~/.this-code/config.toml` file is optional — no special error handling needed for first-run.
4. **`CommandExt::exec()` (Unix) never returns on success**; on Windows there is no exec equivalent — use `Command::status()` + `process::exit(status.code().unwrap_or(1))`.
5. **Windows symlinks require admin or Developer Mode** — `std::os::windows::fs::symlink_file` will fail without privilege. PLAT-02 best-effort means: attempt symlink creation, fall back with a clear error message.

**Primary recommendation:** Implement the shim's pass-through path in a platform-split way: `#[cfg(unix)]` uses `CommandExt::exec()` to replace the process, `#[cfg(windows)]` uses `Command::status()` + `process::exit()`. All other logic (figment config, `which_in`, symlink creation) is shared.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLI argument parsing (`install`, `--fish`, `--help`, `--version`) | CLI binary | — | clap derive handles this entirely |
| Config reading (`~/.this-code/config.toml` + env vars) | CLI binary | — | figment runs in the CLI process; no other tier involved |
| PATH stripping + real `code` discovery | CLI binary | — | pure-Rust `which::which_in`; no shell or OS delegation |
| Recursion guard (`THIS_CODE_ACTIVE`) | CLI binary | — | env var read/write within the same CLI process |
| Process replacement (`exec`) | OS / kernel | CLI binary | `execvp` system call on Unix; `CreateProcess`+wait on Windows |
| Shell env file (`~/.this-code/env`) | CLI binary (writes) | User shell (sources) | CLI creates the file once; shell sources it on each login |
| Fish conf.d file | CLI binary (writes) | Fish shell (auto-sources) | CLI drops file; fish auto-sources conf.d on startup |
| Symlink creation (`~/.this-code/bin/code`) | CLI binary | OS FS | `std::os::unix::fs::symlink`; requires privilege on Windows |
| Directory creation (`~/.this-code/bin/`) | CLI binary | — | `std::fs::create_dir_all` |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| clap | 4.6.1 | CLI argument parsing | Derive API; periphore-verified; project constraint |
| figment | 0.10.19 | Hierarchical config (TOML + env) | Periphore-verified; merge semantics match D-04/D-07 |
| which | 8.0.2 | Pure-Rust PATH search | No system `which` dependency; cross-platform; `which_in` for custom PATH |
| serde | 1.0 | Config struct deserialization | Required by figment |
| tracing | 0.1 | Structured logging | Periphore convention |
| tracing-subscriber | 0.3 | Log output with env-filter | Periphore convention; `RUST_LOG` support |
| thiserror | 2.0 | Error type definitions | Periphore convention |
| anyhow | 1.0 | Top-level error propagation | Periphore convention |
| rusqlite | 0.39 | SQLite (included per CLI-02, unused Phase 2) | Required in final binary even before use in Phase 3 |
| serde_json | 1.0 | JSON (included per CLI-02, unused Phase 2) | Required in final binary even before use in Phase 3 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| directories | 6.0 | Platform-aware home/config dir paths | Use `BaseDirs::new()?.home_dir()` instead of raw `$HOME` env var parsing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `which` crate | system `which` shell command | System `which` is not portable (not on Windows, behavior varies); shelling out creates a child process that complicates exec flow |
| `directories` crate | `std::env::var("HOME")` | `$HOME` may be unset in some environments; `directories` handles `getpwuid_r` fallback on Unix |
| `CommandExt::exec()` | `Command::spawn()` + wait | `exec()` replaces the process (no zombie parent); `spawn()` leaves the shim as a parent process, which can confuse process managers and job control |

**Version verification:**

```
which: 8.0.2 (verified 2026-04-27 via cargo search — prompt Cargo.toml said "7", actual latest is 8.0.2)
figment: 0.10.19 (verified 2026-04-27 via crates.io API)
clap: 4.6.1 (verified 2026-04-27 via crates.io API)
rusqlite: 0.39 (from STACK.md, crates.io-verified at time of Phase 1 research)
```

**Installation (Cargo.toml `[dependencies]`):**

```toml
clap = { version = "4.6", features = ["derive"] }
figment = { version = "0.10", features = ["toml", "env"] }
which = "8"
serde = { version = "1.0", features = ["derive"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
thiserror = "2.0"
anyhow = "1.0"
rusqlite = { version = "0.39", features = ["bundled"] }
serde_json = "1.0"
```

**CRITICAL version correction:** The phase prompt shows `which = "7"` in the Cargo.toml template. The actual latest release is **8.0.2**. The v8 breaking change is the addition of a `Sys` trait generics parameter to `WhichConfig`; top-level functions `which_in`, `which_in_all`, and `which_all` are unaffected. Use `which = "8"` in Cargo.toml. [VERIFIED: cargo search 2026-04-27]

---

## Architecture Patterns

### System Architecture Diagram

```
User types: code .
    |
    v
~/.this-code/bin/code (symlink → this-code binary)
    |
    v
[THIS_CODE_ACTIVE set?] --yes--> D-04 discovery → exec real code
    |
    no
    v
[figment config load]
  Env::prefixed("THIS_CODE_") → overrides
  Toml::file("~/.this-code/config.toml") → file config (silent if missing)
    |
    v
[D-04 discovery: THIS_CODE_CODE_PATH → config.code_path → PATH strip + which_in]
    |
    v
[set THIS_CODE_ACTIVE=1 in child env]
    |
    v
[Unix] exec(real_code_path, original_args)   [never returns]
[Windows] Command::status() → process::exit(code)

Separately, user runs: this-code install
    |
    v
create_dir_all("~/.this-code/bin/")
write("~/.this-code/env", POSIX sh content)
symlink("~/.this-code/bin/this-code", "~/.this-code/bin/code")
print usage instructions

  or: this-code install --fish
    |
    v
create_dir_all("~/.config/fish/conf.d/")
write("~/.config/fish/conf.d/this-code.fish", fish content)
symlink (same as above)
print usage instructions
```

### Recommended Project Structure

```
cli/
├── Cargo.toml           # single-crate (not workspace), name = "this-code", edition = "2024"
└── src/
    ├── main.rs          # entry point: parse args, dispatch to subcommand or shim
    ├── cli.rs           # clap Cli + Commands enum (install subcommand)
    ├── config.rs        # Config struct + figment loading (code_path: Option<String>)
    ├── discover.rs      # real code binary discovery: D-04 logic, PATH stripping, which_in
    ├── install.rs       # install subcommand: env file, symlink, fish conf.d
    └── error.rs         # thiserror error enum (ThisCodeError)
```

### Pattern 1: Clap Derive Structure (Optional Subcommand)

The binary runs in two modes: subcommand mode (when the user runs `this-code install`) and shim mode (when invoked as `code` with no recognized subcommand). Use `Option<Commands>` so the root command handles the pass-through when no subcommand matches.

```rust
// Source: docs.rs/clap/4.6.1 derive tutorial
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "this-code", version, about = "VS Code session tracker and launch interceptor")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Install this-code shell integration (bash/zsh env file + code symlink)
    Install {
        /// Also write ~/.config/fish/conf.d/this-code.fish
        #[arg(long)]
        fish: bool,
    },
}
```

**Shim invocation detection:** When `argv[0]` is `code` (the symlink name), the binary should behave as a pure shim regardless of `cli.command`. Check `std::env::args().next()` or `std::env::current_exe()` to detect invocation name.

```rust
// Detect invocation name for shim mode
let invoked_as_code = std::env::current_exe()
    .ok()
    .and_then(|p| p.file_name().map(|n| n == "code"))
    .unwrap_or(false);
```

### Pattern 2: figment Config Loading

```rust
// Source: docs.rs/figment/0.10.19
use figment::{Figment, providers::{Format, Toml, Env}};
use serde::Deserialize;

#[derive(Deserialize, Default)]
pub struct Config {
    pub code_path: Option<String>,
    // db_path deferred to Phase 3
}

pub fn load_config(home: &Path) -> anyhow::Result<Config> {
    let config_path = home.join(".this-code/config.toml");
    let config: Config = Figment::new()
        // Toml::file() silently returns empty data when file is absent (required=false by default)
        .merge(Toml::file(&config_path))
        // Env::prefixed("THIS_CODE_") WITHOUT .split("_"):
        //   THIS_CODE_CODE_PATH → lowercased to "code_path" → matches Config.code_path
        // DO NOT add .split("_") — that would create nested key "code.path" which does NOT match
        .merge(Env::prefixed("THIS_CODE_"))
        .extract()
        .unwrap_or_default();
    Ok(config)
}
```

**CRITICAL figment key mapping detail:** `Env::prefixed("THIS_CODE_")` strips the prefix and lowercases. `THIS_CODE_CODE_PATH` → strip prefix → `CODE_PATH` → lowercase → `code_path`. This matches the flat struct field `code_path` directly. If `.split("_")` were added, the key would become `code.path` (dotted nested path), which would NOT deserialize into `code_path`. [VERIFIED: docs.rs/figment/latest]

### Pattern 3: D-04 Binary Discovery with PATH Stripping

```rust
// Source: docs.rs/which/8.0.2
use std::path::{Path, PathBuf};
use which::which_in;

/// Remove own bin dir from PATH before searching for the real `code` binary.
fn strip_own_dir_from_path(path_env: &str, own_bin: &Path) -> String {
    std::env::split_paths(path_env)
        .filter(|p| p != own_bin)
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(":")
}

pub fn discover_real_code(config: &Config, own_bin: &Path) -> anyhow::Result<PathBuf> {
    // Step 1: explicit env var override
    if let Ok(path) = std::env::var("THIS_CODE_CODE_PATH") {
        return Ok(PathBuf::from(path));
    }

    // Step 2: config file override
    if let Some(ref path) = config.code_path {
        return Ok(PathBuf::from(path));
    }

    // Step 3: PATH stripping + which_in
    let path_env = std::env::var("PATH").unwrap_or_default();
    let stripped = strip_own_dir_from_path(&path_env, own_bin);
    let cwd = std::env::current_dir()?;

    // which_in signature: which_in<T, U, V>(binary_name: T, paths: Option<U>, cwd: V)
    // where T: AsRef<OsStr>, U: AsRef<OsStr>, V: AsRef<Path>
    which_in("code", Some(stripped.as_str()), &cwd)
        .map_err(|e| anyhow::anyhow!("Cannot find real `code` binary: {e}"))
}
```

### Pattern 4: Process Replacement (exec / Windows fallback)

```rust
// Source: doc.rust-lang.org/std/os/unix/process/trait.CommandExt.html
use std::process::Command;

#[cfg(unix)]
pub fn exec_real_code(real_code: &Path, args: &[String]) -> anyhow::Error {
    use std::os::unix::process::CommandExt;
    // exec() replaces the current process — never returns on success
    // Returns std::io::Error only on failure
    let err = Command::new(real_code)
        .args(args)
        .env("THIS_CODE_ACTIVE", "1")
        .exec();
    // Only reached if exec() failed
    anyhow::anyhow!("exec failed: {err}")
}

#[cfg(windows)]
pub fn exec_real_code(real_code: &Path, args: &[String]) -> anyhow::Result<()> {
    // No exec() on Windows — spawn child and propagate exit code
    let status = Command::new(real_code)
        .args(args)
        .env("THIS_CODE_ACTIVE", "1")
        .status()?;
    std::process::exit(status.code().unwrap_or(1));
}
```

**Note:** `CommandExt::exec()` inherits stdio from the parent process by default. Signal handling (Ctrl+C) works naturally on Unix because the new process inherits the terminal. On Windows, the child process inherits the console; signals are handled at the console level. [VERIFIED: doc.rust-lang.org]

### Pattern 5: Symlink Creation (Idempotent)

```rust
// Source: doc.rust-lang.org/std/os/unix/fs/fn.symlink.html
use std::path::Path;

#[cfg(unix)]
pub fn create_code_symlink(this_code_bin: &Path) -> anyhow::Result<()> {
    // std::os::unix::fs::symlink(original, link)
    // original = what the link points to (this-code binary path or just "this-code" relative)
    // link = the symlink file to create
    let symlink_path = this_code_bin.join("code");
    let target = Path::new("this-code");  // relative: code → this-code, both in same dir

    // Idempotency: remove existing symlink before recreating
    if symlink_path.exists() || symlink_path.symlink_metadata().is_ok() {
        std::fs::remove_file(&symlink_path)?;
    }

    std::os::unix::fs::symlink(target, &symlink_path)?;
    Ok(())
}

#[cfg(windows)]
pub fn create_code_symlink(this_code_bin: &Path) -> anyhow::Result<()> {
    let symlink_path = this_code_bin.join("code.exe");
    let target = this_code_bin.join("this-code.exe");

    // Windows symlinks require admin or Developer Mode
    // Use symlink_file (not symlink_dir) for executables
    if let Err(e) = std::os::windows::fs::symlink_file(&target, &symlink_path) {
        anyhow::bail!(
            "Cannot create symlink on Windows (requires Developer Mode or admin): {e}\n\
             Alternative: copy the binary manually."
        );
    }
    Ok(())
}
```

**Symlink parameter order caution:** `symlink(original, link)` — the first argument is the TARGET (what the link points to), the second is the LINK PATH (the new name). This is the opposite of `ln -s TARGET LINK`. [VERIFIED: doc.rust-lang.org]

### Pattern 6: Recursion Guard

```rust
pub fn check_recursion_guard() -> bool {
    std::env::var("THIS_CODE_ACTIVE").map(|v| v == "1").unwrap_or(false)
}

// In main shim path:
if check_recursion_guard() {
    // Fast path: already inside a shim invocation, just pass through
    let real_code = discover_real_code(&config, &own_bin)?;
    // Skip setting THIS_CODE_ACTIVE again — already set
    return exec_real_code(&real_code, &args_to_forward);
}
```

**Note:** When recursion guard fires, `THIS_CODE_ACTIVE` is already `1` in the environment. The child process inherits it. No need to explicitly set it again in the `exec` call for the fast-path case — but setting it again (idempotent) causes no harm. [ASSUMED — consistent with D-05 semantics]

### Pattern 7: Shell Artifact Content

**`~/.this-code/env` (POSIX sh):**

```sh
#!/bin/sh
# This file is sourced by ~/.bashrc or ~/.zshrc to add this-code to PATH
# Add: . "$HOME/.this-code/env"

THIS_CODE_HOME="${THIS_CODE_HOME:-$HOME/.this-code}"
case ":${PATH}:" in
  *":${THIS_CODE_HOME}/bin:"*) ;;
  *) export PATH="${THIS_CODE_HOME}/bin:${PATH}" ;;
esac
```

**`~/.config/fish/conf.d/this-code.fish`:**

```fish
fish_add_path --prepend "$HOME/.this-code/bin"
```

**`this-code install` output (print to stdout):**

```
this-code installed to ~/.this-code/bin/

To activate, add the following line to ~/.bashrc or ~/.zshrc:

    . "$HOME/.this-code/env"

Then restart your shell or run:

    . "$HOME/.this-code/env"
```

### Anti-Patterns to Avoid

- **Using `.split("_")` with figment Env provider:** `Env::prefixed("THIS_CODE_").split("_")` maps `THIS_CODE_CODE_PATH` to nested key `code.path`, NOT flat `code_path`. The struct field `code_path` would never be populated. Omit `.split()`.
- **Opening `which_in` with `None` paths:** Calling `which_in("code", None::<&str>, cwd)` uses the actual `PATH` env var, not the stripped version. Always pass `Some(stripped_path)`.
- **Using `std::env::var("HOME")` directly:** `$HOME` may be unset in cron/systemd contexts. Use `directories::BaseDirs::new()?.home_dir()` which falls back to `getpwuid_r`.
- **Creating symlink without removing old one:** `std::os::unix::fs::symlink` fails with `EEXIST` if the symlink already exists. Always check and remove before recreating (idempotency).
- **Calling `exec()` on Windows:** `CommandExt::exec()` is Unix-only (`#[cfg(unix)]`). Windows code must use `Command::status()` + `process::exit()`.
- **Setting PATH in `~/.zshenv` instead of `~/.zshrc`:** macOS `path_helper` in `/etc/zprofile` reorders PATH entries set in `~/.zshenv`. The `~/.this-code/env` file must be sourced from `~/.zshrc` (or `~/.bashrc`). The install output instructions must say `~/.zshrc`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PATH binary search | Custom PATH traversal loop | `which::which_in` | Handles non-UTF8 paths, executable bit checks, symlink resolution across platforms |
| Home directory lookup | `std::env::var("HOME")` parsing | `directories::BaseDirs::new()?.home_dir()` | Handles `$HOME` unset via `getpwuid_r` on Unix; correct on Windows/macOS |
| CLI argument parsing | Hand-rolled arg parsing | clap 4.6 derive | Subcommands, help, version, validation — all standard; derive API is zero-boilerplate |
| Config merging (env + file) | Manual `if env_var { ... } else { read_file }` | figment | Handles missing files gracefully, type-safe deserialization, merge ordering |
| Case-colon PATH guard | Custom shell string manipulation | The documented POSIX pattern (already in D-01) | Correct POSIX is subtle; the pattern in CONTEXT.md is the reference implementation |

**Key insight:** The PATH shim pattern is battle-tested by pyenv, rbenv, and mise. All three use the same combination of env var guard + PATH stripping + binary exec. Following this pattern exactly is safer than inventing a novel approach.

---

## Common Pitfalls

### Pitfall 1: `which = "7"` in Cargo.toml (Version Staleness)
**What goes wrong:** The Cargo.toml template in the phase prompt specifies `which = "7"`. The current crates.io release is 8.0.2. Using version 7 works but misses v8 improvements including reduced compile time (removed `rustix` and `winsafe` dependencies). The v8 breaking changes only affect `WhichConfig` generics, not the top-level `which_in` / `which_all` functions used in this phase.
**How to avoid:** Use `which = "8"` in Cargo.toml.
[VERIFIED: cargo search 2026-04-27]

### Pitfall 2: figment `.split("_")` Creates Nested Key
**What goes wrong:** `Env::prefixed("THIS_CODE_").split("_")` converts `THIS_CODE_CODE_PATH` (after prefix stripping: `CODE_PATH`) to the nested key `code.path`. The `Config` struct has a flat field `code_path`, which does not match `code.path`. The env var is silently ignored and `config.code_path` stays `None`. Discovery falls through to PATH stripping even when `THIS_CODE_CODE_PATH` is set.
**Why it happens:** figment's `.split("_")` replaces underscores with dots for nested table access. `CODE_PATH` → `code.path` creates a nested table `{code: {path: ...}}` not `{code_path: ...}`.
**How to avoid:** Do NOT call `.split("_")`. Use `Env::prefixed("THIS_CODE_")` alone. The default lowercasing transforms `CODE_PATH` → `code_path`, which matches the flat field.
[VERIFIED: docs.rs/figment/0.10.19]

### Pitfall 3: `symlink(original, link)` Parameter Order
**What goes wrong:** `std::os::unix::fs::symlink(link, original)` — arguments reversed — creates a symlink pointing back at the link itself (circular), or fails with a confusing path error.
**How to avoid:** `symlink(original, link)` — "the target comes first". Think of it as "create link that points to original". `symlink("this-code", "code")` — `code` → `this-code`. Both in the same directory so a relative path works.
[VERIFIED: doc.rust-lang.org/std/os/unix/fs/fn.symlink.html]

### Pitfall 4: `exec()` Returns `std::io::Error`, Not `anyhow::Error`
**What goes wrong:** `Command::new(...).exec()` returns `std::io::Error` directly (not a `Result`). It always returns (on failure only). Handling it as a `Result` or using `?` directly does not compile.
**How to avoid:** Assign the return value: `let err = cmd.exec();`. Then convert: `anyhow::Error::from(err)` or `anyhow::anyhow!("exec failed: {err}")`. Never write `cmd.exec()?;` — exec does not return `Result`.
[VERIFIED: doc.rust-lang.org/std/os/unix/process/trait.CommandExt.html]

### Pitfall 5: Windows Symlink Requires Elevated Privilege
**What goes wrong:** `std::os::windows::fs::symlink_file` fails with `Access is denied` on standard Windows user accounts. Unlike Unix, Windows symlinks require either admin privilege or Developer Mode enabled.
**How to avoid:** For PLAT-02 best-effort: attempt symlink creation, catch the error, print a clear message explaining Developer Mode or the manual copy alternative. Do not silently fail.
[VERIFIED: WebSearch 2026-04-27; docs.rust-lang.org/std/os/windows/fs/fn.symlink_file.html]

### Pitfall 6: `THIS_CODE_ACTIVE` Env Var Must Propagate to Child on Pass-Through
**What goes wrong:** The env var guard set on the `Command` object must be set BEFORE `exec()`. On Unix, `CommandExt::exec()` calls `execvp` directly — the env set on the `Command` builder is passed to the new process. If the shim sets `THIS_CODE_ACTIVE` in its own env (`std::env::set_var`) instead of on the `Command`, the child may not inherit it correctly in all cases.
**How to avoid:** Use `.env("THIS_CODE_ACTIVE", "1")` on the `Command` builder, not `std::env::set_var`. The builder applies it to the child's environment.
[ASSUMED — consistent with Rust process documentation]

### Pitfall 7: `BaseDirs::new()` Returns `Option`, Not Result
**What goes wrong:** `BaseDirs::new()` returns `Option<BaseDirs>` (not `Result`). Using `.unwrap()` panics if the home directory cannot be determined (rare but possible in containers or CI).
**How to avoid:** Use `BaseDirs::new().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))? ` or a named error variant.
[VERIFIED: docs.rs/directories/latest/directories/struct.BaseDirs.html]

---

## Code Examples

### Complete Config Load Pattern

```rust
// Source: docs.rs/figment/0.10.19 — Env::prefixed without split
use figment::{Figment, providers::{Format, Toml, Env}};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Default)]
pub struct Config {
    pub code_path: Option<String>,
}

pub fn load_config(home: &Path) -> Config {
    let config_path = home.join(".this-code/config.toml");
    Figment::new()
        .merge(Toml::file(&config_path))          // silent if missing
        .merge(Env::prefixed("THIS_CODE_"))        // THIS_CODE_CODE_PATH → code_path
        .extract()
        .unwrap_or_default()
}
```

### Complete Discovery Chain

```rust
// Source: docs.rs/which/8.0.2 — which_in signature
// pub fn which_in<T, U, V>(binary_name: T, paths: Option<U>, cwd: V) -> Result<PathBuf>
// where T: AsRef<OsStr>, U: AsRef<OsStr>, V: AsRef<Path>
use std::path::{Path, PathBuf};

pub fn discover_real_code(config: &Config, own_bin_dir: &Path) -> anyhow::Result<PathBuf> {
    if let Ok(v) = std::env::var("THIS_CODE_CODE_PATH") {
        return Ok(PathBuf::from(v));
    }
    if let Some(ref p) = config.code_path {
        return Ok(PathBuf::from(p));
    }
    let path_env = std::env::var("PATH").unwrap_or_default();
    let stripped: String = std::env::split_paths(&path_env)
        .filter(|p| p.as_path() != own_bin_dir)
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(":");
    let cwd = std::env::current_dir()?;
    which::which_in("code", Some(stripped.as_str()), &cwd)
        .map_err(|_| anyhow::anyhow!("Cannot locate real `code` binary. Set THIS_CODE_CODE_PATH or add code_path to ~/.this-code/config.toml"))
}
```

### Install Subcommand Skeleton

```rust
// Source: std::os::unix::fs::symlink docs
use directories::BaseDirs;
use std::path::Path;

pub fn run_install(fish: bool) -> anyhow::Result<()> {
    let base = BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
    let home = base.home_dir();

    let bin_dir = home.join(".this-code/bin");
    std::fs::create_dir_all(&bin_dir)?;

    // Write env file
    let env_path = home.join(".this-code/env");
    std::fs::write(&env_path, ENV_FILE_CONTENT)?;

    // Create symlink (idempotent)
    create_code_symlink(&bin_dir)?;

    if fish {
        let fish_dir = home.join(".config/fish/conf.d");
        std::fs::create_dir_all(&fish_dir)?;
        let fish_path = fish_dir.join("this-code.fish");
        std::fs::write(&fish_path, FISH_FILE_CONTENT)?;
        println!("Fish integration written to {}", fish_path.display());
    }

    println!("this-code installed to {}/", bin_dir.display());
    println!();
    println!("To activate, add the following to ~/.bashrc or ~/.zshrc:");
    println!();
    println!(r#"    . "$HOME/.this-code/env""#);

    Ok(())
}

const ENV_FILE_CONTENT: &str = r#"#!/bin/sh
# Source this file from ~/.bashrc or ~/.zshrc
# Add: . "$HOME/.this-code/env"
THIS_CODE_HOME="${THIS_CODE_HOME:-$HOME/.this-code}"
case ":${PATH}:" in
  *":${THIS_CODE_HOME}/bin:"*) ;;
  *) export PATH="${THIS_CODE_HOME}/bin:${PATH}" ;;
esac
"#;

const FISH_FILE_CONTENT: &str = r#"fish_add_path --prepend "$HOME/.this-code/bin"
"#;
```

### Clippy Lints (from periphore)

```toml
# In Cargo.toml — matches periphore workspace lints
[lints.rust]
unsafe_code = "warn"
unreachable_pub = "warn"

[lints.clippy]
pedantic = { level = "warn", priority = -1 }
module_name_repetitions = "allow"
missing_errors_doc = "allow"
missing_panics_doc = "allow"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `which` crate v4 (POSIX only) | v8 with `Sys` trait for WASM/cross-platform abstraction | v8.0.0, early 2024 | Top-level functions unchanged; affects only `WhichConfig` generics |
| `figment` Env without lowercasing | Default lowercasing is now standard | figment 0.10.x | `Env::prefixed` now lowercases by default; no manual `.lowercase(true)` needed |
| `home` crate for home dir | `directories` crate (v6) | 2023-2024 | `which` crate v8.0.2 itself dropped `home_env` crate in favor of Rust 1.85 built-in |

**Deprecated/outdated:**

- `WHICH_CODE_HOME` env var name: replaced by `THIS_CODE_HOME` per project rename from which-code to this-code. Any shell script still using `WHICH_CODE_HOME` must be updated.
- `which = "7"`: current is 8.0.2. v7 API is compatible for this use case but outdated.
- STACK.md fish snippet using `set -gx WHICH_CODE_HOME ...`: D-02 supersedes this with `fish_add_path --prepend "$HOME/.this-code/bin"` only (no `WHICH_CODE_HOME` export in fish).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recursion guard fast-path does not need to re-set `THIS_CODE_ACTIVE` on the Command builder (it is already in the environment) | Pattern 6 | Low: setting it again is idempotent; the only risk is if a subprocess clears env vars, which VS Code does not do |
| A2 | `CommandExt::exec()` inherits the parent's stdio correctly for interactive VS Code launch (no terminal detachment) | Pattern 4 | Low: exec replaces the process, inheriting all fds; VS Code handles its own terminal detachment on startup |
| A3 | `fish_add_path --prepend` in conf.d is idempotent across multiple sources of the file | Pattern 7 | Low: fish 3.2+ `fish_add_path` with `--path` checks for duplicates; SHELL-04 compliance confirmed by existing PITFALLS.md research |

---

## Open Questions

1. **`this-code` vs `code` invocation detection**
   - What we know: `std::env::current_exe()` returns the resolved binary path (through symlinks on some platforms)
   - What's unclear: On Linux, `current_exe()` resolves symlinks via `/proc/self/exe`, so it always returns the `this-code` path even when invoked as `code`. `args().next()` returns `argv[0]` which IS the symlink name.
   - Recommendation: Use `args().next()` to detect invocation name, not `current_exe()`. Pattern: `let invoked_as_code = std::env::args().next().map(|a| a.ends_with("code")).unwrap_or(false);`

2. **Cargo.toml location: `cli/Cargo.toml` vs `Cargo.toml`**
   - What we know: CONTEXT.md says "Single binary crate at `cli/` directory (not a Cargo workspace)"; the repo root already has `extension/` and no `Cargo.toml`
   - What's unclear: Whether the Rust crate goes at `cli/` (nested) or at the repo root
   - Recommendation: Use `cli/` as the crate root, parallel to `extension/`. The repo root does not become a Cargo workspace — only `cli/` is a Cargo crate.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | Building the CLI binary | Yes | rustc 1.95.0 (2026-04-14) | — |
| cargo | Building dependencies | Yes | cargo 1.95.0 | — |
| cargo clippy | Linting (prek hooks) | Yes (bundled with toolchain) | 1.95.0 | — |
| cargo fmt | Formatting (prek hooks) | Yes (bundled) | 1.95.0 | — |
| fish shell | Testing `install --fish` | Not verified | — | Skip fish test on machines without fish |

**Rust edition 2024 requirement:** Edition 2024 is stable since Rust 1.85.0 (Feb 2025). The installed toolchain (rustc 1.95.0) supports it. [VERIFIED: Bash 2026-04-27]

**Missing dependencies with no fallback:** None — all required build tools are present.

**Missing dependencies with fallback:** fish shell (optional — test on a machine with fish installed, or use CI).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | cargo test (built-in unit tests) + integration tests via `tests/` |
| Config file | `cli/Cargo.toml` (no separate test config needed) |
| Quick run command | `cargo test -p this-code` (from repo root once cli/ exists) |
| Full suite command | `cargo test -p this-code && cargo clippy -p this-code -- -D warnings` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-01 | Binary named `this-code` builds and runs | smoke | `cargo build -p this-code` | No — Wave 0 |
| CLI-02 | Binary includes clap/figment/rusqlite deps | unit | `cargo test -p this-code test_deps_compile` | No — Wave 0 |
| CLI-04 | Recursion guard fires when `THIS_CODE_ACTIVE=1` | unit | `cargo test -p this-code test_recursion_guard` | No — Wave 0 |
| CLI-05 | Discovery chain: env var → config → PATH strip | unit | `cargo test -p this-code test_discover_*` | No — Wave 0 |
| CLI-06 | Install creates `~/.this-code/bin/` | integration | `cargo test -p this-code test_install_creates_dirs` | No — Wave 0 |
| SHELL-02 | `env` file prepends bin dir to PATH | unit | `cargo test -p this-code test_env_file_content` | No — Wave 0 |
| SHELL-03 | Install output instructions mention `~/.zshrc` | unit | `cargo test -p this-code test_install_output` | No — Wave 0 |
| SHELL-04 | `install --fish` writes fish conf.d, uses `fish_add_path` | unit | `cargo test -p this-code test_fish_file_content` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `cargo test -p this-code`
- **Per wave merge:** `cargo test -p this-code && cargo clippy -p this-code -- -D warnings && cargo fmt -p this-code -- --check`
- **Phase gate:** All above green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `cli/src/main.rs` — entry point must exist before any tests compile
- [ ] `cli/Cargo.toml` — crate must be initialized (`cargo init --name this-code`)
- [ ] `cli/tests/install.rs` — integration tests for install subcommand
- [ ] `cli/tests/discover.rs` — integration tests for discovery chain (use `tempfile` for isolated PATH)
- [ ] `cli/src/discover.rs` — the `strip_own_dir_from_path` function has pure unit tests with no OS dependency

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | CLI runs as current user; no authentication layer |
| V3 Session Management | No | No sessions in Phase 2 (pass-through only) |
| V4 Access Control | No | File permissions on `~/.this-code/` controlled by OS user ownership |
| V5 Input Validation | Yes | Path arguments validated by `which_in` and `PathBuf`; no shell interpolation |
| V6 Cryptography | No | No secrets stored or transmitted |

### Known Threat Patterns for PATH shim

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PATH injection — attacker injects malicious `code` before our shim is stripped | Tampering | `which_in` with stripped PATH; canonical path comparison with `std::env::current_exe()` if needed |
| Symlink following attack on `~/.this-code/bin/code` | Tampering | Write to user's own home directory only; symlink is user-owned |
| Env var injection (`THIS_CODE_CODE_PATH` set by attacker) | Elevation of privilege | The env var allows override of binary path — valid threat if running setuid; this binary is NOT setuid, so env is trusted |
| Infinite recursion / resource exhaustion | Denial of Service | D-05 env var guard is the primary control |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 2 |
|-----------|-------------------|
| Rust edition 2024 | `edition = "2024"` in `cli/Cargo.toml` |
| clap 4.6 derive | Use derive API, not builder API |
| figment 0.10 + TOML + Env providers | Use `features = ["toml", "env"]` |
| rusqlite 0.39 bundled | Include even though Phase 2 doesn't use it |
| tracing + tracing-subscriber | Replace any `eprintln!` diagnostic output |
| thiserror 2.0 + anyhow 1.0 | Error types: `ThisCodeError` with `#[derive(thiserror::Error)]`; main returns `anyhow::Result` |
| clippy pedantic + overrides | See lints block in Cargo.toml pattern above |
| Single binary crate at `cli/` | Not a Cargo workspace; `cargo init --name this-code cli/` |
| Commitizen + prek hooks | Conventional commits; `prek` must pass before commit |
| No GUI, no webview | CLI only; output is stdout/stderr |
| `~/.this-code/` paths | All paths use `~/.this-code/` prefix (not `~/.which-code/`) |
| `THIS_CODE_HOME` env var name | STACK.md's `WHICH_CODE_HOME` is stale; use `THIS_CODE_HOME` |

---

## Sources

### Primary (HIGH confidence)

- [docs.rs/which/8.0.2](https://docs.rs/which/8.0.2/which/) — `which_in`, `which_in_all` signatures verified
- [docs.rs/figment/0.10.19](https://docs.rs/figment/0.10.19/figment/providers/struct.Env.html) — `Env::prefixed` key mapping behavior verified; `Toml::file` missing-file behavior verified
- [doc.rust-lang.org/std/os/unix/process/trait.CommandExt.html](https://doc.rust-lang.org/std/os/unix/process/trait.CommandExt.html) — `exec()` return semantics verified
- [doc.rust-lang.org/std/os/unix/fs/fn.symlink.html](https://doc.rust-lang.org/std/os/unix/fs/fn.symlink.html) — symlink parameter order verified
- [docs.rs/clap/4.6.1](https://docs.rs/clap/latest/clap/_derive/_tutorial/index.html) — optional subcommand pattern verified
- [docs.rs/directories/latest](https://docs.rs/directories/latest/directories/struct.BaseDirs.html) — `BaseDirs::new()` returning `Option` verified
- cargo search (2026-04-27) — `which = "8.0.2"` current version verified
- crates.io API (2026-04-27) — `figment = "0.10.19"`, `clap = "4.6.1"` verified
- Bash: `rustc --version` (2026-04-27) — rustc 1.95.0 supports edition 2024

### Secondary (MEDIUM confidence)

- [Rust Users Forum: Windows exec() equivalent](https://users.rust-lang.org/t/is-there-a-windows-eauivalent-of-std-exec/70262) — `Command::status()` + `process::exit()` pattern; cross-referenced with official docs
- [which-rs CHANGELOG.md](https://github.com/harryfei/which-rs/blob/master/CHANGELOG.md) — v7→v8 breaking changes; confirms `which_in` unaffected

### Tertiary (LOW confidence)

- None — all critical claims verified from primary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all crate versions verified against cargo/crates.io
- Architecture: HIGH — figment key mapping, exec semantics, symlink parameter order all verified from official docs
- Pitfalls: HIGH — all pitfalls verified from official documentation; no unverified claims in pitfall section

**Research date:** 2026-04-27
**Valid until:** 2026-07-27 (stable Rust crates; figment/clap/which API unlikely to change at patch level)
