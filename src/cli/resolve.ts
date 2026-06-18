import * as vscode from "vscode";

let cached: string | undefined;

export function resolveCliPath(): string {
  if (cached) return cached;
  const configured = vscode.workspace
    .getConfiguration("commandcode")
    .get<string>("cliPath", "cmd");
  cached = configured.trim() || "cmd";
  return cached;
}

export function clearCliPathCache(): void {
  cached = undefined;
}