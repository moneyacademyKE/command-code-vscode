import * as cp from "node:child_process";
import * as path from "node:path";
import { getActiveCwd } from "../../config";
import type { McpTool } from "../server";

const SCRIPT_PATH = path.join(__dirname, "..", "scripts", "mcp_fs.clj");

function executeBabashkaFs(payload: any): Promise<any> {
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

function toAbsolutePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(getActiveCwd(), filePath);
}

export const readFileTool: McpTool = {
  name: "vscode_read_file",
  description: "Read the contents of a file from the disk natively.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute or relative path to the file to read.",
      },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const filePath = toAbsolutePath(args.path as string);
    try {
      const result = await executeBabashkaFs({ action: "readFile", path: filePath });
      if (result.success) {
        return {
          content: [{ type: "text", text: result.content }],
        };
      } else {
        return {
          content: [{ type: "text", text: `Error reading file: ${result.error}` }],
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

export const writeFileTool: McpTool = {
  name: "vscode_write_file",
  description: "Write content to a file on disk natively.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute or relative path to the file to write.",
      },
      content: {
        type: "string",
        description: "The complete file content to write.",
      },
    },
    required: ["path", "content"],
  },
  execute: async (args: Record<string, unknown>) => {
    const filePath = toAbsolutePath(args.path as string);
    try {
      const result = await executeBabashkaFs({ action: "writeFile", path: filePath, content: args.content });
      if (result.success) {
        return {
          content: [{ type: "text", text: `Successfully wrote to ${filePath}` }],
        };
      } else {
        return {
          content: [{ type: "text", text: `Error writing file: ${result.error}` }],
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

export const listFilesTool: McpTool = {
  name: "vscode_list_files",
  description: "List the contents of a directory on disk natively.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute or relative path to the directory.",
      },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const dirPath = toAbsolutePath(args.path as string);
    try {
      const result = await executeBabashkaFs({ action: "listFiles", path: dirPath });
      if (result.success) {
        return {
          content: [{ type: "text", text: result.files.join("\n") }],
        };
      } else {
        return {
          content: [{ type: "text", text: `Error listing files: ${result.error}` }],
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
