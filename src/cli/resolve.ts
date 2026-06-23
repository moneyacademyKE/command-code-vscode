import * as fs from "node:fs";
import { exec } from "node:child_process";
import * as vscode from "vscode";
import * as path from "node:path";
import * as https from "node:https";

let cached: string | undefined;
let localCliPathOverride: string | undefined;

export function setLocalCliPathOverride(filePath: string | undefined): void {
  localCliPathOverride = filePath;
}

export function getLocalCliPath(globalStorageUri: vscode.Uri): string {
  return path.join(globalStorageUri.fsPath, "cli", "dist", "index.mjs");
}

export function detectLocalCli(globalStorageUri: vscode.Uri): string | undefined {
  const localPath = getLocalCliPath(globalStorageUri);
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  return undefined;
}

export function resolveCliPath(): string {
  const configured = vscode.workspace
    .getConfiguration("cmd-lite")
    .get<string>("cliPath", "cmd")
    .trim();
  if (configured && configured !== "cmd" && configured !== "command-code") {
    return configured;
  }
  if (localCliPathOverride) {
    return localCliPathOverride;
  }
  if (cached) return cached;
  cached = configured || "cmd";
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
      // For Windows or systems where .mjs file might not have executable permission bits but is read-accessible
      try {
        fs.accessSync(cliPath, fs.constants.R_OK);
        return { valid: true };
      } catch {
        return { valid: false, message: `CLI path "${cliPath}" is not readable. Check permissions.` };
      }
    }
  }
  return { valid: false, message: `CLI binary not found at "${cliPath}". Install globally or let CMD Lite set up local version.` };
}

export async function checkCliVersion(cliPath: string): Promise<{ compatible: boolean; version?: string; message?: string }> {
  return new Promise((resolve) => {
    const isJs = cliPath.endsWith(".mjs") || cliPath.endsWith(".js");
    const cmd = isJs ? `"${process.execPath}" "${cliPath}" --version` : `"${cliPath}" --version`;
    exec(cmd, {
      timeout: 5000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({ compatible: true }); // couldn't run --version, assume OK
        return;
      }
      const output = (stdout || stderr || "").trim();
      const match = /(\d+\.\d+\.\d+)/.exec(output);
      if (match) {
        const version = match[1];
        const [major, minor] = version.split(".").map(Number);
        if (major === 0) {
          if (minor < 39) {
            resolve({
              compatible: false,
              version,
              message: `Command Code CLI v${version} is too old. Please update to v0.39.0 or later with \`cmd update\`.`,
            });
            return;
          }
        }
        resolve({ compatible: true, version });
        return;
      }
      resolve({ compatible: true });
    });
  });
}

export function getLocalRegistryConfig(): string | undefined {
  try {
    const config = vscode.workspace.getConfiguration("cmd-lite");
    let val = config.get<string>("localRegistryPath");
    if (val) {
      val = val.trim();
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        const root = folders[0].uri.fsPath;
        val = val.replace(/\$\{workspaceFolder\}/g, root);
        if (!path.isAbsolute(val)) {
          val = path.resolve(root, val);
        }
      }
      return val;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function fetchLatestTarballInfo(): Promise<{ version: string; tarball: string }> {
  const localRegistry = getLocalRegistryConfig();
  if (localRegistry) {
    return new Promise((resolve, reject) => {
      try {
        const pkgJsonPath = path.join(localRegistry, "package.json");
        if (!fs.existsSync(pkgJsonPath)) {
          reject(new Error(`localRegistryPath is configured but no package.json was found at "${pkgJsonPath}"`));
          return;
        }
        const content = fs.readFileSync(pkgJsonPath, "utf8");
        const pkg = JSON.parse(content);
        const version = pkg.version;
        if (!version) {
          reject(new Error(`package.json at "${pkgJsonPath}" does not specify a version`));
          return;
        }
        const tarballName = `command-code-${version}.tgz`;
        const tarballPath = path.join(localRegistry, tarballName);
        resolve({
          version,
          tarball: tarballPath,
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  return new Promise((resolve, reject) => {
    https.get("https://registry.npmjs.org/command-code/latest", (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch latest info: status code ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({
            version: json.version,
            tarball: json.dist.tarball,
          });
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

export function downloadFile(url: string, destPath: string, progressCallback?: (percentage: number) => void): Promise<void> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(url)) {
          reject(new Error(`Local tarball not found at "${url}"`));
          return;
        }
        if (progressCallback) progressCallback(50);
        fs.copyFileSync(url, destPath);
        if (progressCallback) progressCallback(100);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download tarball: status code ${res.statusCode}`));
        return;
      }
      const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);

      res.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && progressCallback) {
          progressCallback(Math.round((downloadedBytes / totalBytes) * 100));
        }
      });

      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });

      fileStream.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on("error", reject);
  });
}

export function extractTarball(tarballPath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Spawn standard tar tool: tar -xzf <tarball> --strip-components=1 -C <targetDir>
    exec(`tar -xzf "${tarballPath}" --strip-components=1 -C "${targetDir}"`, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to extract tarball: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

export function installDependencies(targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec("pnpm install --prod --ignore-scripts", {
      cwd: targetDir,
      timeout: 180000,
    }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`pnpm install --prod failed: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

export async function installOrUpdateLocalCli(
  globalStorageUri: vscode.Uri,
  progressCallback?: (percentage: number) => void
): Promise<{ version: string }> {
  const latestInfo = await fetchLatestTarballInfo();
  
  const baseDir = globalStorageUri.fsPath;
  const tempTarball = path.join(baseDir, `command-code-${latestInfo.version}.tgz`);
  const newCliDir = path.join(baseDir, "cli-new");
  const activeCliDir = path.join(baseDir, "cli");
  const oldCliDir = path.join(baseDir, "cli-old");

  fs.mkdirSync(baseDir, { recursive: true });

  await downloadFile(latestInfo.tarball, tempTarball, progressCallback);

  try {
    if (fs.existsSync(newCliDir)) {
      fs.rmSync(newCliDir, { recursive: true, force: true });
    }
    fs.mkdirSync(newCliDir, { recursive: true });

    await extractTarball(tempTarball, newCliDir);

    // Only install production dependencies if package.json has dependencies
    let hasDependencies = false;
    try {
      const pkgJsonPath = path.join(newCliDir, "package.json");
      if (fs.existsSync(pkgJsonPath)) {
        const content = fs.readFileSync(pkgJsonPath, "utf8");
        const pkg = JSON.parse(content);
        if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
          hasDependencies = true;
        }
      }
    } catch {
      hasDependencies = true; // fallback to running install on parse errors
    }

    if (hasDependencies) {
      await installDependencies(newCliDir);
    }

    if (fs.existsSync(oldCliDir)) {
      fs.rmSync(oldCliDir, { recursive: true, force: true });
    }
    
    if (fs.existsSync(activeCliDir)) {
      fs.renameSync(activeCliDir, oldCliDir);
    }
    
    fs.renameSync(newCliDir, activeCliDir);

    if (fs.existsSync(oldCliDir)) {
      try {
        fs.rmSync(oldCliDir, { recursive: true, force: true });
      } catch (err) {
        // ignore background deletion failures
      }
    }
  } finally {
    if (fs.existsSync(tempTarball)) {
      try {
        fs.unlinkSync(tempTarball);
      } catch (err) {
        // ignore unlink failures
      }
    }
  }

  const localIndexMjs = path.join(activeCliDir, "dist", "index.mjs");
  setLocalCliPathOverride(localIndexMjs);

  return { version: latestInfo.version };
}