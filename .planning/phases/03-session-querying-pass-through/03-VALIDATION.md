---
phase: 3
slug: session-querying-pass-through
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (built-in Rust test runner) |
| **Config file** | none — standard `#[cfg(test)]` modules in each source file |
| **Quick run command** | `cargo test --manifest-path cli/Cargo.toml` |
| **Full suite command** | `cargo test --manifest-path cli/Cargo.toml && cargo clippy --manifest-path cli/Cargo.toml -- -D warnings && cargo fmt --manifest-path cli/Cargo.toml --check` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cargo test --manifest-path cli/Cargo.toml`
- **After every plan wave:** Run full suite command (test + clippy + fmt)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| config-db_path | 03-01 | 1 | QUERY-01 | — | N/A | unit | `cargo test -p this-code test_config_db_path_default_is_none` | ❌ W0 | ⬜ pending |
| db-open | 03-01 | 1 | QUERY-01 | T-04-01 | open_with_flags uses RW+CREATE; busy_timeout=5000 set | unit | `cargo test -p this-code test_open_db` | ❌ W0 | ⬜ pending |
| db-query-empty | 03-01 | 1 | QUERY-01 | — | Returns Ok(None) on empty table | unit | `cargo test -p this-code test_query_latest_session_empty_table` | ❌ W0 | ⬜ pending |
| db-query-match | 03-01 | 1 | QUERY-01 | — | Returns most recent row for matching workspace | unit | `cargo test -p this-code test_query_latest_session_returns_most_recent` | ❌ W0 | ⬜ pending |
| db-query-mismatch | 03-01 | 1 | QUERY-01 | — | Returns Ok(None) for non-matching workspace | unit | `cargo test -p this-code test_query_latest_session_workspace_mismatch` | ❌ W0 | ⬜ pending |
| db-no-such-table | 03-01 | 1 | QUERY-01 | — | "no such table" maps to no-sessions, not error | unit | `cargo test -p this-code test_no_such_table_is_detectable` | ❌ W0 | ⬜ pending |
| query-human-output | 03-02 | 2 | QUERY-02 | — | Human-readable table with 6 fields, 14-char label padding | unit | `cargo test -p this-code test_format_human_output` | ❌ W0 | ⬜ pending |
| query-json-output | 03-02 | 2 | QUERY-02 | — | --json emits valid JSON with all session fields | unit | `cargo test -p this-code test_session_to_json_output` | ❌ W0 | ⬜ pending |
| query-cwd-fallback | 03-02 | 2 | QUERY-02 | — | Omitting PATH uses current_dir() | unit | `cargo test -p this-code test_format_human_output` | ❌ W0 | ⬜ pending |
| query-dry-run | 03-02 | 2 | QUERY-03 | — | --dry-run prints "would exec: ..." without executing | unit | `cargo test -p this-code test_session_to_json_corrupt_open_files` | ❌ W0 | ⬜ pending |
| shim-unchanged | 03-02 | 2 | QUERY-04 | D-01 | shim.rs compile-verified; run_shim signature unchanged | compile | `cargo build --manifest-path cli/Cargo.toml` | ✅ | ⬜ pending |
| cli-query-arm | 03-02 | 2 | QUERY-02 | — | `this-code query --help` shows PATH, --dry-run, --json | compile | `cargo build --manifest-path cli/Cargo.toml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `cli/src/db.rs` — new file with `Session` struct, `open_db()`, `query_latest_session()` + test module (covers db-open, db-query-empty, db-query-match, db-query-mismatch, db-no-such-table)
- [ ] `cli/src/query.rs` — new file with `run_query()`, `format_human()`, `session_to_json()` + test module (covers query-human-output, query-json-output, query-cwd-fallback, query-dry-run)
- [ ] Extend `cli/src/config.rs` test module — add `test_config_db_path_default_is_none` to existing `#[cfg(test)]` block

*Existing test infrastructure: `cargo test` already runs; `config.rs`, `shim.rs`, `install.rs` all have `#[cfg(test)]` modules. No new test runner setup needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `this-code query` against a real `~/.this-code/sessions.db` written by the extension | QUERY-01, QUERY-02 | Requires Phase 1 extension to be installed and activated | After Phase 1 is complete: open a workspace, then run `this-code query /path/to/workspace` and confirm session data appears |
| `code .` shim passes through to real VS Code with no session routing (D-01) | QUERY-04 | Requires real VS Code install and PATH configured | Run `~/.this-code/bin/code .` and confirm VS Code launches normally; check no DB lookup occurs (RUST_LOG=debug) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
