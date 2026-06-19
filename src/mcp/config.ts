import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

export async function generateMcpConfig(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open. Open a folder to generate mcp.json.");
    return;
  }

  // __dirname in compiled dist/extension.js is `<root>/dist`
  const SCRIPT_DIR = path.join(__dirname, "..", "scripts");
  const fsScript = path.join(SCRIPT_DIR, "mcp_fs.clj");
  const gitScript = path.join(SCRIPT_DIR, "mcp_git.clj");

  const config = {
    mcpServers: {
      "cmd-fs": {
        command: "bb",
        args: [fsScript],
      },
      "cmd-git": {
        command: "bb",
        args: [gitScript],
      },
    },
  };

  const targetPath = path.join(workspaceFolders[0].uri.fsPath, "mcp.json");
  
  try {
    fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), "utf8");
    vscode.window.showInformationMessage(`Successfully generated mcp.json at ${targetPath}`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to generate mcp.json: ${err.message}`);
  }
}
