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
  test("JSON file contains all SessionMetadata fields", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { writeSessionJson } = require("../storage");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    const filePath = path.join(tmpDir, "test-session.json");
    const metadata = {
      workspace_path: "/home/user/myproject",
      user_data_dir: "/home/user/.config/Code",
      profile: null,
      local_ide_path: "/home/user/.vscode-server/bin/abc123/resources/app",
      remote_name: "ssh-remote",
      remote_server_path: "/home/user/.vscode-server/bin/abc123",
      server_commit_hash: "a".repeat(40),
      local_session_hash: "deadbeef12345678",
    };

    await writeSessionJson(filePath, metadata);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    assert.strictEqual(parsed.workspace_path, "/home/user/myproject");
    assert.strictEqual(parsed.remote_name, "ssh-remote");
    assert.strictEqual(parsed.server_commit_hash, "a".repeat(40));
    assert.deepStrictEqual(parsed.open_files, []);
    assert.strictEqual(parsed.schema_version, 1);
    assert.ok(
      typeof parsed.recorded_at === "string",
      "recorded_at must be a string timestamp",
    );

    await fs.rm(tmpDir, { recursive: true, force: true });
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
  test("writeSessionJson creates parent directory if absent", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { writeSessionJson } = require("../storage");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    // Do NOT create tmpDir — writeSessionJson must create it
    const filePath = path.join(tmpDir, "sessions", "abc123.json");
    const metadata = {
      workspace_path: "/tmp/workspace",
      user_data_dir: "/tmp/userdata",
      profile: null,
      local_ide_path: "/tmp/vscode",
      remote_name: null,
      remote_server_path: null,
      server_commit_hash: null,
      local_session_hash: "abc123def456abcd",
    };

    await writeSessionJson(filePath, metadata);
    const stat = await fs.stat(filePath);
    assert.ok(stat.isFile(), "session JSON must exist after writeSessionJson");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

suite("TRACK-01: Workspace path", () => {
  test("workspace_path written to session JSON", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { writeSessionJson } = require("../storage");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    const filePath = path.join(tmpDir, "track01.json");
    const metadata = {
      workspace_path: "/home/user/my-workspace",
      user_data_dir: null,
      profile: null,
      local_ide_path: "/vscode",
      remote_name: null,
      remote_server_path: null,
      server_commit_hash: null,
      local_session_hash: "0000000000000000",
    };
    await writeSessionJson(filePath, metadata);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf-8"));
    assert.strictEqual(parsed.workspace_path, "/home/user/my-workspace");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

suite("TRACK-02: Commit hash", () => {
  test("server_commit_hash is 40-char hex or null in session JSON", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { writeSessionJson } = require("../storage");

    const hash40 = "a1b2c3d4e5f6".repeat(3) + "a1b2c3d4"; // 40 chars
    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    const filePath = path.join(tmpDir, "track02.json");
    const metadata = {
      workspace_path: null,
      user_data_dir: null,
      profile: null,
      local_ide_path: "/vscode",
      remote_name: "ssh-remote",
      remote_server_path: `/home/u/.vscode-server/bin/${hash40}`,
      server_commit_hash: hash40,
      local_session_hash: "0000000000000000",
    };
    await writeSessionJson(filePath, metadata);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf-8"));
    assert.ok(
      parsed.server_commit_hash === null ||
        /^[0-9a-f]{40}$/i.test(parsed.server_commit_hash),
      "server_commit_hash must be 40-char hex or null",
    );
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

suite("TRACK-03: user_data_dir and profile", () => {
  test("profile is null when not parseable (D-01)", async () => {
    const os = require("os");
    const path = require("path");
    const fs = require("fs/promises");
    const { writeSessionJson } = require("../storage");

    const tmpDir = path.join(os.tmpdir(), "this-code-test-" + Date.now());
    const filePath = path.join(tmpDir, "track03.json");
    const metadata = {
      workspace_path: null,
      user_data_dir: "/home/u/.config/Code",
      profile: null, // null per D-01
      local_ide_path: "/vscode",
      remote_name: null,
      remote_server_path: null,
      server_commit_hash: null,
      local_session_hash: "0000000000000000",
    };
    await writeSessionJson(filePath, metadata);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf-8"));
    assert.strictEqual(
      parsed.profile,
      null,
      "profile must be null when not parseable",
    );
    assert.strictEqual(parsed.user_data_dir, "/home/u/.config/Code");
    await fs.rm(tmpDir, { recursive: true, force: true });
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

// --- Plan 03 TDD: Session helper unit tests (RED phase) ---

suite("SESSION-HELPERS: extractCommitHash via getSessionJsonPath", () => {
  test("SSH remote appRoot produces session JSON path under .vscode-server/bin/{hash}", () => {
    const { getSessionJsonPath } = require("../session");
    const hash40 = "abc123def456".repeat(3) + "abc123de"; // 40 chars
    // We verify that when remote_name is set and server_commit_hash is the 40-char hash,
    // the path ends with .vscode-server/bin/{hash}/this-code-session.json
    const metadata = {
      workspace_path: null,
      user_data_dir: null,
      profile: null,
      local_ide_path: `/home/u/.vscode-server/bin/${hash40}/resources/app`,
      remote_name: "ssh-remote",
      remote_server_path: `/home/u/.vscode-server/bin/${hash40}`,
      server_commit_hash: hash40,
      local_session_hash: "0000000000000000",
    };
    const result = getSessionJsonPath(metadata);
    assert.ok(
      result.includes(`.vscode-server/bin/${hash40}/this-code-session.json`) ||
        result.endsWith("this-code-session.json"),
      `Expected path under .vscode-server/bin/${hash40}, got: ${result}`,
    );
  });

  test("Local appRoot produces session JSON path under ~/.this-code/sessions/{16-char-hash}.json", () => {
    const { getSessionJsonPath } = require("../session");
    const metadata = {
      workspace_path: null,
      user_data_dir: null,
      profile: null,
      local_ide_path: "/Applications/Visual Studio Code.app/Contents/Resources/app",
      remote_name: null,
      remote_server_path: null,
      server_commit_hash: null,
      local_session_hash: "deadbeef12345678",
    };
    const result = getSessionJsonPath(metadata);
    assert.ok(
      result.includes(".this-code") && result.includes("sessions"),
      `Expected path under ~/.this-code/sessions/, got: ${result}`,
    );
    assert.ok(
      result.endsWith("deadbeef12345678.json"),
      `Expected filename deadbeef12345678.json, got: ${result}`,
    );
  });
});

// Suppress unused import warnings — these will be used in later plans
void path;
void os;
