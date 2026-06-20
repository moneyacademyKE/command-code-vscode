import { describe, it, expect, vi, afterEach } from "vitest";
import { terminalTool } from "../mcp/tools/terminal";
import * as cp from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => {
  const spawn = vi.fn((cmd) => {
    const emitter = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();

    setTimeout(() => {
      if (cmd === "echo test") {
        emitter.stdout.emit("data", Buffer.from("test\n"));
        emitter.emit("close", 0);
      } else {
        emitter.stderr.emit("data", Buffer.from("error output"));
        emitter.emit("close", 1);
      }
    }, 5);

    return emitter;
  });

  return { spawn };
});

vi.mock("vscode", () => ({
  window: {
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

    expect(cp.spawn).toHaveBeenCalledWith(
      "echo test",
      [],
      expect.objectContaining({ cwd: "/tmp/mock-workspace", shell: true })
    );

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("STDOUT:\ntest\n");
    expect(result.content[0].text).toContain("EXIT CODE: 0");
  });

  it("should handle command errors and return stderr", async () => {
    const result = await terminalTool.execute({ command: "fail-cmd" }) as { content: { type: string, text: string }[] };

    expect(result.content[0].text).toContain("STDERR:\nerror output");
    expect(result.content[0].text).toContain("EXIT CODE: 1");
  });
});
