import { getActiveCwd } from "../../config";
import * as path from "node:path";
import type { McpTool } from "../server";
import { showInlineDiff } from "../../diff/preview";

export const diffProposeTool: McpTool = {
  name: "vscode_propose_diff",
  description: "Propose a code diff to the user via the VS Code native diff editor. The user can review the changes before applying.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute or relative path to the file being modified.",
      },
      content: {
        type: "string",
        description: "The complete proposed file content.",
      },
    },
    required: ["path", "content"],
  },
  execute: async (args: Record<string, unknown>) => {
    let filePath = args.path as string;
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(getActiveCwd(), filePath);
    }

    try {
      await showInlineDiff(filePath, args.content as string, "Proposed Changes");
      return {
        content: [{ type: "text", text: `Successfully opened diff view for ${filePath}. The user must review it.` }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Failed to open diff view: ${msg}` }],
        isError: true,
      };
    }
  },
};
