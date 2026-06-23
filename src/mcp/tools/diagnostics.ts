import * as vscode from "vscode";
import type { McpTool } from "../server";

export const diagnosticsTool: McpTool = {
  name: "vscode_get_diagnostics",
  description: "Get active editor compiler errors and warnings across all open workspace documents.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async () => {
    try {
      const allDiagnostics = vscode.languages.getDiagnostics();
      const result = allDiagnostics.map(([uri, diags]) => {
        return {
          file: uri.fsPath,
          diagnostics: diags.map((d) => ({
            range: {
              start: { line: d.range.start.line + 1, character: d.range.start.character },
              end: { line: d.range.end.line + 1, character: d.range.end.character },
            },
            message: d.message,
            severity: vscode.DiagnosticSeverity[d.severity],
            code: typeof d.code === "object" ? d.code?.value : d.code,
            source: d.source,
          })),
        };
      }).filter((item) => item.diagnostics.length > 0);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Failed to retrieve diagnostics: ${msg}` }],
        isError: true,
      };
    }
  },
};
