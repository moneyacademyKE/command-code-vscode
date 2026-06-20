import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { IPCServer } from "../context/ipc-server";
import { IPC_ACTIONS } from "../context/protocol";
import { ContextProvider } from "../context/provider";

vi.mock("vscode", () => {
  return {
    window: {
      createOutputChannel: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      }),
    },
  };
});

describe("IPCServer Integration", () => {
  let socketPath: string;
  let server: IPCServer;
  let providerMock: ContextProvider;

  beforeEach(async () => {
    socketPath = path.join(os.tmpdir(), `cmd-lite-test-${Date.now()}.sock`);
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
    
    providerMock = {
      getContext: vi.fn().mockResolvedValue({ dummy: "context" }),
      openFile: vi.fn().mockResolvedValue(true),
      applyEdit: vi.fn().mockResolvedValue(true),
    } as unknown as ContextProvider;

    server = new IPCServer(providerMock, socketPath, "test-token");
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    server.dispose();
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  it("should handle GET_CONTEXT request", () => {
    return new Promise<void>((resolve, reject) => {
      const client = net.createConnection(socketPath);
      client.on("connect", () => {
        client.write(JSON.stringify({
          type: "auth",
          token: "test-token"
        }) + "\n");
        client.write(JSON.stringify({
          type: "request",
          id: "req-1",
          payload: { action: IPC_ACTIONS.GET_CONTEXT }
        }) + "\n");
      });

      let buffer = "";
      client.on("data", (data) => {
        buffer += data.toString();
        if (buffer.includes("\n")) {
          try {
            const response = JSON.parse(buffer.trim());
            expect(response.type).toBe("response");
            expect(response.id).toBe("req-1");
            expect(response.payload).toEqual({ dummy: "context" });
            expect(providerMock.getContext).toHaveBeenCalled();
            client.end();
            resolve();
          } catch (err) {
            if (buffer.trim() !== "") {
              reject(err);
            }
          }
        }
      });
      client.on("error", reject);
    });
  });

  it("should handle APPLY_EDIT request", () => {
    return new Promise<void>((resolve, reject) => {
      const client = net.createConnection(socketPath);
      client.on("connect", () => {
        client.write(JSON.stringify({
          type: "auth",
          token: "test-token"
        }) + "\n");
        client.write(JSON.stringify({
          type: "request",
          id: "req-2",
          payload: { action: IPC_ACTIONS.APPLY_EDIT, editPayload: { "file:///test": [] } }
        }) + "\n");
      });

      let buffer = "";
      client.on("data", (data) => {
        buffer += data.toString();
        if (buffer.includes("\n")) {
          try {
            const response = JSON.parse(buffer.trim());
            expect(response.type).toBe("response");
            expect(response.id).toBe("req-2");
            expect(response.payload).toEqual({ success: true });
            expect(providerMock.applyEdit).toHaveBeenCalledWith({ "file:///test": [] });
            client.end();
            resolve();
          } catch (err) {
            if (buffer.trim() !== "") reject(err);
          }
        }
      });
      client.on("error", reject);
    });
  });

  it("should return PARSE_ERROR for invalid request payloads", () => {
    return new Promise<void>((resolve, reject) => {
      const client = net.createConnection(socketPath);
      client.on("connect", () => {
        client.write(JSON.stringify({
          type: "auth",
          token: "test-token"
        }) + "\n");
        // Malformed request payload missing the 'action' field
        client.write(JSON.stringify({
          type: "request",
          id: "req-3",
          payload: { missingAction: true }
        }) + "\n");
      });

      let buffer = "";
      client.on("data", (data) => {
        buffer += data.toString();
        // Since we write auth and request quickly, wait for second response or search buffer
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            if (response.id === "req-3") {
              expect(response.type).toBe("error");
              expect(response.payload.code).toBe("PARSE_ERROR");
              expect(response.payload.message).toContain("Invalid request payload structure");
              client.end();
              resolve();
              return;
            }
          } catch {
            // ignore partial JSON parse errors
          }
        }
      });
      client.on("error", reject);
    });
  });
});

