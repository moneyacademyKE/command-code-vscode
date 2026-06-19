import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";

export const SESSION_DIR = path.join(
  os.homedir(),
  ".commandcode",
  "ide",
);

export function detectIdeName(): string {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes("cursor")) return "cursor";
  if (appName.includes("windsurf")) return "windsurf";
  return "code";
}

function ensureSessionDir(): void {
  fs.mkdirSync(SESSION_DIR, {
    recursive: true,
    mode: 0o700,
  });
  try {
    fs.chmodSync(SESSION_DIR, 0o700);
  } catch {
    // best-effort
  }
}

export function getSocketPath(
  sessionId: string,
  ideName: string,
): string {
  const shortId = sessionId.slice(0, 8);
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\commandcode-${ideName}-${shortId}`;
  }
  return path.join(
    SESSION_DIR,
    `${ideName}-${shortId}.sock`,
  );
}

export function writeSessionFile(
  sessionId: string,
  socketPath: string,
  mcpSocketPath: string,
  workspaceFolders: string[],
  ideName: string,
  authToken: string,
): void {
  ensureSessionDir();
  const shortId = sessionId.slice(0, 8);
  const filePath = path.join(
    SESSION_DIR,
    `${ideName}-${shortId}.json`,
  );
  const tmpPath = `${filePath}.tmp`;

  const data = {
    socketPath,
    mcpSocketPath,
    workspaceFolders,
    pid: process.pid,
    ideName,
    authToken,
    timestamp: Date.now(),
  };

  try {
    fs.unlinkSync(tmpPath);
  } catch {
    // tmp file may not exist
  }

  const fd = fs.openSync(
    tmpPath,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL,
    0o600,
  );
  try {
    fs.writeFileSync(fd, JSON.stringify(data));
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);

  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }
}

export function removeSessionFile(
  sessionId: string,
  ideName: string,
): void {
  const shortId = sessionId.slice(0, 8);
  const base = path.join(
    SESSION_DIR,
    `${ideName}-${shortId}`,
  );
  for (const ext of [".json", ".sock"]) {
    try {
      fs.unlinkSync(`${base}${ext}`);
    } catch {
      // already removed
    }
  }
}

export function cleanupSocket(socketPath: string): void {
  if (process.platform === "win32") return;
  if (!fs.existsSync(socketPath)) return;
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // best-effort
  }
}

/** Remove all stale .sock files for the given IDE name from the session dir. */
export function cleanupStaleSockets(ideName: string): void {
  if (process.platform === "win32") return;
  if (!fs.existsSync(SESSION_DIR)) return;
  try {
    const entries = fs.readdirSync(SESSION_DIR);
    for (const entry of entries) {
      if (entry.endsWith(".sock") && entry.startsWith(`${ideName}-`)) {
        try {
          fs.unlinkSync(path.join(SESSION_DIR, entry));
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }
}
