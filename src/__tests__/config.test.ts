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
    } as any);

    process.env.ANTIGRAVITY_MODEL = "gemini-2.5-flash";

    // Config overrides environment
    expect(getEffectiveModel()).toBe("claude-opus-4.8");
  });

  it("should return ANTIGRAVITY_MODEL if configuration is empty", () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: vi.fn((key, defaultValue) => {
        if (key === "defaultModel") return "";
        return defaultValue;
      }),
    } as any);

    process.env.ANTIGRAVITY_MODEL = "gemini-2.5-flash";

    expect(getEffectiveModel()).toBe("gemini-2.5-flash");
  });

  it("should return MODEL environment variable if ANTIGRAVITY_MODEL and config are empty", () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: vi.fn((key, defaultValue) => {
        if (key === "defaultModel") return "   ";
        return defaultValue;
      }),
    } as any);

    delete process.env.ANTIGRAVITY_MODEL;
    process.env.MODEL = "deepseek-chat";

    expect(getEffectiveModel()).toBe("deepseek-chat");
  });

  it("should return undefined if all sources are empty or unset", () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: vi.fn((key, defaultValue) => {
        if (key === "defaultModel") return "";
        return defaultValue;
      }),
    } as any);

    delete process.env.ANTIGRAVITY_MODEL;
    delete process.env.MODEL;

    expect(getEffectiveModel()).toBeUndefined();
  });
});
