import sqlite3 from "@vscode/sqlite3";

export class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
    // open errors surface on the first .run()/.get() call via their own callbacks
  }

  run(sql: string, params: unknown[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(
        sql,
        params,
        function (this: sqlite3.RunResult, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve(this);
          }
        },
      );
    });
  }

  get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err: Error | null, row: T) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err: Error | null, rows: T[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

export async function initDatabase(db: Database): Promise<void> {
  // Step 1: WAL mode — MUST run before any DDL. Creates .db-wal and .db-shm files.
  await db.run("PRAGMA journal_mode=WAL");
  // Step 2: Busy timeout — CLI reader may hold a read lock; 5000ms prevents immediate SQLITE_BUSY errors
  await db.run("PRAGMA busy_timeout=5000");
  // Step 3: Schema migration — idempotent via user_version check
  const versionRow = await db.get<{ user_version: number }>(
    "PRAGMA user_version",
  );
  if ((versionRow?.user_version ?? 0) < 1) {
    await db.run(`CREATE TABLE IF NOT EXISTS invocations (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      invoked_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
      workspace_path     TEXT,
      user_data_dir      TEXT,
      profile            TEXT,
      local_ide_path     TEXT    NOT NULL,
      remote_name        TEXT,
      remote_server_path TEXT,
      server_commit_hash TEXT,
      server_bin_path    TEXT,
      open_files         TEXT    NOT NULL DEFAULT '[]'
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_invocations_workspace
      ON invocations(workspace_path)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_invocations_time
      ON invocations(invoked_at DESC)`);
    // Mark schema version — future migrations check this first
    await db.run("PRAGMA user_version = 1");
  }
}
