use anyhow::Result;
use directories::BaseDirs;
use std::path::Path;

/// Content written to `~/.this-code/env`.
///
/// POSIX sh script that prepends `~/.this-code/bin` to PATH using the case-colon guard.
/// Users source this from `~/.bashrc` or `~/.zshrc` (NOT `~/.zshenv` — macOS `path_helper`
/// in /etc/zprofile runs after ~/.zshenv and would reorder PATH; sourcing from ~/.zshrc
/// ensures this-code stays leftmost).
///
/// Uses `THIS_CODE_HOME` (not `WHICH_CODE_HOME` — project renamed from which-code to this-code).
const ENV_FILE_CONTENT: &str = "#!/bin/sh
# this-code shell integration
# Source this file from ~/.bashrc or ~/.zshrc:
#
#     . \"$HOME/.this-code/env\"
#
# Do NOT source from ~/.zshenv — macOS path_helper reorders PATH set there.

THIS_CODE_HOME=\"${THIS_CODE_HOME:-$HOME/.this-code}\"
case \":${PATH}:\" in
  *\":${THIS_CODE_HOME}/bin:\"*) ;;
  *) export PATH=\"${THIS_CODE_HOME}/bin:${PATH}\" ;;
esac
";

/// Content written to `~/.config/fish/conf.d/this-code.fish`.
///
/// `fish_add_path --prepend` is idempotent (fish 3.2+ deduplicates).
/// Uses `--prepend` to ensure leftmost position (SHELL-02).
const FISH_FILE_CONTENT: &str = "# this-code fish integration
# Auto-sourced by fish from conf.d on startup.
fish_add_path --prepend \"$HOME/.this-code/bin\"
";

/// Create the code → this-code symlink inside `bin_dir`.
///
/// Idempotent: removes existing symlink or file before recreating.
///
/// CRITICAL arg order: `symlink(original, link)` — first arg is the TARGET, second is the LINK.
/// `symlink("this-code", bin_dir/code)` means: `code` → `this-code` (relative, both in same dir).
#[cfg(unix)]
fn create_code_symlink(bin_dir: &Path) -> Result<()> {
    let symlink_path = bin_dir.join("code");
    let target = std::path::Path::new("this-code"); // relative target — both in same directory

    // Idempotency: remove existing file or (broken) symlink before recreating.
    // symlink_metadata() returns Ok even for broken symlinks; exists() returns false for broken.
    if symlink_path.symlink_metadata().is_ok() {
        std::fs::remove_file(&symlink_path)?;
    }

    std::os::unix::fs::symlink(target, &symlink_path)?;
    tracing::debug!(
        link = %symlink_path.display(),
        target = "this-code",
        "created symlink"
    );
    Ok(())
}

#[cfg(windows)]
fn create_code_symlink(bin_dir: &Path) -> Result<()> {
    // Windows symlinks require Developer Mode or admin privilege.
    // PLAT-02 best-effort: attempt creation, report clear error on failure.
    let symlink_path = bin_dir.join("code.exe");
    let target = bin_dir.join("this-code.exe");

    if symlink_path.symlink_metadata().is_ok() {
        std::fs::remove_file(&symlink_path)?;
    }

    std::os::windows::fs::symlink_file(&target, &symlink_path).map_err(|e| {
        anyhow::anyhow!(
            "Cannot create symlink on Windows (requires Developer Mode or admin): {e}\n\
             Alternative: copy this-code.exe to code.exe manually in {}",
            bin_dir.display()
        )
    })?;
    Ok(())
}

/// Run the install subcommand.
///
/// Creates the following artifacts (idempotent — safe to re-run):
/// - `~/.this-code/bin/` directory
/// - `~/.this-code/env` — POSIX sh PATH prepend script
/// - `~/.this-code/bin/code` → `this-code` symlink
///
/// When `fish` is true, also creates:
/// - `~/.config/fish/conf.d/this-code.fish`
pub(crate) fn run_install(fish: bool) -> Result<()> {
    let base = BaseDirs::new().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
    let home = base.home_dir();

    // Create ~/.this-code/bin/ (and parent ~/.this-code/ if needed).
    let bin_dir = home.join(".this-code/bin");
    std::fs::create_dir_all(&bin_dir)?;
    tracing::debug!(dir = %bin_dir.display(), "ensured bin dir exists");

    // Write ~/.this-code/env (overwrite if exists — idempotent).
    let env_path = home.join(".this-code/env");
    std::fs::write(&env_path, ENV_FILE_CONTENT)?;
    tracing::debug!(path = %env_path.display(), "wrote env file");

    // Create ~/.this-code/bin/code → this-code symlink.
    create_code_symlink(&bin_dir)?;

    // Fish integration (--fish flag).
    if fish {
        let fish_conf_dir = home.join(".config/fish/conf.d");
        std::fs::create_dir_all(&fish_conf_dir)?;
        let fish_path = fish_conf_dir.join("this-code.fish");
        std::fs::write(&fish_path, FISH_FILE_CONTENT)?;
        tracing::debug!(path = %fish_path.display(), "wrote fish conf.d file");
        println!("Fish integration installed to {}", fish_path.display());
    }

    // Print instructions.
    println!("this-code installed to {}/", bin_dir.display());
    println!();
    println!("To activate, add the following line to ~/.bashrc or ~/.zshrc:");
    println!();
    println!("    . \"$HOME/.this-code/env\"");
    println!();
    println!("Then restart your shell or run:");
    println!();
    println!("    . \"$HOME/.this-code/env\"");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_env_file_contains_this_code_home() {
        assert!(ENV_FILE_CONTENT.contains("THIS_CODE_HOME"));
        // Must NOT contain the old project name.
        assert!(!ENV_FILE_CONTENT.contains("WHICH_CODE_HOME"));
    }

    #[test]
    fn test_env_file_case_colon_guard_pattern() {
        // The case-colon guard must use THIS_CODE_HOME/bin (not a hardcoded path).
        assert!(ENV_FILE_CONTENT.contains("${THIS_CODE_HOME}/bin"));
        assert!(ENV_FILE_CONTENT.contains("case \":${PATH}:\""));
    }

    #[test]
    fn test_fish_file_uses_fish_add_path_prepend() {
        assert!(FISH_FILE_CONTENT.contains("fish_add_path --prepend"));
        // Must not use eval or set -gx (old fish patterns).
        assert!(!FISH_FILE_CONTENT.contains("set -gx"));
        assert!(!FISH_FILE_CONTENT.contains("eval"));
    }

    #[test]
    fn test_env_file_is_posix_sh() {
        assert!(ENV_FILE_CONTENT.starts_with("#!/bin/sh"));
    }
}
