use crate::{config::Config, db, query};
use anyhow::Result;
use directories::BaseDirs;
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

/// Check whether we are already inside a shim invocation.
///
/// Returns `true` if `THIS_CODE_ACTIVE=1` is set in the current environment.
/// This is the D-05 recursion guard fast path.
pub(crate) fn is_recursion_guard_active() -> bool {
    std::env::var("THIS_CODE_ACTIVE").is_ok_and(|v| v == "1")
}

/// Remove `~/.this-code/bin` from a colon-separated PATH string.
///
/// Used before calling `which_in` to prevent the shim from finding itself.
/// Idempotent: running twice produces the same result.
pub(crate) fn strip_own_bin_from_path(path_env: &str, own_bin: &Path) -> String {
    std::env::split_paths(path_env)
        .filter(|p| p.as_path() != own_bin)
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(":")
}

/// Discover the real `code` binary using the D-04 priority chain:
///
/// 1. `THIS_CODE_CODE_PATH` env var — explicit override
/// 2. `config.code_path` — user-configured path in `~/.this-code/config.toml`
/// 3. PATH stripping + `which::which_in` — remove own bin dir, search remaining PATH
pub(crate) fn discover_real_code(config: &Config, own_bin_dir: &Path) -> Result<PathBuf> {
    // Step 1: explicit env var override
    if let Ok(p) = std::env::var("THIS_CODE_CODE_PATH") {
        tracing::debug!(path = %p, "using THIS_CODE_CODE_PATH override");
        return Ok(PathBuf::from(p));
    }

    // Step 2: config file override
    if let Some(ref p) = config.code_path {
        tracing::debug!(path = %p.display(), "using config.code_path override");
        return Ok(p.clone());
    }

    // Step 3: PATH stripping + which_in
    let path_env = std::env::var("PATH").unwrap_or_default();
    let stripped = strip_own_bin_from_path(&path_env, own_bin_dir);
    tracing::debug!(%stripped, "searching stripped PATH for real code binary");

    let cwd = std::env::current_dir()?;
    which::which_in("code", Some(stripped.as_str()), &cwd).map_err(|_| {
        anyhow::anyhow!(
            "Cannot locate real `code` binary after stripping ~/.this-code/bin from PATH.\n\
             Set THIS_CODE_CODE_PATH or add `code_path = \"/path/to/code\"` to \
             ~/.this-code/config.toml"
        )
    })
}

/// Exec the real `code` binary, replacing the current process.
///
/// Sets `THIS_CODE_ACTIVE=1` on the child environment to prevent recursion.
/// If `ipc_hook` is `Some`, also sets `VSCODE_IPC_HOOK_CLI` so that
/// `remote-cli/code` can communicate with the running VS Code Server instance.
///
/// On Unix: uses `CommandExt::exec()` — replaces the current process.
/// On Windows: uses `Command::status()` + `process::exit()` (no exec on Windows).
///
/// # Errors
///
/// On Unix, only returns if `exec()` fails (e.g., binary not found or permission denied).
/// On Windows, returns after the child process exits.
#[cfg(unix)]
pub(crate) fn exec_real_code(
    real_code: &Path,
    args: impl IntoIterator<Item = OsString>,
    ipc_hook: Option<&str>,
) -> Result<()> {
    use std::os::unix::process::CommandExt;
    let mut cmd = std::process::Command::new(real_code);
    cmd.args(args).env("THIS_CODE_ACTIVE", "1");
    if let Some(ipc) = ipc_hook {
        cmd.env("VSCODE_IPC_HOOK_CLI", ipc);
    }
    let err = cmd.exec();
    // exec() only returns on failure
    Err(anyhow::anyhow!("exec failed: {err}").context(format!(
        "Failed to exec real `code` binary at {}",
        real_code.display()
    )))
}

#[cfg(windows)]
pub(crate) fn exec_real_code(
    real_code: &Path,
    args: impl IntoIterator<Item = OsString>,
    ipc_hook: Option<&str>,
) -> Result<()> {
    let mut cmd = std::process::Command::new(real_code);
    cmd.args(args).env("THIS_CODE_ACTIVE", "1");
    if let Some(ipc) = ipc_hook {
        cmd.env("VSCODE_IPC_HOOK_CLI", ipc);
    }
    let status = cmd.status()?;
    std::process::exit(status.code().unwrap_or(1));
}

