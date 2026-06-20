import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerLmTools } from "../tools/lm-tools";
import * as vscode from "vscode";

vi.mock("vscode", () => {
  const registeredTools: unknown[] = [];
  const lm = {
    registerTool: vi.fn((id, tool) => {
      registeredTools.push({ id, tool });
      return { dispose: vi.fn() };
    }),
  };

  const languages = {
    getDiagnostics: vi.fn(() => []),
  };

  const workspace = {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key, defaultValue) => {
        if (key === "defaultModel") return "claude-3";
        if (key === "defaultPermissionMode") return "standard";
        if (key === "maxTurns") return 10;
        return defaultValue;
      }),
    })),
    fs: {
      readFile: vi.fn(() => Promise.resolve(new TextEncoder().encode("mock taste"))),
    },
  };

  const window = {
    visibleTextEditors: [],
    activeTextEditor: undefined,
  };

  return {
    lm,
    languages,
    workspace,
    window,
    Uri: {
      file: vi.fn((p) => ({ fsPath: p, scheme: "file", path: p })),
    },
    LanguageModelToolResult: class {
      constructor(public parts: unknown[]) {}
    },
    LanguageModelTextPart: class {
      constructor(public value: string) {}
    },
  };
});

vi.mock("../cli/commands", () => ({
  runPrint: vi.fn(() => Promise.resolve({ stdout: "stdout content", stderr: "", exitCode: 0 })),
  listModels: vi.fn(() => Promise.resolve([{ id: "model-1", provider: "Anthropic" }])),
}));

vi.mock("../context/git", () => ({
  getGitContext: vi.fn(() => Promise.resolve({
    branch: "main",
    headCommit: "abcdef",
    headCommitMessage: "initial commit",
    dirtyFiles: ["file1.ts"],
  })),
}));

vi.mock("../agents/orchestrator", () => ({
  runParallel: vi.fn(() => Promise.resolve([{ label: "task-1", prompt: "p", result: { stdout: "parallel output", stderr: "", exitCode: 0 } }])),
  formatParallelResults: vi.fn(() => "formatted output"),
}));

describe("lm-tools tests", () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      subscriptions: {
        push: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
    vi.clearAllMocks();
  });

  it("should register all language model tools", () => {
    registerLmTools(mockContext);
    expect(vscode.lm.registerTool).toHaveBeenCalledTimes(7);
  });
});
