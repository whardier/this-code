import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { Database, initDatabase } from "./db";
import { collectSessionMetadata, getSessionJsonPath } from "./session";
import { writeSessionJson, scanExistingRemoteSessions } from "./storage";
import { isEnabled, getLogLevel } from "./config";
import { checkCliPresence } from "./cliDetect";

let db: Database | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let currentInvocationId: number | undefined;

function log(level: "info" | "debug", message: string): void {
  const currentLevel = getLogLevel();
  if (currentLevel === "off") {
    return;
  }
  if (level === "debug" && currentLevel !== "debug") {
    return;
  }
  outputChannel?.appendLine(`[${level}] ${message}`);
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("This Code");
  context.subscriptions.push(outputChannel);

  log("info", "This Code activating...");

  if (!isEnabled()) {
    // Log even when disabled — user needs to know why nothing happens
    outputChannel.appendLine(
      "[info] This Code is disabled via thisCode.enable. Set thisCode.enable to true to enable session recording.",
    );
    return;
  }

  try {
    const thisCodeDir = path.join(os.homedir(), ".this-code");
    await fs.mkdir(thisCodeDir, { recursive: true });
    await fs.mkdir(path.join(thisCodeDir, "sessions"), { recursive: true });
    log("debug", `Ensured directories: ${thisCodeDir}`);

    const dbPath = path.join(thisCodeDir, "sessions.db");
    db = new Database(dbPath);
    await initDatabase(db);
    log("info", `Database initialized: ${dbPath}`);

    const metadata = collectSessionMetadata(context);

    // CRITICAL: Log globalStorageUri.fsPath for empirical D-01 validation (RESEARCH.md open question)
    log(
      "debug",
      `globalStorageUri.fsPath = ${context.globalStorageUri.fsPath}`,
    );
    log("debug", `workspace_path = ${metadata.workspace_path ?? "(none)"}`);
    log("debug", `remote_name = ${metadata.remote_name ?? "(local)"}`);
    log(
      "debug",
      `server_commit_hash = ${metadata.server_commit_hash ?? "(not SSH remote)"}`,
    );
    log("debug", `user_data_dir = ${metadata.user_data_dir ?? "(null)"}`);
    log(
      "debug",
      `profile = ${metadata.profile ?? "(null — default profile or parse failed)"}`,
    );
    log("debug", `local_ide_path = ${metadata.local_ide_path}`);

    const sessionJsonPath = getSessionJsonPath(metadata);
    await writeSessionJson(sessionJsonPath, metadata);
    log("info", `Session JSON written: ${sessionJsonPath}`);

    const result = await db.run(
      `INSERT INTO invocations
       (workspace_path, user_data_dir, profile, local_ide_path,
        remote_name, remote_server_path, server_commit_hash, server_bin_path, open_files)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metadata.workspace_path,
        metadata.user_data_dir,
        metadata.profile,
        metadata.local_ide_path,
        metadata.remote_name,
        metadata.remote_server_path,
        metadata.server_commit_hash,
        metadata.remote_server_path,
        "[]",
      ],
    );
    currentInvocationId = result.lastID;
    log("info", `Invocation recorded. ID: ${currentInvocationId}`);

    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(() => {
        log("debug", "onDidOpenTextDocument fired — rebuilding open_files");
        if (db && currentInvocationId !== undefined) {
          updateOpenFiles(db, currentInvocationId).catch(() => {});
        }
      }),
      vscode.workspace.onDidCloseTextDocument(() => {
        log("debug", "onDidCloseTextDocument fired — rebuilding open_files");
        if (db && currentInvocationId !== undefined) {
          updateOpenFiles(db, currentInvocationId).catch(() => {});
        }
      }),
    );

    log("info", "Starting background session scan...");
    // Fire-and-forget — do NOT await (Pitfall 6)
    scanExistingRemoteSessions(db).catch((err) => {
      log("info", `Startup scan error: ${(err as Error).message}`);
    });

    // Fire-and-forget — do NOT await (D-04: non-blocking, never delays session recording)
    checkCliPresence().catch(() => {});

    log(
      "info",
      `This Code activated successfully. Invocation ID: ${currentInvocationId}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Always emit activation errors regardless of logLevel — user must know activation failed
    outputChannel?.appendLine(`[info] This Code activation failed: ${msg}`);
  }
}

export async function deactivate(): Promise<void> {
  log("info", "This Code deactivating...");
  try {
    await db?.close();
    log("debug", "Database closed.");
  } catch {
    // Best-effort close
  }
}

async function updateOpenFiles(db: Database, rowId: number): Promise<void> {
  // D-02: Rebuild from authoritative live list on every event.
  // Prevents false positives from language mode changes (VS Code issue #102737):
  // language detection fires close+open for same document; isClosed is false during the spurious close.
  const openFiles = vscode.workspace.textDocuments
    .filter((doc) => !doc.isClosed && doc.uri.scheme === "file")
    .map((doc) => doc.uri.fsPath);
  log("debug", `open_files rebuilt: ${openFiles.length} file(s)`);
  try {
    await db.run("UPDATE invocations SET open_files = ? WHERE id = ?", [
      JSON.stringify(openFiles),
      rowId,
    ]);
  } catch {
    // DB error during update — swallow to avoid crashing the extension host
  }
}
