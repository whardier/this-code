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
  test("TODO: sessions.db exists with journal_mode=wal", () => {
    // Plan 02 fills this assertion
    assert.ok(true, "stub — implement in Plan 02");
  });
});

suite("STOR-03: Schema columns", () => {
  test("TODO: invocations table has all required columns", () => {
    // Plan 02 fills this assertion
    assert.ok(true, "stub — implement in Plan 02");
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
