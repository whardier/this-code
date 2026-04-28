use crate::{config::Config, db, query};
use anyhow::Result;
use directories::BaseDirs;
use std::path::PathBuf;

pub(crate) fn run_which(config: &Config, path: Option<PathBuf>, json: bool) -> Result<()> {
    // Resolve query path: provided arg or cwd (mirrors query.rs D-05 pattern)
    let raw_path = match path {
        Some(p) => p,
        None => std::env::current_dir()?,
    };

    // D-06: canonicalize with fallback
    let canonical = std::fs::canonicalize(&raw_path).unwrap_or_else(|_| raw_path.clone());
    tracing::debug!(path = %canonical.display(), "which path");

    // Discover the real code binary (D-04 priority chain)
    let own_bin_dir = BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
        .home_dir()
        .join(".this-code/bin");
    let real_code = crate::shim::discover_real_code(config, &own_bin_dir)?;
    tracing::debug!(binary = %real_code.display(), "discovered real code binary");

    // Optional session lookup — no DB or no session is not an error
    let workspace: Option<String> = lookup_workspace(config, &canonical);

    if json {
        let value = serde_json::json!({
            "binary": real_code.to_string_lossy(),
            "workspace": workspace,
        });
        println!("{}", serde_json::to_string_pretty(&value)?);
    } else {
        println!("{:<11} {}", "binary:", real_code.display());
        if let Some(ref ws) = workspace {
            println!("{:<11} {}", "workspace:", ws);
        }
    }

    Ok(())
}

/// Look up the nearest matching workspace via ancestry walk.
///
/// Returns `None` for any of:
/// - DB does not exist
/// - `invocations` table not yet created (extension not yet activated)
/// - No matching row found for any ancestor of `start`
/// - Any other DB error (logged at debug level, not propagated)
fn lookup_workspace(config: &Config, start: &std::path::Path) -> Option<String> {
    let db_path = config.db_path.clone().unwrap_or_else(|| {
        BaseDirs::new().map_or_else(
            || PathBuf::from(".this-code/sessions.db"),
            |b| b.home_dir().join(".this-code/sessions.db"),
        )
    });

    if !db_path.exists() {
        tracing::debug!("sessions.db not found — skipping workspace lookup");
        return None;
    }

    let conn = match db::open_db(&db_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::debug!(error = %e, "failed to open sessions.db");
            return None;
        }
    };

    match query::find_session_by_ancestry(&conn, start) {
        Ok(Some(s)) => Some(s.workspace_path),
        Ok(None) => None,
        Err(e) => {
            // "no such table" is expected when extension hasn't activated yet
            tracing::debug!(error = %e, "session lookup failed");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    fn test_config() -> Config {
        Config {
            code_path: None,
            db_path: None,
        }
    }

    #[test]
    fn test_lookup_workspace_missing_db_returns_none() {
        let config = test_config();
        let result = lookup_workspace(
            &config,
            std::path::Path::new("/nonexistent/db/path/project"),
        );
        assert!(result.is_none());
    }

    #[test]
    fn test_lookup_workspace_with_none_db_path() {
        // db_path = None falls through to ~/.this-code/sessions.db default,
        // which will not exist in the test environment — verifies graceful exit 0.
        let config = test_config();
        let result = lookup_workspace(&config, std::path::Path::new("/tmp/no-such-dir/project"));
        assert!(result.is_none());
    }

    #[test]
    fn test_lookup_workspace_with_explicit_db_path() {
        use rusqlite::Connection;

        // Create a real temp DB file with one session row
        let tmp = tempfile::NamedTempFile::new().expect("temp file");
        let db_path = tmp.path().to_path_buf();

        {
            let conn = Connection::open(&db_path).expect("open temp db");
            conn.execute_batch(
                "PRAGMA busy_timeout = 5000;
                 CREATE TABLE invocations (
                     id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                     invoked_at         TEXT    NOT NULL,
                     workspace_path     TEXT,
                     user_data_dir      TEXT,
                     profile            TEXT,
                     local_ide_path     TEXT    NOT NULL DEFAULT '',
                     remote_name        TEXT,
                     remote_server_path TEXT,
                     server_commit_hash TEXT,
                     server_bin_path    TEXT,
                     open_files         TEXT    NOT NULL DEFAULT '[]'
                 );",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO invocations (invoked_at, workspace_path, local_ide_path, open_files)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    "2026-04-28T12:00:00.000",
                    "/home/user/project",
                    "/usr/bin/code",
                    "[]"
                ],
            )
            .unwrap();
        }

        let config = Config {
            code_path: None,
            db_path: Some(db_path),
        };

        let result = lookup_workspace(&config, std::path::Path::new("/home/user/project/src"));
        assert_eq!(result.as_deref(), Some("/home/user/project"));
    }
}
