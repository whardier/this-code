import * as vscode from "vscode";

export interface SessionMetadata {
  workspace_path: string | null;
  user_data_dir: string | null;
  profile: string | null;
  local_ide_path: string;
  remote_name: string | null;
  remote_server_path: string | null;
  server_commit_hash: string | null;
  local_session_hash: string;
}

export function collectSessionMetadata(
  _context: vscode.ExtensionContext,
): SessionMetadata {
  // Implemented in Plan 03 (Wave 1)
  // Will parse vscode.env.appRoot for commit hash, parse globalStorageUri for profile/user_data_dir (D-01)
  throw new Error(
    "collectSessionMetadata: not yet implemented — Plan 03 fills this in",
  );
}

export function getSessionJsonPath(_metadata: SessionMetadata): string {
  // Implemented in Plan 03 (Wave 1)
  // SSH remote: ~/.vscode-server/bin/{hash}/this-code-session.json (D-05)
  // Local: ~/.this-code/sessions/{hash}.json (D-04)
  throw new Error(
    "getSessionJsonPath: not yet implemented — Plan 03 fills this in",
  );
}
