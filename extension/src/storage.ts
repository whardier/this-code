import * as fs from "fs/promises";
import * as path from "path";
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
    open_files: [], // populated by document event handlers after activation
  };

  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
}

export async function scanExistingRemoteSessions(
  _db: Database,
  _binDir?: string,
): Promise<void> {
  // Implemented in Plan 05 (Wave 2)
  // Will scan binDir (default: ~/.vscode-server/bin/) for this-code-session.json files (STOR-04)
  // binDir parameter makes the function testable without touching real home dir
  // Incremental: skips already-indexed remote_server_path values
  // Fire-and-forget from activate() — must not throw uncaught
  throw new Error(
    "scanExistingRemoteSessions: not yet implemented — Plan 05 fills this in",
  );
}
