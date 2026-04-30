use anyhow::Result;
use rusqlite::{Connection, OpenFlags, OptionalExtension as _};
use std::path::Path;

#[derive(Debug)]
pub(crate) struct Session {
    pub(crate) id: i64,
    pub(crate) invoked_at: String,
    pub(crate) workspace_path: String,
    pub(crate) user_data_dir: Option<String>,
    pub(crate) profile: Option<String>,
    #[allow(dead_code)]
    pub(crate) local_ide_path: Option<String>,
    #[allow(dead_code)]
    pub(crate) remote_name: Option<String>,
    pub(crate) remote_server_path: Option<String>,
    pub(crate) server_commit_hash: Option<String>,
    #[allow(dead_code)]
    pub(crate) server_bin_path: Option<String>,
    pub(crate) open_files: String,
    pub(crate) ipc_hook_cli: Option<String>,
}

pub(crate) fn open_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
    // Add ipc_hook_cli column if the extension hasn't run its v2 migration yet.
    // Error is intentionally ignored: "no such table" (DB not yet initialized)
    // and "duplicate column name" (column already exists) are both expected.
    let _ = conn.execute_batch("ALTER TABLE invocations ADD COLUMN ipc_hook_cli TEXT");
    Ok(conn)
}

pub(crate) fn query_latest_session(conn: &Connection, workspace: &str) -> Result<Option<Session>> {
    conn.query_row(
        "SELECT id, invoked_at, workspace_path, user_data_dir, profile,
                local_ide_path, remote_name, remote_server_path,
                server_commit_hash, server_bin_path, open_files, ipc_hook_cli
         FROM invocations
         WHERE workspace_path = ?1
         ORDER BY invoked_at DESC
         LIMIT 1",
        rusqlite::params![workspace],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                invoked_at: row.get(1)?,
                workspace_path: row.get(2)?,
                user_data_dir: row.get(3)?,
                profile: row.get(4)?,
                local_ide_path: row.get(5)?,
                remote_name: row.get(6)?,
                remote_server_path: row.get(7)?,
                server_commit_hash: row.get(8)?,
                server_bin_path: row.get(9)?,
                open_files: row.get(10)?,
                ipc_hook_cli: row.get(11)?,
            })
        },
    )
    .optional()
    .map_err(anyhow::Error::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn make_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        conn.execute_batch("PRAGMA busy_timeout = 5000;").unwrap();
        conn.execute_batch(
            "CREATE TABLE invocations (
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
                open_files         TEXT    NOT NULL DEFAULT '[]',
                ipc_hook_cli       TEXT
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_query_latest_session_empty_table() {
        let conn = make_test_db();
        let result = query_latest_session(&conn, "/some/path").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_query_latest_session_returns_most_recent() {
        let conn = make_test_db();
        conn.execute(
            "INSERT INTO invocations
             (invoked_at, workspace_path, local_ide_path, open_files)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "2026-04-27T10:00:00.000",
                "/home/user/project",
                "/usr/bin/code",
                "[]"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO invocations
             (invoked_at, workspace_path, local_ide_path, open_files)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "2026-04-27T20:00:00.000",
                "/home/user/project",
                "/usr/bin/code",
                "[\"file.rs\"]"
            ],
        )
        .unwrap();
        let session = query_latest_session(&conn, "/home/user/project")
            .unwrap()
            .expect("should find a session");
        assert_eq!(session.invoked_at, "2026-04-27T20:00:00.000");
    }

    #[test]
    fn test_query_latest_session_workspace_mismatch() {
        let conn = make_test_db();
        conn.execute(
            "INSERT INTO invocations
             (invoked_at, workspace_path, local_ide_path, open_files)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "2026-04-27T10:00:00.000",
                "/home/user/project-a",
                "/usr/bin/code",
                "[]"
            ],
        )
        .unwrap();
        let result = query_latest_session(&conn, "/home/user/project-b").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_no_such_table_is_detectable() {
        // Empty DB with no invocations table — query_latest_session returns an error
        // whose message contains "no such table". query.rs uses this to detect
        // the "extension not yet installed" case.
        let conn = Connection::open_in_memory().expect("in-memory DB");
        let result = query_latest_session(&conn, "/some/path");
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("no such table"),
            "Expected 'no such table' in error, got: {err_msg}"
        );
    }
}
