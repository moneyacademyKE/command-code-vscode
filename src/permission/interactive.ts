import * as vscode from "vscode";
import { resolveCliPath } from "../cli/resolve";
import { buildSessionArgs } from "../cli/commands";
import type { StartSessionOptions } from "../cli/commands";
import { PermissionGate, type PermissionRequest, type PermissionChoice } from "./gate";
import { checkPermissionStore, setPermissionStore } from "./store";

export async function startInteractiveSession(
  extensionUri: vscode.Uri,
  options: StartSessionOptions,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  const permissionRequest: PermissionRequest = {
    action: options.prompt
      ? `Run: cmd ${options.prompt.length > 80 ? options.prompt.slice(0, 77) + "…" : options.prompt}`
      : "Start Command Code interactive session",
    description: options.trust
      ? "Starting in trusted mode — all permissions auto-granted for this session."
      : "This will start a Command Code session. The AI agent may read files, run commands, and modify code.",
    filePaths: options.addDirs?.length ? options.addDirs : undefined,
    category: "shell",
    key: options.trust ? undefined : "cmd-lite:session:start",
  };

  if (options.trust !== false || options.autoAccept !== false || options.yolo !== false) {
    options.trust = true;
    launchTerminal(cwd, options);
    return;
  }

  // Check permission store before showing gate
  if (permissionRequest.key) {
    const stored = checkPermissionStore(permissionRequest.key);
    if (stored === "allow-always") {
      options.trust = true;
      launchTerminal(cwd, options);
      return;
    }
    if (stored === "deny-always") {
      vscode.window.showInformationMessage(
        "Command Code: Session blocked by permission preference.",
      );
      return;
    }
  }

  const gate = new PermissionGate(extensionUri, [permissionRequest]);
  const choice = await gate.waitForChoice();

  if (choice === "deny-once" || choice === "deny-always") {
    if (choice === "deny-always" && permissionRequest.key) {
      setPermissionStore(permissionRequest.key, "deny-always");
    }
    vscode.window.showInformationMessage(
      "Command Code: Session cancelled by user.",
    );
    return;
  }

  if (choice === "allow-always") {
    options.trust = true;
    if (permissionRequest.key) {
      setPermissionStore(permissionRequest.key, "allow-always");
    }
  }

  gate.dispose();
  launchTerminal(cwd, options);
}

export async function runWithPermissionGate(
  extensionUri: vscode.Uri,
  action: string,
  description: string,
  category: PermissionRequest["category"],
  filePaths?: string[],
  key?: string,
): Promise<PermissionChoice> {
  if (key) {
    const stored = checkPermissionStore(key);
    if (stored) return stored;
  }

  const gate = new PermissionGate(extensionUri, [
    { action, description, filePaths, category, key },
  ]);
  const choice = await gate.waitForChoice();
  gate.dispose();

  if (key && (choice === "allow-always" || choice === "deny-always")) {
    setPermissionStore(key, choice);
  }

  return choice;
}

function launchTerminal(cwd: string, options: StartSessionOptions): void {
  const cliPath = resolveCliPath();
  const args = buildSessionArgs(options);
  for (const t of vscode.window.terminals) {
    if (t.name === "Command Code") {
      t.dispose();
    }
  }
  const terminal = vscode.window.createTerminal({
    name: "Command Code",
    cwd,
  });
  terminal.sendText([cliPath, ...args].join(" "));
  terminal.show();
}
