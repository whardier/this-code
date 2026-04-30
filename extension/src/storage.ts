import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { Database } from "./db";
import { SessionMetadata } from "./session";

export async function writeSessionJson(
  filePath: string,
  metadata: SessionMetadata,
): Promise<void> {
  // Ensure parent directory exists (handles both ~/.this-code/sessions/ and
  // ~/.vscode-server/bin/{hash}/ — the server dir already exists for SSH remote)
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const record = {
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    workspace_path: metadata.workspace_path,
    user_data_dir: metadata.user_data_dir,
    profile: metadata.profile,
    local_ide_path: metadata.local_ide_path,
    remote_name: metadata.remote_name,
    remote_server_path: metadata.remote_server_path,
    server_commit_hash: metadata.server_commit_hash,
    ipc_hook_cli: metadata.ipc_hook_cli,
    open_files: [], // populated by document event handlers after activation
  };

  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
}

export async function scanExistingRemoteSessions(
  db: Database,
  binDir: string = path.join(os.homedir(), ".vscode-server", "bin"),
): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(binDir);
  } catch {
    // binDir does not exist — local-only machine, skip silently
    return;
  }

  for (const entry of entries) {
    const entryDir = path.join(binDir, entry);
    const sessionFile = path.join(entryDir, "this-code-session.json");

    try {
      // Incremental: skip if already indexed by remote_server_path
      const existing = await db.get<{ id: number }>(
        "SELECT id FROM invocations WHERE remote_server_path = ? LIMIT 1",
        [entryDir],
      );
      if (existing) {
        continue; // already in index
      }

      const raw = await fs.readFile(sessionFile, "utf-8");
      const session = JSON.parse(raw) as {
        workspace_path?: string | null;
        user_data_dir?: string | null;
        profile?: string | null;
        local_ide_path?: string;
        remote_name?: string | null;
        remote_server_path?: string | null;
        server_commit_hash?: string | null;
        server_bin_path?: string | null;
        ipc_hook_cli?: string | null;
        open_files?: string[];
      };

      // Insert historical record — use entryDir as remote_server_path for dedup key
      await db.run(
        `INSERT INTO invocations
         (workspace_path, user_data_dir, profile, local_ide_path,
          remote_name, remote_server_path, server_commit_hash, server_bin_path,
          ipc_hook_cli, open_files)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.workspace_path ?? null,
          session.user_data_dir ?? null,
          session.profile ?? null,
          session.local_ide_path ?? "",
          session.remote_name ?? null,
          entryDir, // authoritative remote_server_path for dedup
          session.server_commit_hash ?? null,
          session.server_bin_path ?? null,
          session.ipc_hook_cli ?? null,
          JSON.stringify(session.open_files ?? []),
        ],
      );
    } catch {
      // Missing file, malformed JSON, or DB error — skip this entry silently
      // Startup scan must never throw to caller (fire-and-forget contract)
    }
  }
}
