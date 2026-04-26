import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

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

// --- Private helpers ---

function extractCommitHash(appRoot: string): string | null {
  // SSH remote appRoot: /home/u/.vscode-server/bin/{40-hex}/resources/app
  // Commit hash is the path segment immediately after 'bin'
  const parts = appRoot.split(path.sep);
  const binIdx = parts.lastIndexOf("bin");
  if (binIdx >= 0 && binIdx + 1 < parts.length) {
    const candidate = parts[binIdx + 1];
    if (/^[0-9a-f]{40}$/i.test(candidate)) {
      return candidate;
    }
  }
  return null; // local VS Code — appRoot has no bin/{hash} segment
}

function extractServerBinPath(
  appRoot: string,
  commitHash: string | null,
): string | null {
  if (!commitHash) {
    return null;
  }
  const parts = appRoot.split(path.sep);
  const binIdx = parts.lastIndexOf("bin");
  if (binIdx >= 0) {
    return parts.slice(0, binIdx + 2).join(path.sep); // up to and including the hash segment
  }
  return null;
}

function deriveLocalSessionHash(appRoot: string): string {
  // Stable: appRoot is constant within a VS Code version+installation
  // Collision-safe: SHA-256 of full path, truncated to 16 hex chars
  return crypto.createHash("sha256").update(appRoot).digest("hex").slice(0, 16);
}

function extractProfileFromGlobalStorageUri(
  globalStorageUri: vscode.Uri,
): string | null {
  // Path when non-default profile (IF VS Code scopes it): .../User/profiles/{hash}/globalStorage/...
  // Path for default profile: .../User/globalStorage/...
  // D-01: return null on any failure — best-effort empirical check
  try {
    const fsPath = globalStorageUri.fsPath;
    const parts = fsPath.split(path.sep);
    const profilesIdx = parts.indexOf("profiles");
    if (profilesIdx >= 0 && profilesIdx + 1 < parts.length) {
      const hashCandidate = parts[profilesIdx + 1];
      // Profile IDs are short hex hashes (4–32 chars)
      if (/^[0-9a-f]{4,32}$/i.test(hashCandidate)) {
        return hashCandidate;
      }
    }
  } catch {
    // Parsing failed — null per D-01
  }
  return null;
}

function extractUserDataDirFromGlobalStorageUri(
  globalStorageUri: vscode.Uri,
): string | null {
  // Parent of 'User' segment is the user data dir
  // macOS: ~/Library/Application Support/Code  (parent of User)
  // Linux: ~/.config/Code
  // SSH remote: ~/.vscode-server/data
  try {
    const fsPath = globalStorageUri.fsPath;
    const parts = fsPath.split(path.sep);
    const userIdx = parts.indexOf("User");
    if (userIdx > 0) {
      return parts.slice(0, userIdx).join(path.sep);
    }
  } catch {
    // Parsing failed
  }
  return null;
}

// --- Exported functions ---

export function collectSessionMetadata(
  context: vscode.ExtensionContext,
): SessionMetadata {
  const appRoot = vscode.env.appRoot;
  const remoteName = vscode.env.remoteName ?? null;
  const commitHash = extractCommitHash(appRoot);
  const localSessionHash = deriveLocalSessionHash(appRoot);
  const serverBinPath = extractServerBinPath(appRoot, commitHash);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspace_path =
    workspaceFolders && workspaceFolders.length > 0
      ? workspaceFolders[0].uri.fsPath
      : null;

  const profile = extractProfileFromGlobalStorageUri(context.globalStorageUri);
  const user_data_dir = extractUserDataDirFromGlobalStorageUri(
    context.globalStorageUri,
  );

  return {
    workspace_path,
    user_data_dir,
    profile,
    local_ide_path: appRoot,
    remote_name: remoteName,
    remote_server_path: serverBinPath,
    server_commit_hash: commitHash,
    local_session_hash: localSessionHash,
  };
}

export function getSessionJsonPath(metadata: SessionMetadata): string {
  if (metadata.remote_name && metadata.server_commit_hash) {
    // D-05: SSH remote — collocated with VS Code Server binary
    return path.join(
      os.homedir(),
      ".vscode-server",
      "bin",
      metadata.server_commit_hash,
      "this-code-session.json",
    );
  } else {
    // D-04: Local session — under ~/.this-code/sessions/
    return path.join(
      os.homedir(),
      ".this-code",
      "sessions",
      `${metadata.local_session_hash}.json`,
    );
  }
}
