import * as vscode from "vscode";
import type { PermissionMode } from "./cli/types";

export function getEffectiveModel(): string | undefined {
  const value = vscode.workspace
    .getConfiguration("commandcode")
    .get<string>("defaultModel", "")
    .trim();
  return value || undefined;
}

export function getEffectivePermissionMode(): PermissionMode {
  const value = vscode.workspace
    .getConfiguration("commandcode")
    .get<string>("defaultPermissionMode", "standard");
  if (value === "plan" || value === "auto-accept" || value === "standard") {
    return value;
  }
  return "standard";
}

export function getEffectiveMaxTurns(): number {
  return vscode.workspace
    .getConfiguration("commandcode")
    .get<number>("maxTurns", 10);
}

export function showStatusBarEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("commandcode")
    .get<boolean>("showStatusBar", true);
}

export function getActiveCwd(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  return process.cwd();
}