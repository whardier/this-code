import { Database } from "./db";
import { SessionMetadata } from "./session";

export async function writeSessionJson(
  _filePath: string,
  _metadata: SessionMetadata,
): Promise<void> {
  // Implemented in Plan 03 (Wave 1)
  // Will write JSON containing all SessionMetadata fields to the path
  throw new Error(
    "writeSessionJson: not yet implemented — Plan 03 fills this in",
  );
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
