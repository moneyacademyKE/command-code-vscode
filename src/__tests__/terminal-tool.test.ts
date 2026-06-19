import { describe, it, expect, vi, afterEach } from "vitest";
import { terminalTool } from "../mcp/tools/terminal";
import * as cp from "node:child_process";

vi.mock("node:child_process", () => ({
  exec: vi.fn((cmd, _opts, cb) => {
    if (cmd === "echo test") {
      cb(null, "test\n", "");
    } else {
      cb(new Error("Command failed"), "", "error output");
    }
  }),
}));

vi.mock("vscode", () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/tmp/mock-workspace" } }],
  },
}));

describe("terminalTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should execute a command and return stdout", async () => {
    const result = await terminalTool.execute({ command: "echo test" }) as { content: { type: string, text: string }[] };
    
    expect(cp.exec).toHaveBeenCalledWith(
      "echo test",
      expect.objectContaining({ cwd: "/tmp/mock-workspace" }),
      expect.any(Function)
    );
    
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("STDOUT:\ntest\n");
    expect(result.content[0].text).toContain("EXIT CODE: 0");
  });

  it("should handle command errors and return stderr", async () => {
    const result = await terminalTool.execute({ command: "fail-cmd" }) as { content: { type: string, text: string }[] };
    
    expect(result.content[0].text).toContain("STDERR:\nerror output");
    expect(result.content[0].text).not.toContain("EXIT CODE: 0");
  });
});
