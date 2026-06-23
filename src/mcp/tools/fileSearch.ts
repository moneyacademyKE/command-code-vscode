import * as vscode from "vscode";
import type { McpTool } from "../server";

export const fileSearchTool: McpTool = {
  name: "vscode_find_files",
  description: "Search for files in the workspace using glob patterns.",
  inputSchema: {
    type: "object",
    properties: {
      include: {
        type: "string",
        description: "A glob pattern that matches the files to include (e.g. '**/*.ts').",
      },
      exclude: {
        type: "string",
        description: "A glob pattern that matches files to exclude.",
      },
    },
    required: ["include"],
  },
  execute: async (args: Record<string, unknown>) => {
    const include = args.include as string;
    const exclude = args.exclude as string | undefined;

    try {
      let includePattern: vscode.GlobPattern = include;
      let excludePattern: vscode.GlobPattern | undefined = exclude;
      const rootFolder = vscode.workspace.workspaceFolders?.[0];
      if (rootFolder) {
        includePattern = new vscode.RelativePattern(rootFolder, include);
        if (exclude) {
          excludePattern = new vscode.RelativePattern(rootFolder, exclude);
        }
      }

      const files = await vscode.workspace.findFiles(includePattern, excludePattern);
      const filePaths = files.map((f) => f.fsPath);

      return {
        content: [{ type: "text", text: JSON.stringify(filePaths, null, 2) }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Failed to search files: ${msg}` }],
        isError: true,
      };
    }
  },
};
