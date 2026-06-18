import { vi, describe, it, expect } from "vitest";

vi.mock("vscode", () => {
  return {
    EventEmitter: class {
      fire() {}
      event = {};
    },
    Uri: {
      parse: (val: string) => ({ toString: () => val, path: val }),
      file: (val: string) => ({ toString: () => `file://${val}`, path: val, fsPath: val }),
    },
    workspace: {
      registerTextDocumentContentProvider: vi.fn(),
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

import * as vscode from "vscode";
import { proposedDiffProvider, parseCodeBlocks, extractFirstDiffFile } from "../diff/preview";

describe("ProposedDiffContentProvider", () => {
  it("stores and provides virtual document contents", () => {
    const testUri = { toString: () => "cmd-lite-diff://proposed/src/main.js" } as vscode.Uri;
    const testContent = "function hello() { return 'world'; }";
    
    proposedDiffProvider.updateContent(testUri, testContent);
    const resolved = proposedDiffProvider.provideTextDocumentContent(testUri);
    
    expect(resolved).toBe(testContent);
  });

  it("returns empty string for unregistered URIs", () => {
    const unregisteredUri = { toString: () => "cmd-lite-diff://proposed/nonexistent.js" } as vscode.Uri;
    const resolved = proposedDiffProvider.provideTextDocumentContent(unregisteredUri);
    expect(resolved).toBe("");
  });
});

describe("parseCodeBlocks", () => {
  it("parses fenced code blocks and file paths", () => {
    const output = "Check this out:\n```js\n// File: src/index.js\nconsole.log('test');\n```";
    const blocks = parseCodeBlocks(output);
    expect(blocks.length).toBe(1);
    expect(blocks[0].filePath).toBe("src/index.js");
    expect(blocks[0].content).toContain("console.log('test');");
  });

  it("handles blocks without path annotations", () => {
    const output = "```python\nprint(123)\n```";
    const blocks = parseCodeBlocks(output);
    expect(blocks.length).toBe(1);
    expect(blocks[0].filePath).toBeUndefined();
    expect(blocks[0].content).toBe("print(123)");
  });

  it("extracts the first diff file correctly", () => {
    const output = "```js\n// File: src/main.js\nlet a = 1;\n```";
    const result = extractFirstDiffFile(output);
    expect(result).not.toBeNull();
    expect(result?.filePath).toBe("src/main.js");
    expect(result?.content).toBe("// File: src/main.js\nlet a = 1;");
  });
});
