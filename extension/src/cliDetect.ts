import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);

// Update when CLI protocol breaks backward compatibility with the extension
const EXPECTED_CLI_MAJOR = 0;

const DEFAULT_CLI_PATH = path.join(os.homedir(), ".this-code", "bin", "this-code");
const CLI_DOWNLOAD_URL = "https://github.com/whardier/this-code";

export async function checkCliPresence(cliPath: string = DEFAULT_CLI_PATH): Promise<void> {
  // Phase 1 — existence check
  try {
    await fs.access(cliPath);
  } catch {
    vscode.window.showInformationMessage(
      `This Code: CLI not found at ${cliPath}`,
      "Download",
    ).then((action) => {
      if (action === "Download") {
        vscode.env.openExternal(vscode.Uri.parse(CLI_DOWNLOAD_URL));
      }
    });
    return;
  }

  // Phase 2 — version check
  try {
    const { stdout } = await execFileAsync(cliPath, ["--version"], { timeout: 3000 });
    const match = stdout.trim().match(/(\d+)\.\d+\.\d+/);
    if (match) {
      const majorVersion = parseInt(match[1], 10);
      if (majorVersion !== EXPECTED_CLI_MAJOR) {
        await vscode.window.showWarningMessage(
          `This Code: CLI major version mismatch. Extension expects v${EXPECTED_CLI_MAJOR}.x, found v${majorVersion}.x. Some features may not work correctly.`,
        );
      }
    }
  } catch {
    await vscode.window.showWarningMessage(
      "This Code: CLI found but could not run `this-code --version`. Try reinstalling the CLI.",
    );
  }
}
