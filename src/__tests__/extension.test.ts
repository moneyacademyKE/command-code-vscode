import { describe, it, expect, vi, beforeEach } from "vitest";
import { activate, deactivate } from "../extension";
import * as vscode from "vscode";

vi.mock("vscode", () => {
  return {
    TreeItem: class {
      constructor(public label: string, public collapsibleState?: number) {}
    },
    ThemeIcon: class {
      constructor(public id: string) {}
    },
    RelativePattern: class {
      constructor(public base: unknown, public pattern: string) {}
    },
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    Range: class {
      constructor(public start: unknown, public end: unknown) {}
    },
    WorkspaceEdit: class {
      replace = vi.fn();
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
    },
    window: {
      visibleTextEditors: [],
      activeTextEditor: undefined,
      setStatusBarMessage: vi.fn(),
      registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
      registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
      showErrorMessage: vi.fn(() => Promise.resolve()),
      showWarningMessage: vi.fn(() => Promise.resolve()),
      showTextDocument: vi.fn(() => Promise.resolve()),
      createStatusBarItem: vi.fn(() => ({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      })),
      createOutputChannel: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key, defaultValue) => {
          if (key === "cliPath") return "cmd";
          return defaultValue;
        }),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
      workspaceFolders: [],
      createFileSystemWatcher: vi.fn(() => ({
        dispose: vi.fn(),
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      })),
      onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      openTextDocument: vi.fn(() => Promise.resolve({})),
      applyEdit: vi.fn(() => Promise.resolve(true)),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
      executeCommand: vi.fn(),
    },
    tasks: {
      registerTaskProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    lm: {
      registerTool: vi.fn(() => ({ dispose: vi.fn() })),
    },
    chat: {
      createChatParticipant: vi.fn(() => ({
        iconPath: "",
        followupProvider: undefined,
      })),
    },
    env: {
      appName: "VS Code",
      openExternal: vi.fn(() => Promise.resolve(true)),
    },
    Uri: {
      file: vi.fn((p) => ({ fsPath: p, scheme: "file", path: p })),
      parse: vi.fn((s) => ({ fsPath: s, scheme: "file", path: s })),
      joinPath: vi.fn((_u, ...p) => ({ fsPath: p.join("/") })),
    },
  };
});

describe("extension tests", () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      subscriptions: {
        push: vi.fn(),
      },
      extensionUri: { fsPath: "/tmp" },
      globalState: {
        get: vi.fn(() => ({})),
        update: vi.fn(() => Promise.resolve()),
      },
    } as unknown as vscode.ExtensionContext;
    vi.clearAllMocks();
  });

  it("should activate the extension successfully", () => {
    activate(mockContext);
    expect(vscode.window.setStatusBarMessage).toHaveBeenCalled();
  });

  it("should deactivate the extension successfully", () => {
    // Should not throw
    deactivate();
  });
});
