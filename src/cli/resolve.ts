import * as fs from "node:fs";
import { execSync } from "node:child_process";
import * as vscode from "vscode";

let cached: string | undefined;

export function resolveCliPath(): string {
  if (cached) return cached;
  const configured = vscode.workspace
    .getConfiguration("cmd-lite")
    .get<string>("cliPath", "cmd");
  cached = configured.trim() || "cmd";
  return cached;
}

export function clearCliPathCache(): void {
  cached = undefined;
}

export function validateCliPath(cliPath: string): { valid: boolean; message?: string } {
  if (cliPath === "cmd" || cliPath === "command-code") {
    return { valid: true };
  }
  if (fs.existsSync(cliPath)) {
    try {
      fs.accessSync(cliPath, fs.constants.X_OK);
      return { valid: true };
    } catch {
      return { valid: false, message: `CLI path "${cliPath}" is not executable. Check permissions or install with \`npm i -g command-code\`.` };
    }
  }
  return { valid: false, message: `CLI binary not found at "${cliPath}". Install with \`npm i -g command-code\` or set \`commandcode.cliPath\` to the correct location.` };
}

export function checkCliVersion(cliPath: string): { compatible: boolean; version?: string; message?: string } {
  try {
    const output = execSync(`"${cliPath}" --version`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const match = /(\d+\.\d+\.\d+)/.exec(output);
    if (match) {
      const version = match[1];
      const [major, minor] = version.split(".").map(Number);
      if (major === 0) {
        if (minor < 39) {
          return {
            compatible: false,
            version,
            message: `Command Code CLI v${version} is too old. Please update to v0.39.0 or later with \`cmd update\`.`,
          };
        }
      }
      return { compatible: true, version };
    }
    return { compatible: true }; // couldn't parse version, assume OK
  } catch {
    return { compatible: true }; // couldn't run --version, assume OK (path valid check handles this)
  }
}