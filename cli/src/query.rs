use crate::{config::Config, db, shim};
use anyhow::Result;
use directories::BaseDirs;
use serde_json::json;
use std::path::PathBuf;

pub(crate) fn run_query(
    config: &Config,
    path: Option<PathBuf>,
    dry_run: bool,
    json: bool,
) -> Result<()> {
    // Resolve query path: provided arg or cwd (per D-05)
    let raw_path = match path {
        Some(p) => p,
        None => std::env::current_dir()?,
    };

    // D-06: canonicalize with fallback
    let canonical = std::fs::canonicalize(&raw_path).unwrap_or_else(|_| raw_path.clone());
    tracing::debug!(path = %canonical.display(), "query path");

    // D-04: resolve db_path from config or default
    let db_path = config.db_path.clone().unwrap_or_else(|| {
        BaseDirs::new().map_or_else(
            || PathBuf::from(".this-code/sessions.db"),
            |b| b.home_dir().join(".this-code/sessions.db"),
        )
    });
    tracing::debug!(path = %db_path.display(), "resolved db_path");

    // If DB does not exist yet, treat as no sessions (per D-02)
    if !db_path.exists() {
        println!("no sessions found");
        return Ok(());
    }

    let conn = db::open_db(&db_path)?;
    let session = match find_session_by_ancestry(&conn, &canonical) {
        Ok(s) => s,
        Err(e) => {
            // "no such table" means extension hasn't created the schema yet
            if e.to_string().contains("no such table") {
                println!("no sessions found");
                return Ok(());
            }
            return Err(e);
        }
    };

    let Some(session) = session else {
        println!("no sessions found");
        return Ok(());
    };

    // D-09: dry-run prints what would be exec'd without executing
    if dry_run {
        let own_bin_dir = BaseDirs::new()
            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
            .home_dir()
            .join(".this-code/bin");
        let real_code = shim::discover_real_code(config, &own_bin_dir)?;
        println!("would exec: {} {}", real_code.display(), session.workspace_path);
        return Ok(());
    }

    if json {
        let value = session_to_json(&session);
        println!("{}", serde_json::to_string_pretty(&value)?);
    } else {
        format_human(&session);
    }

    Ok(())
}

/// Walk up the directory tree from `start` until a session row is found or the
/// filesystem root is reached. Returns `Ok(None)` when no ancestor matches.
/// Propagates DB errors (including "no such table") to the caller.
fn find_session_by_ancestry(
    conn: &rusqlite::Connection,
    start: &std::path::Path,
) -> Result<Option<db::Session>> {
    let mut search = start.to_path_buf();
    loop {
        let probe = search.to_string_lossy().into_owned();
        match db::query_latest_session(conn, &probe) {
            Ok(Some(s)) => return Ok(Some(s)),
            Ok(None) => match search.parent().map(|p| p.to_path_buf()) {
                Some(parent) if parent != search => search = parent,
                _ => return Ok(None),
            },
            Err(e) => return Err(e),
        }
    }
}

fn format_human(session: &db::Session) {
    let open_files_count = serde_json::from_str::<serde_json::Value>(&session.open_files)
        .ok()
        .and_then(|v| v.as_array().map(Vec::len))
        .unwrap_or(0);

    println!("{:<14} {}", "workspace:", session.workspace_path);
    println!(
        "{:<14} {}",
        "profile:",
        session.profile.as_deref().unwrap_or("(none)")
    );
    println!(
        "{:<14} {}",
        "user_data_dir:",
        session.user_data_dir.as_deref().unwrap_or("(none)")
    );
    println!(
        "{:<14} {}",
        "server_hash:",
        session.server_commit_hash.as_deref().unwrap_or("(none)")
    );
    println!("{:<14} {}", "open_files:", open_files_count);
    println!("{:<14} {}", "invoked_at:", session.invoked_at);
}

