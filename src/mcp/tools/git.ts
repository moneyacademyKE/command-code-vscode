import * as cp from "node:child_process";
import * as path from "node:path";
import { getActiveCwd } from "../../config";
import type { McpTool } from "../server";

const SCRIPT_PATH = path.join(__dirname, "..", "..", "..", "scripts", "mcp_git.clj");

function executeBabashkaGit(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const process = cp.spawn("bb", [SCRIPT_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Babashka exited with code ${code}: ${stderr}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse babashka output: ${stdout}`));
      }
    });

    // Send payload to stdin
    process.stdin.write(JSON.stringify(payload));
    process.stdin.end();
  });
}

export const gitContextTool: McpTool = {
  name: "vscode_git_context",
  description: "Retrieve the current git branch, uncommitted changes, and recent commit history natively.",
  inputSchema: {
    type: "object",
    properties: {
      cwd: {
        type: "string",
        description: "Optional working directory. Defaults to the active workspace folder.",
      },
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const cwd = (args.cwd as string) || getActiveCwd();
    try {
      const result = await executeBabashkaGit({ cwd });
      if (result.success) {
        const text = `Current Branch: ${result.branch}\n\nUncommitted Changes:\n${result.status || "(none)"}\n\nRecent History:\n${result.log}`;
        return {
          content: [{ type: "text", text }],
        };
      } else {
        return {
          content: [{ type: "text", text: `Git Error: ${result.error}` }],
          isError: true,
        };
      }
    } catch (err: any) {
      return {
        content: [{ type: "text", text: err.message }],
        isError: true,
      };
    }
  },
};
