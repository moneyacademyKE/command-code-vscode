import { describe, it, expect, vi, afterEach, Mock } from "vitest";
import { diagnosticsTool } from "../mcp/tools/diagnostics";
import { fileSearchTool } from "../mcp/tools/fileSearch";
import * as vscode from "vscode";

// Mock VS Code API
vi.mock("vscode", () => {
  const mockDiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
    "0": "Error",
    "1": "Warning",
    "2": "Information",
    "3": "Hint",
  };

  return {
    languages: {
      getDiagnostics: vi.fn(),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: "/workspace/root" } }],
      findFiles: vi.fn(),
    },
    RelativePattern: class {
      constructor(public base: any, public pattern: string) {}
    },
    DiagnosticSeverity: mockDiagnosticSeverity,
  };
});

describe("diagnosticsTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return formatted diagnostics", async () => {
    const mockUri = { fsPath: "/workspace/root/src/index.ts" };
    const mockDiags = [
      {
        range: {
          start: { line: 9, character: 2 },
          end: { line: 9, character: 10 },
        },
        message: "Cannot find name 'foo'.",
        severity: 0, // Error
        code: "2304",
        source: "typescript",
      },
    ];

    (vscode.languages.getDiagnostics as Mock).mockReturnValue([[mockUri, mockDiags]]);

    const result = await diagnosticsTool.execute({});
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");

    const content = result.content[0] as { type: "text"; text: string };
    const parsed = JSON.parse(content.text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].file).toBe("/workspace/root/src/index.ts");
    expect(parsed[0].diagnostics[0]).toEqual({
      range: {
        start: { line: 10, character: 2 },
        end: { line: 10, character: 10 },
      },
      message: "Cannot find name 'foo'.",
      severity: "Error",
      code: "2304",
      source: "typescript",
    });
  });

  it("should return empty list when there are no diagnostics", async () => {
    (vscode.languages.getDiagnostics as Mock).mockReturnValue([]);
    const result = await diagnosticsTool.execute({});
    const content = result.content[0] as { type: "text"; text: string };
    expect(JSON.parse(content.text)).toEqual([]);
  });
});

describe("fileSearchTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should query findFiles using include pattern", async () => {
    const mockFiles = [
      { fsPath: "/workspace/root/src/index.ts" },
      { fsPath: "/workspace/root/src/util.ts" },
    ];
    (vscode.workspace.findFiles as Mock).mockResolvedValue(mockFiles);

    const result = await fileSearchTool.execute({ include: "**/*.ts" });
    expect(result.isError).toBeUndefined();
    expect(vscode.workspace.findFiles).toHaveBeenCalled();

    const content = result.content[0] as { type: "text"; text: string };
    const parsed = JSON.parse(content.text);
    expect(parsed).toEqual([
      "/workspace/root/src/index.ts",
      "/workspace/root/src/util.ts",
    ]);
  });

  it("should handle exclude patterns", async () => {
    (vscode.workspace.findFiles as Mock).mockResolvedValue([]);
    await fileSearchTool.execute({ include: "**/*.ts", exclude: "**/node_modules/**" });
    expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
      expect.any(vscode.RelativePattern),
      expect.any(vscode.RelativePattern)
    );
  });
});