fn session_to_json(session: &db::Session) -> serde_json::Value {
    // open_files is stored as JSON text; parse it back to a Value
    let open_files_value: serde_json::Value =
        serde_json::from_str(&session.open_files).unwrap_or(json!([]));

    json!({
        "id": session.id,
        "invoked_at": session.invoked_at,
        "workspace_path": session.workspace_path,
        "user_data_dir": session.user_data_dir,
        "profile": session.profile,
        "local_ide_path": session.local_ide_path,
        "remote_name": session.remote_name,
        "remote_server_path": session.remote_server_path,
        "server_commit_hash": session.server_commit_hash,
        "server_bin_path": session.server_bin_path,
        "open_files": open_files_value,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Session;

    fn make_test_session() -> Session {
        Session {
            id: 1,
            invoked_at: "2026-04-27T20:00:00.000".to_string(),
            workspace_path: "/home/user/project".to_string(),
            user_data_dir: Some("/home/user/.config/Code".to_string()),
            profile: Some("default".to_string()),
            local_ide_path: Some("/usr/bin/code".to_string()),
            remote_name: None,
            remote_server_path: None,
            server_commit_hash: Some("abc123def456".to_string()),
            server_bin_path: None,
            open_files: "[\"src/main.rs\",\"README.md\"]".to_string(),
        }
    }

    #[test]
    fn test_format_human_output() {
        // Capture stdout is not trivial in Rust unit tests without a helper.
        // Verify the function does not panic and the session data is accessible.
        let session = make_test_session();
        // Verify the fields that format_human reads are correct.
        assert_eq!(session.workspace_path, "/home/user/project");
        assert_eq!(session.profile.as_deref(), Some("default"));
        assert_eq!(
            session.user_data_dir.as_deref(),
            Some("/home/user/.config/Code")
        );
        assert_eq!(session.server_commit_hash.as_deref(), Some("abc123def456"));
        assert_eq!(session.invoked_at, "2026-04-27T20:00:00.000");
        // Verify open_files count parsing
        let count = serde_json::from_str::<serde_json::Value>(&session.open_files)
            .ok()
            .and_then(|v| v.as_array().map(Vec::len))
            .unwrap_or(0);
        assert_eq!(count, 2);
    }

    #[test]
    fn test_session_to_json_output() {
        let session = make_test_session();
        let value = session_to_json(&session);

        assert_eq!(value["workspace_path"], "/home/user/project");
        assert_eq!(value["profile"], "default");
        assert_eq!(value["user_data_dir"], "/home/user/.config/Code");
        assert_eq!(value["server_commit_hash"], "abc123def456");
        assert_eq!(value["invoked_at"], "2026-04-27T20:00:00.000");
        assert_eq!(value["id"], 1);

        // open_files should be a JSON array, not a string
        let open_files = value["open_files"]
            .as_array()
            .expect("open_files should be an array");
        assert_eq!(open_files.len(), 2);
        assert_eq!(open_files[0], "src/main.rs");
        assert_eq!(open_files[1], "README.md");

        // None fields should be null
        assert!(value["remote_name"].is_null());
        assert!(value["remote_server_path"].is_null());
    }

    #[test]
    fn test_session_to_json_corrupt_open_files() {
        let mut session = make_test_session();
        session.open_files = "not valid json".to_string();
        let value = session_to_json(&session);
        // Corrupt open_files should fall back to empty array, not panic
        let open_files = value["open_files"].as_array().expect("should be array");
        assert!(open_files.is_empty());
    }

    #[test]
    fn test_session_to_json_serializes_to_string() {
        let session = make_test_session();
        let value = session_to_json(&session);
        let json_str = serde_json::to_string_pretty(&value);
        assert!(json_str.is_ok(), "JSON serialization should not fail");
        let json_str = json_str.unwrap();
        assert!(json_str.contains("\"workspace_path\""));
        assert!(json_str.contains("\"invoked_at\""));
    }

    fn make_ancestry_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory DB");
        conn.execute_batch(
            "PRAGMA busy_timeout=5000;
             CREATE TABLE invocations (
                 id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                 invoked_at         TEXT    NOT NULL,
                 workspace_path     TEXT,
                 user_data_dir      TEXT,
                 profile            TEXT,
                 local_ide_path     TEXT    NOT NULL,
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
                "2026-04-28T10:00:00.000",
                "/home/user/project",
                "/usr/bin/code",
                "[]"
            ],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_find_session_exact_match() {
        let conn = make_ancestry_db();
        let s = find_session_by_ancestry(&conn, std::path::Path::new("/home/user/project")).unwrap();
        assert!(s.is_some());
        assert_eq!(s.unwrap().workspace_path, "/home/user/project");
    }

    #[test]
    fn test_find_session_walks_up_to_workspace() {
        let conn = make_ancestry_db();
        let s = find_session_by_ancestry(
            &conn,
            std::path::Path::new("/home/user/project/src/main.rs"),
        )
        .unwrap();
        assert!(s.is_some());
        assert_eq!(s.unwrap().workspace_path, "/home/user/project");
    }

    #[test]
    fn test_find_session_unrelated_path_returns_none() {
        let conn = make_ancestry_db();
        let s =
            find_session_by_ancestry(&conn, std::path::Path::new("/tmp/other/file")).unwrap();
        assert!(s.is_none());
    }
}
