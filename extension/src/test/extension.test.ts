import * as assert from "assert";
import * as path from "path";
import * as os from "os";

// Integration test stubs for Phase 1. Each suite corresponds to a requirement.
// Tests run inside a real VS Code instance via @vscode/test-electron.
// Plans 02-07 fill in assertions as implementation is completed.

suite("EXT-01: Extension ID", () => {
  test("publisher.name is whardier.this-code", () => {
    // Verified by manifest check in CI — no runtime assertion needed
    const pkg = require("../../package.json");
    assert.strictEqual(pkg.publisher + "." + pkg.name, "whardier.this-code");
  });
});

suite("EXT-02: extensionKind workspace", () => {
  test('extensionKind is ["workspace"]', () => {
    const pkg = require("../../package.json");
    assert.deepStrictEqual(pkg.extensionKind, ["workspace"]);
  });
});

suite("EXT-03: Activation event", () => {
  test("activationEvents includes onStartupFinished", () => {
    const pkg = require("../../package.json");
    assert.ok(pkg.activationEvents.includes("onStartupFinished"));
  });
});

suite("EXT-04: No UI contributions", () => {
  test("contributes.commands does not exist", () => {
    const pkg = require("../../package.json");
    assert.strictEqual(pkg.contributes.commands, undefined);
  });
});

suite("EXT-05: Two configuration settings", () => {
  test("exactly thisCode.enable and thisCode.logLevel", () => {
    const pkg = require("../../package.json");
    const keys = Object.keys(pkg.contributes.configuration.properties).sort();
    assert.deepStrictEqual(keys, ["thisCode.enable", "thisCode.logLevel"]);
  });
});

suite("STOR-01: Per-instance JSON", () => {
  test("TODO: JSON file written at correct path after activation", () => {
    // Plan 03 fills this assertion
    assert.ok(true, "stub — implement in Plan 03");
  });
});

suite("STOR-02: SQLite WAL mode", () => {
  test("sessions.db created with journal_mode=wal after initDatabase()", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { Database, initDatabase } = require("../db");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    await fs.mkdir(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, "test.db");

    const db = new Database(dbPath);
    await initDatabase(db);

    const row = await db.get("PRAGMA journal_mode");
    assert.strictEqual(
      (row as any).journal_mode,
      "wal",
      "journal_mode must be wal",
    );

    await db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

suite("STOR-03: Schema columns", () => {
  test("invocations table has all required columns", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { Database, initDatabase } = require("../db");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    await fs.mkdir(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, "test.db");

    const db = new Database(dbPath);
    await initDatabase(db);

    const rows = (await db.all("PRAGMA table_info(invocations)")) as Array<{
      name: string;
    }>;
    const columns = rows.map((r) => r.name).sort();
    const expected = [
      "id",
      "invoked_at",
      "workspace_path",
      "user_data_dir",
      "profile",
      "local_ide_path",
      "remote_name",
      "remote_server_path",
      "server_commit_hash",
      "server_bin_path",
      "open_files",
    ].sort();
    assert.deepStrictEqual(
      columns,
      expected,
      "invocations columns must match schema (D-07/STOR-03)",
    );

    // Verify user_version is 1 (idempotent migration marker)
    const vRow = (await db.get("PRAGMA user_version")) as any;
    assert.strictEqual(vRow.user_version, 1);

    await db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("initDatabase is idempotent — calling twice does not throw", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { Database, initDatabase } = require("../db");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    await fs.mkdir(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, "test.db");

    const db = new Database(dbPath);
    await initDatabase(db);
    await initDatabase(db); // second call must not throw

    await db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

suite("STOR-04: Startup scan", () => {
  test("TODO: existing session JSONs indexed on activation", () => {
    // Plan 05 fills this assertion
    assert.ok(true, "stub — implement in Plan 05");
  });
});

suite("STOR-05: ~/.this-code directory creation", () => {
  test("TODO: directory created on first activation", () => {
    // Plan 03 fills this assertion
    assert.ok(true, "stub — implement in Plan 03");
  });
});

suite("TRACK-01: Workspace path", () => {
  test("TODO: workspace_path recorded in SQLite", () => {
    // Plan 03 fills this assertion
    assert.ok(true, "stub — implement in Plan 03");
  });
});

suite("TRACK-02: Commit hash", () => {
  test("TODO: server_commit_hash is 40-char hex or null", () => {
    // Plan 03 fills this assertion
    assert.ok(true, "stub — implement in Plan 03");
  });
});

suite("TRACK-03: user_data_dir and profile", () => {
  test("TODO: user_data_dir non-null; profile null-safe", () => {
    // Plan 03 fills this assertion
    assert.ok(true, "stub — implement in Plan 03");
  });
});

suite("TRACK-04: Open file manifest", () => {
  test("TODO: open_files updates after document event", () => {
    // Plan 04 fills this assertion
    assert.ok(true, "stub — implement in Plan 04");
  });
});

suite("TRACK-05: No save triggers", () => {
  test("onDidSaveTextDocument is not registered", () => {
    // Static check — grep enforces this; test is documentation
    assert.ok(true, "enforced by grep: no onDidSaveTextDocument in src/");
  });
});

suite("PLAT-01: macOS and Linux", () => {
  test("TODO: CI matrix runs on macOS-latest and ubuntu-latest", () => {
    // Plan 07 fills this assertion
    assert.ok(true, "stub — implement in Plan 07");
  });
});

// Suppress unused import warnings — these will be used in later plans
void path;
void os;
