import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { Database, initDatabase } from "./db";
import { collectSessionMetadata, getSessionJsonPath } from "./session";
import { writeSessionJson, scanExistingRemoteSessions } from "./storage";
import { isEnabled } from "./config";

let db: Database | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let currentInvocationId: number | undefined;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("This Code");
  context.subscriptions.push(outputChannel);

  if (!isEnabled()) {
    outputChannel.appendLine(
      "[info] This Code is disabled via thisCode.enable setting.",
    );
    return;
  }

  try {
    // Steps 1-7 implemented in Plans 02-06 (Waves 1-3)
    const thisCodeDir = path.join(os.homedir(), ".this-code");
    await fs.mkdir(thisCodeDir, { recursive: true });
    await fs.mkdir(path.join(thisCodeDir, "sessions"), { recursive: true });

    const dbPath = path.join(thisCodeDir, "sessions.db");
    db = new Database(dbPath);
    await initDatabase(db);

    const metadata = collectSessionMetadata(context);
    const sessionJsonPath = getSessionJsonPath(metadata);
    await writeSessionJson(sessionJsonPath, metadata);

    const result = await db.run(
      `INSERT INTO invocations
       (workspace_path, user_data_dir, profile, local_ide_path,
        remote_name, remote_server_path, open_files)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        metadata.workspace_path,
        metadata.user_data_dir,
        metadata.profile,
        metadata.local_ide_path,
        metadata.remote_name,
        metadata.remote_server_path,
        "[]",
      ],
    );
    currentInvocationId = result.lastID;

    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(() => {
        if (db && currentInvocationId !== undefined) {
          updateOpenFiles(db, currentInvocationId).catch(() => {});
        }
      }),
      vscode.workspace.onDidCloseTextDocument(() => {
        if (db && currentInvocationId !== undefined) {
          updateOpenFiles(db, currentInvocationId).catch(() => {});
        }
      }),
    );

    // Fire-and-forget — do NOT await (STOR-04, Pitfall 6)
    scanExistingRemoteSessions(db).catch((err) => {
      outputChannel?.appendLine(
        `[info] Startup scan error: ${(err as Error).message}`,
      );
    });

    outputChannel.appendLine(
      `[info] This Code activated. Invocation ID: ${currentInvocationId}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel?.appendLine(`[info] This Code activation failed: ${msg}`);
  }
}

export async function deactivate(): Promise<void> {
  try {
    await db?.close();
  } catch {
    // Best-effort close
  }
}

async function updateOpenFiles(db: Database, rowId: number): Promise<void> {
  // Implemented in Plan 04 (Wave 2)
  // Will rebuild open_files from vscode.workspace.textDocuments (D-02)
  // Filters to uri.scheme === 'file'; handles false positives from language changes
  const openFiles = vscode.workspace.textDocuments
    .filter((doc) => !doc.isClosed && doc.uri.scheme === "file")
    .map((doc) => doc.uri.fsPath);
  try {
    await db.run("UPDATE invocations SET open_files = ? WHERE id = ?", [
      JSON.stringify(openFiles),
      rowId,
    ]);
  } catch {
    // DB error — log and continue
  }
}