/// Strip a trailing `:N` or `:N:N` goto suffix from a path string.
///
/// VS Code appends `:line` or `:line:col` (both integers) to `--goto` arguments.
/// Only strips when the trailing colon-separated components are all ASCII digits,
/// so Windows drive letters (`C:\...`) and paths with colons in directory names
/// are preserved unchanged.
fn strip_goto_suffix(s: &str) -> &str {
    // Find the last colon; if everything after it is digits, it may be a line/col suffix.
    if let Some(last_colon) = s.rfind(':') {
        let after_last = &s[last_colon + 1..];
        if !after_last.is_empty() && after_last.chars().all(|c| c.is_ascii_digit()) {
            let prefix = &s[..last_colon];
            // Check whether the segment before the last colon is also a digit run
            // (i.e. we have both :line:col — strip both at once).
            if let Some(prev_colon) = prefix.rfind(':') {
                let middle = &prefix[prev_colon + 1..];
                if !middle.is_empty() && middle.chars().all(|c| c.is_ascii_digit()) {
                    return &prefix[..prev_colon];
                }
            }
            return prefix;
        }
    }
    s
}

/// Extract the lookup path from shim arguments.
///
/// Uses the first non-flag argument as the candidate path. Strips the
/// `:line:col` suffix that VS Code appends for `--goto` navigation.
/// Falls back to cwd when no positional argument is present.
fn resolve_shim_lookup_path(args: &[OsString]) -> PathBuf {
    for arg in args {
        let s = arg.to_string_lossy();
        if s.starts_with('-') {
            continue;
        }
        // Strip :line or :line:col suffix (integers only) to avoid corrupting
        // Windows drive letters (C:\...) or paths with colons in directory names.
        let path_part = strip_goto_suffix(&s);
        return PathBuf::from(path_part);
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Attempt to find the `remote-cli/code` binary via the session store.
///
/// Resolves the lookup path from the first positional argument (or cwd),
/// walks the directory ancestry to find a matching session row, then
/// constructs the `remote-cli/code` path from `remote_server_path`.
///
/// Returns `Some((binary_path, ipc_hook_cli))` on success, where
/// `ipc_hook_cli` is the `VSCODE_IPC_HOOK_CLI` socket path from the session
/// (required by `remote-cli/code` to communicate with the running server).
///
/// Returns `None` when:
/// - DB does not exist or cannot be opened
/// - No session found for the path ancestry
/// - `remote_server_path` is not set in the session
/// - Neither layout produces a binary that exists on disk
fn discover_remote_cli(config: &Config, args: &[OsString]) -> Option<(PathBuf, Option<String>)> {
    let db_path = config.db_path.clone().unwrap_or_else(|| {
        BaseDirs::new().map_or_else(
            || PathBuf::from(".this-code/sessions.db"),
            |b| b.home_dir().join(".this-code/sessions.db"),
        )
    });

    if !db_path.exists() {
        return None;
    }

    let conn = db::open_db(&db_path).ok()?;
    let lookup = resolve_shim_lookup_path(args);
    let canonical = std::fs::canonicalize(&lookup).unwrap_or(lookup);

    tracing::debug!(path = %canonical.display(), "session lookup path");

    let session = query::find_session_by_ancestry(&conn, &canonical).ok()??;
    // Resolve remote_server_path first (borrows then drops), then move ipc_hook_cli
    // out of session directly — avoids a needless clone of Option<String>.
    let remote_server_path = PathBuf::from(session.remote_server_path.as_deref()?);
    let ipc_hook_cli = session.ipc_hook_cli; // moved, not cloned

    // Current layout: {remote_server_path}/server/bin/remote-cli/code
    let current = remote_server_path.join("server/bin/remote-cli/code");
    if current.exists() {
        tracing::debug!(path = %current.display(), "found remote-cli (current layout)");
        return Some((current, ipc_hook_cli));
    }

    // Legacy layout: {remote_server_path}/bin/remote-cli/code
    let legacy = remote_server_path.join("bin/remote-cli/code");
    if legacy.exists() {
        tracing::debug!(path = %legacy.display(), "found remote-cli (legacy layout)");
        return Some((legacy, ipc_hook_cli));
    }

    tracing::debug!(
        path = %remote_server_path.display(),
        "remote_server_path set but remote-cli binary not found at either layout"
    );
    None
}

/// Run the shim pass-through.
///
/// Entry point called from `main()` when the binary is invoked as `code`.
pub(crate) fn run_shim(config: &Config) -> Result<()> {
    // Determine our own bin dir for PATH stripping.
    let own_bin_dir = BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
        .home_dir()
        .join(".this-code/bin");

    // Collect forward args: all args except argv[0] (the shim invocation name).
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();

    // D-05: recursion guard fast path.
    // THIS_CODE_ACTIVE is already "1" in the environment; child inherits it.
    if is_recursion_guard_active() {
        tracing::debug!("recursion guard active — fast path to real code binary");
        let real_code = discover_real_code(config, &own_bin_dir)?;
        return exec_real_code(&real_code, args, None);
    }

    // Session-based routing: prefer remote-cli when a session exists for this path.
    if let Some((remote_cli, ipc_hook)) = discover_remote_cli(config, &args) {
        tracing::debug!(
            binary = %remote_cli.display(),
            ipc_hook = ?ipc_hook,
            "routing via session store to remote-cli"
        );
        return exec_real_code(&remote_cli, args, ipc_hook.as_deref());
    }

    // PATH fallback: no session found, strip own bin dir and exec via PATH.
    let real_code = discover_real_code(config, &own_bin_dir)?;
    tracing::debug!(binary = %real_code.display(), args = ?args, "exec real code binary (PATH fallback)");
    exec_real_code(&real_code, args, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_strip_own_bin_removes_entry() {
        let own_bin = PathBuf::from("/home/user/.this-code/bin");
        let path_env = "/usr/bin:/home/user/.this-code/bin:/usr/local/bin";
        let result = strip_own_bin_from_path(path_env, &own_bin);
        assert_eq!(result, "/usr/bin:/usr/local/bin");
    }

    #[test]
    fn test_strip_own_bin_idempotent() {
        let own_bin = PathBuf::from("/home/user/.this-code/bin");
        let path_env = "/usr/bin:/home/user/.this-code/bin:/usr/local/bin";
        let once = strip_own_bin_from_path(path_env, &own_bin);
        let twice = strip_own_bin_from_path(&once, &own_bin);
        assert_eq!(once, twice);
    }

    #[test]
    fn test_strip_own_bin_leaves_others_untouched() {
        let own_bin = PathBuf::from("/home/user/.this-code/bin");
        let path_env = "/usr/bin:/usr/local/bin";
        let result = strip_own_bin_from_path(path_env, &own_bin);
        assert_eq!(result, "/usr/bin:/usr/local/bin");
    }

    #[test]
    fn recursion_guard_matches_env_var() {
        // Verify is_recursion_guard_active() reflects the actual env state,
        // not a local reimplementation of the same logic.
        let expected = std::env::var("THIS_CODE_ACTIVE").is_ok_and(|v| v == "1");
        assert_eq!(is_recursion_guard_active(), expected);
    }

    #[test]
    fn test_resolve_shim_lookup_path_positional_arg() {
        let args: Vec<OsString> = vec![OsString::from("/some/path")];
        let result = resolve_shim_lookup_path(&args);
        assert_eq!(result, PathBuf::from("/some/path"));
    }

    #[test]
    fn test_resolve_shim_lookup_path_skips_flags() {
        let args: Vec<OsString> = vec![
            OsString::from("--new-window"),
            OsString::from("--wait"),
            OsString::from("/some/path"),
        ];
        let result = resolve_shim_lookup_path(&args);
        assert_eq!(result, PathBuf::from("/some/path"));
    }

    #[test]
    fn test_resolve_shim_lookup_path_strips_goto_suffix() {
        let args: Vec<OsString> = vec![OsString::from("file.ts:10:5")];
        let result = resolve_shim_lookup_path(&args);
        assert_eq!(result, PathBuf::from("file.ts"));
    }

    #[test]
    fn test_resolve_shim_lookup_path_no_colon_unchanged() {
        let args: Vec<OsString> = vec![OsString::from("./src/main.rs")];
        let result = resolve_shim_lookup_path(&args);
        assert_eq!(result, PathBuf::from("./src/main.rs"));
    }

    #[test]
    fn test_resolve_shim_lookup_path_no_args_returns_something() {
        // With no args, returns cwd or fallback "." — just confirm it doesn't panic
        let args: Vec<OsString> = vec![];
        let result = resolve_shim_lookup_path(&args);
        assert!(!result.as_os_str().is_empty());
    }

    // strip_goto_suffix unit tests
    #[test]
    fn test_strip_goto_suffix_line_and_col() {
        assert_eq!(strip_goto_suffix("file.ts:10:5"), "file.ts");
    }

    #[test]
    fn test_strip_goto_suffix_line_only() {
        assert_eq!(strip_goto_suffix("file.ts:10"), "file.ts");
    }

    #[test]
    fn test_strip_goto_suffix_no_suffix() {
        assert_eq!(strip_goto_suffix("file.ts"), "file.ts");
    }

    #[test]
    fn test_strip_goto_suffix_absolute_path_with_suffix() {
        assert_eq!(
            strip_goto_suffix("/home/user/file.rs:42:1"),
            "/home/user/file.rs"
        );
    }

    #[test]
    fn test_strip_goto_suffix_windows_drive_letter_preserved() {
        // C: looks like a colon suffix but "C" is not all-digits — must not strip
        assert_eq!(
            strip_goto_suffix("C:\\Users\\foo\\bar.ts:10:5"),
            "C:\\Users\\foo\\bar.ts"
        );
    }

    #[test]
    fn test_strip_goto_suffix_colon_in_dir_name_preserved() {
        // Unusual but valid on Linux: directory name contains a colon
        // "some:dir/file.ts" — "dir/file.ts" is not all-digits, so nothing is stripped
        assert_eq!(strip_goto_suffix("some:dir/file.ts"), "some:dir/file.ts");
    }

    #[test]
    fn test_strip_goto_suffix_empty_string() {
        assert_eq!(strip_goto_suffix(""), "");
    }
}
