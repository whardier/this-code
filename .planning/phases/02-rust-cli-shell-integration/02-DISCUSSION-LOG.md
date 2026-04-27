# Phase 2: Rust CLI + Shell Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 02-rust-cli-shell-integration
**Areas discussed:** Shim setup method, Real `code` discovery, Config scaffolding

---

## Shim Setup Method

| Option | Description | Selected |
|--------|-------------|----------|
| Create env file + symlink only | Install creates the files, prints instructions. User adds `. "$HOME/.this-code/env"` to their shell rc manually. Predictable, no surprise file mutations. | ✓ |
| Also modify shell rc files | Install detects ~/.zshrc / ~/.bashrc and appends the source line automatically. More convenient but touches user's config files. | |

**User's choice:** Create env file + symlink only

**Notes:** User specifically referenced `~/.cargo/env` as the model: a POSIX sh file with case-colon PATH guard. User also specified the symlink from `code → this-code` as part of install. This replaces the `this-code init <shell>` subcommand design from SHELL-01.

---

## Fish Shell Integration

| Option | Description | Selected |
|--------|-------------|----------|
| `this-code init fish` subcommand | Keep SHELL-01's init fish for fish users. | |
| `this-code install --fish` flag | Consolidated into install command with a flag, reducing subcommand count. | ✓ |

**User's choice:** `this-code install --fish` flag

**Notes:** User preference was to reduce the number of subcommands supported. `--fish` flag on `install` consolidates shell setup.

---

## Fish conf.d Writing

| Option | Description | Selected |
|--------|-------------|----------|
| Print snippet, user adds it | Consistent with bash/zsh behavior. | |
| Write to ~/.config/fish/conf.d/ directly | Fish conf.d is designed for tool-dropped files; fish auto-sources them. | ✓ |

**User's choice:** Write directly to `~/.config/fish/conf.d/this-code.fish`

---

## Real `code` Binary Discovery

| Option | Description | Selected |
|--------|-------------|----------|
| PATH stripping only | Remove ~/.this-code/bin/ from PATH, use which/PATH resolution. | |
| PATH stripping + hardcoded fallbacks | Try PATH stripping first; check known macOS/Linux install locations as fallback. | |
| User-configurable code_path | User sets code_path in config.toml. | |
| User config + PATH stripping (pure Rust) | Config override first, then PATH stripping using pure-Rust `which` crate (no system `which`). | ✓ |

**User's choice:** Config (`THIS_CODE_CODE_PATH` env var or `code_path` in config.toml) first, then PATH stripping with pure-Rust `which` crate.

**Notes:** User explicitly called out that shelling out to the system `which` command is not portable. The `which` Rust crate implements the same PATH search in pure Rust. Both env var and config file overrides should take priority over discovery.

---

## Recursion Guard

| Option | Description | Selected |
|--------|-------------|----------|
| Exec real code immediately, skip PATH stripping | If THIS_CODE_ACTIVE is set, go directly to real binary via same discovery mechanism. | ✓ |
| Exit with error | Treat recursion as a bug and exit. | |

**User's choice:** Exec real code immediately

---

## Config Scaffolding

| Option | Description | Selected |
|--------|-------------|----------|
| code_path only | One key in Phase 2; db_path waits until Phase 3. | ✓ |
| code_path + db_path | Scaffold both now since config file is already being created. | |

**User's choice:** `code_path` only

---

## Config Env Var Support

| Option | Description | Selected |
|--------|-------------|----------|
| TOML file + env vars (figment) | THIS_CODE_CODE_PATH env var overrides config file, which overrides default. | ✓ |
| TOML file only | Simpler; env var support added when needed. | |

**User's choice:** TOML + env vars via figment

---

## Claude's Discretion

- Exact format of `this-code install` usage output
- Idempotency of `install` command
- Error handling when real `code` binary not found
- Clap subcommand structure
- tracing/logging verbosity for pass-through path

## Deferred Ideas

- `db_path` config key — Phase 3
- `--modify-rc` flag for auto-appending to shell rc files
- `this-code uninstall`
- Windows PATH integration details
