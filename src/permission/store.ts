import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as vscode from "vscode";
import type { PermissionChoice } from "./gate";
import { Logger } from "../logger";

export function initializePermissionStore(_context: vscode.ExtensionContext): void {
  // Keeping signature for backward compatibility; globalState no longer complected
  Logger.info("Initializing decoupled filesystem permission store.");
}

function getStorePath(): string {
  const dir = path.join(os.homedir(), ".commandcode");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      // ignore
    }
  }
  return path.join(dir, "permissions.json");
}

function getStore(): Record<string, PermissionChoice> {
  try {
    const storePath = getStorePath();
    if (!fs.existsSync(storePath)) {
      return {};
    }
    const content = fs.readFileSync(storePath, "utf-8");
    return (JSON.parse(content) as Record<string, PermissionChoice>) || {};
  } catch (err) {
    Logger.error("Failed to read permissions store:", err);
    return {};
  }
}

function saveStore(store: Record<string, PermissionChoice>): void {
  try {
    const storePath = getStorePath();
    const storeDir = path.dirname(storePath);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
    try {
      fs.chmodSync(storePath, 0o600);
    } catch {
      // best-effort
    }
  } catch (err) {
    Logger.error("Failed to save permissions store:", err);
  }
}

export function checkPermissionStore(key: string): PermissionChoice | null {
  return getStore()[key] ?? null;
}

export function setPermissionStore(key: string, choice: "allow-always" | "deny-always"): void {
  const store = getStore();
  store[key] = choice;
  saveStore(store);
}

export function clearPermissionStore(key?: string): void {
  if (key) {
    const store = getStore();
    delete store[key];
    saveStore(store);
  } else {
    saveStore({});
  }
}

