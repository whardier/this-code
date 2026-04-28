use anyhow::Result;
use directories::BaseDirs;
use figment::{
    Figment,
    providers::{Env, Format, Toml},
};
use serde::Deserialize;
use std::path::PathBuf;

/// Configuration loaded from `~/.this-code/config.toml` and `THIS_CODE_*` env vars.
#[derive(Deserialize, Default, Debug, Clone)]
pub(crate) struct Config {
    /// Explicit path to the real `code` binary.
    ///
    /// Set via `THIS_CODE_CODE_PATH` env var or `code_path` key in `~/.this-code/config.toml`.
    /// When `None`, the shim auto-discovers via PATH stripping + `which`.
    pub(crate) code_path: Option<PathBuf>,

    /// Explicit path to the sessions `SQLite` database.
    ///
    /// Set via `THIS_CODE_DB_PATH` env var or `db_path` key in `~/.this-code/config.toml`.
    /// When `None`, defaults to `~/.this-code/sessions.db`.
    #[allow(dead_code)]
    pub(crate) db_path: Option<PathBuf>,
}

/// Load configuration from `~/.this-code/config.toml` and `THIS_CODE_*` env vars.
///
/// Merge order (later wins):
/// 1. `~/.this-code/config.toml` — file config (silently ignored if absent)
/// 2. `THIS_CODE_*` env vars — runtime overrides
///
/// # Key mapping
///
/// `THIS_CODE_CODE_PATH` → strips prefix → `CODE_PATH` → lowercased → `code_path`
///
/// CRITICAL: Do NOT add `.split("_")` to `Env::prefixed(...)`.
/// Adding `.split("_")` would map `CODE_PATH` → `code.path` (nested key),
/// which does NOT match the flat `code_path` field and silently ignores the env var.
pub(crate) fn load_config() -> Result<Config> {
    let config_path = BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
        .home_dir()
        .join(".this-code/config.toml");

    // Toml::file silently returns empty data when the file is absent (required=false default).
    // No special error handling needed for first-run when config.toml does not exist.
    let config: Config = Figment::new()
        .merge(Toml::file(&config_path))
        // Env::prefixed WITHOUT .split("_"):
        // THIS_CODE_CODE_PATH → strip "THIS_CODE_" → "CODE_PATH" → lowercase → "code_path"
        // This matches Config.code_path directly.
        .merge(Env::prefixed("THIS_CODE_"))
        .extract()
        .unwrap_or_default();

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default_is_all_none() {
        let config = Config::default();
        assert!(config.code_path.is_none());
        assert!(config.db_path.is_none());
    }
}
