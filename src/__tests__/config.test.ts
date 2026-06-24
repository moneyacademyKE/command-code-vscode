import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEffectiveModel } from "../config";
import * as vscode from "vscode";

vi.mock("vscode", () => {
  return {
    workspace: {
      getConfiguration: vi.fn(),
    },
  };
});

describe("config getEffectiveModel tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return model from vscode configuration if configured", () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: vi.fn((key, defaultValue) => {
        if (key === "defaultModel") return "claude-opus-4.8";
        return defaultValue;
      }),
    } as unknown as vscode.WorkspaceConfiguration);

    process.env.ANTIGRAVITY_MODEL = "gemini-2.5-flash";

    // Config overrides environment
    expect(getEffectiveModel()).toBe("claude-opus-4.8");
  });

  it("should return undefined if configuration is empty", () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: vi.fn((key, defaultValue) => {
        if (key === "defaultModel") return "";
        return defaultValue;
      }),
    } as unknown as vscode.WorkspaceConfiguration);

    process.env.ANTIGRAVITY_MODEL = "gemini-2.5-flash";

    expect(getEffectiveModel()).toBeUndefined();
  });

  it("should return undefined if configuration contains spaces only", () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: vi.fn((key, defaultValue) => {
        if (key === "defaultModel") return "   ";
        return defaultValue;
      }),
    } as unknown as vscode.WorkspaceConfiguration);

    process.env.MODEL = "deepseek-chat";

    expect(getEffectiveModel()).toBeUndefined();
  });
});
