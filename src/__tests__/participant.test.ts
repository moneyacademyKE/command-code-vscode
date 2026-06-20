import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerChatParticipant } from "../chat/participant";
import * as vscode from "vscode";

vi.mock("vscode", () => {
  const chat = {
    createChatParticipant: vi.fn(() => ({
      iconPath: "",
      followupProvider: undefined,
    })),
  };
  return {
    chat,
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
    },
    Uri: {
      joinPath: vi.fn(() => ({ fsPath: "icon.png" })),
    },
  };
});

describe("participant tests", () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      extensionUri: { fsPath: "/tmp" },
      subscriptions: {
        push: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
    vi.clearAllMocks();
  });

  it("should register the chat participant correctly", () => {
    registerChatParticipant(mockContext);
    expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith(
      "cmd-lite.chat",
      expect.any(Function)
    );
  });
});
