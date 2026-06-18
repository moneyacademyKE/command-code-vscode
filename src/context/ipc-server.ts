import * as net from "node:net";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { type ContextProvider } from "./provider";
import { collectDiagnostics } from "./diagnostics";
import {
  IPC_ACTIONS,
  IPC_AUTH_TIMEOUT_MS,
  type IpcMessage,
  type IpcRequest,
  type IpcEvent,
  isAuthMessage,
  MAX_BUFFER_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_CONNECTIONS,
  IDLE_TIMEOUT_MS,
} from "./protocol";

function createErrorResponse(
  id: string,
  message: string,
  code: string,
): IpcMessage {
  return {
    type: "error",
    id,
    payload: { message, code },
  };
}

function createAuthErrorResponse(): IpcMessage {
  return {
    type: "error",
    id: "auth",
    payload: { message: "Authentication required. Provide a valid auth token as the first message.", code: "AUTH_REQUIRED" },
  };
}

function createContextResponse(
  id: string,
  payload: unknown,
): IpcMessage {
  return {
    type: "response",
    id,
    payload,
  };
}

function createDiagnosticsResponse(
  id: string,
  diagnostics: ReturnType<typeof collectDiagnostics>,
): IpcMessage {
  return {
    type: "response",
    id,
    payload: { diagnostics },
  };
}

function exceedsBufferCap(
  buffer: string,
  incomingBytes: number,
): boolean {
  return (
    Buffer.byteLength(buffer, "utf-8") + incomingBytes >
    MAX_BUFFER_BYTES
  );
}

function exceedsMessageCap(message: string): boolean {
  return (
    Buffer.byteLength(message, "utf-8") > MAX_MESSAGE_BYTES
  );
}

function parseMessage(
  messageStr: string,
): unknown {
  try {
    return JSON.parse(messageStr);
  } catch {
    return null;
  }
}

export class IPCServer implements vscode.Disposable {
  private readonly contextProvider: ContextProvider;
  private readonly socketPath: string;
  private readonly authToken: string;
  private readonly outputChannel: vscode.OutputChannel;
  private server: net.Server | null = null;
  private connections = new Set<net.Socket>();
  private webviewDispatcher?: (eventPayload: unknown) => void;
  private uiLockOwner: net.Socket | null = null;

  constructor(
    contextProvider: ContextProvider,
    socketPath: string,
    authToken: string,
  ) {
    this.contextProvider = contextProvider;
    this.socketPath = socketPath;
    this.authToken = authToken;
    this.outputChannel = vscode.window.createOutputChannel(
      "CommandCode Context",
    );
  }

  private log(message: string): void {
    const timestamp = new Date()
      .toISOString()
      .split("T")[1]
      .slice(0, 12);
    this.outputChannel.appendLine(
      `[${timestamp}] ${message}`,
    );
  }

  setWebviewDispatcher(dispatcher: (eventPayload: unknown) => void): void {
    this.webviewDispatcher = dispatcher;
  }

  dispatchToWebviewOwner(eventName: string, data: unknown): void {
    if (!this.uiLockOwner) {
      this.log(`No active UI lock owner to receive event: ${eventName}`);
      return;
    }

    const eventMessage: IpcEvent = {
      type: "event",
      payload: {
        event: eventName,
        data,
      },
    };
    this.sendMessage(this.uiLockOwner, eventMessage);
  }

  async start(): Promise<void> {
    this.server = net.createServer((socket) =>
      this.handleConnection(socket),
    );

    return new Promise((resolve, reject) => {
      if (!this.server) return;
      this.server.listen(this.socketPath, () => {
        try {
          if (process.platform !== "win32") {
            fs.chmodSync(this.socketPath, 0o600);
          }
        } catch (error) {
          this.log(
            `chmod socket failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        this.log("IPC server started");
        resolve();
      });

      this.server.on("error", (error) => {
        this.log(`Server error: ${error.message}`);
        reject(error);
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    if (this.connections.size >= MAX_CONNECTIONS) {
      this.log(
        `Connection cap reached (${MAX_CONNECTIONS}); rejecting`,
      );
      socket.destroy();
      return;
    }

    let authenticated = false;
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        this.log("Auth timeout; closing unauthenticated connection");
        this.sendMessage(socket, createAuthErrorResponse());
        socket.destroy();
      }
    }, IPC_AUTH_TIMEOUT_MS);

    this.connections.add(socket);

    socket.on("close", () => {
      this.connections.delete(socket);
      if (this.uiLockOwner === socket) {
        this.log("UI lock owner disconnected. Releasing UI lock.");
        this.uiLockOwner = null;
      }
      clearTimeout(authTimeout);
    });

    socket.setTimeout(IDLE_TIMEOUT_MS);
    socket.on("timeout", () => {
      this.log(
        `Connection idle for ${IDLE_TIMEOUT_MS}ms; closing`,
      );
      socket.destroy();
    });

    socket.on("error", (error) => {
      this.log(`Connection error: ${error.message}`);
    });

    let buffer = "";
    socket.on("data", async (data: Buffer) => {
      if (exceedsBufferCap(buffer, data.length)) {
        const total =
          Buffer.byteLength(buffer, "utf-8") +
          data.length;
        this.log(
          `Buffer cap exceeded (${total}B); dropping connection`,
        );
        socket.destroy();
        return;
      }

      buffer += data.toString();
      const messages = buffer.split("\n");
      buffer = messages.pop() || "";

      for (const messageStr of messages) {
        if (!messageStr.trim()) continue;
        if (exceedsMessageCap(messageStr)) {
          this.log(
            `Message exceeded ${MAX_MESSAGE_BYTES}B; dropping connection`,
          );
          socket.destroy();
          return;
        }

        if (!authenticated) {
          const parsed = parseMessage(messageStr);
          if (isAuthMessage(parsed)) {
            if (parsed.token === this.authToken) {
              authenticated = true;
              clearTimeout(authTimeout);
              this.log("Connection authenticated");
              continue;
            } else {
              this.log("Auth token mismatch; closing connection");
              this.sendMessage(socket, createAuthErrorResponse());
              socket.destroy();
              return;
            }
          }
        }

        if (!authenticated) {
          this.log("Message before auth; closing connection");
          this.sendMessage(socket, createAuthErrorResponse());
          socket.destroy();
          return;
        }

        await this.handleMessage(socket, messageStr);
      }
    });
  }

  private async handleMessage(
    socket: net.Socket,
    messageStr: string,
  ): Promise<void> {
    const message = parseMessage(messageStr);
    if (!message) {
      const errorResponse = createErrorResponse(
        crypto.randomUUID(),
        "Failed to parse message",
        "PARSE_ERROR",
      );
      this.sendMessage(socket, errorResponse);
      return;
    }

    if (
      typeof message !== "object" ||
      message === null ||
      (message as Record<string, unknown>).type !== "request"
    ) return;
    await this.handleRequest(socket, message as unknown as IpcRequest);
  }

  private async handleRequest(
    socket: net.Socket,
    request: IpcRequest,
  ): Promise<void> {
    const { action } = request.payload;

    try {
      if (action === IPC_ACTIONS.GET_CONTEXT) {
        const context =
          await this.contextProvider.getContext();
        const response = createContextResponse(
          request.id,
          context,
        );
        this.sendMessage(socket, response);
        return;
      }

      if (action === IPC_ACTIONS.GET_DIAGNOSTICS) {
        const diagnostics = collectDiagnostics(
          request.payload.filePaths,
        );
        const response = createDiagnosticsResponse(
          request.id,
          diagnostics,
        );
        this.sendMessage(socket, response);
        return;
      }

      if (action === IPC_ACTIONS.CLAIM_UI_LOCK) {
        this.uiLockOwner = socket;
        this.log("UI lock claimed by new session (Lock Stolen if already active).");
        const response = createContextResponse(request.id, { success: true });
        this.sendMessage(socket, response);
        return;
      }

      if (action === IPC_ACTIONS.DISPATCH_WEBVIEW_EVENT) {
        if (!this.uiLockOwner) {
          this.uiLockOwner = socket;
          this.log("UI lock implicitly claimed by webview event dispatch.");
        }
        if (this.webviewDispatcher) {
          this.webviewDispatcher(request.payload.eventPayload);
        }
        const response = createContextResponse(request.id, { success: true });
        this.sendMessage(socket, response);
        return;
      }

      const errorResponse = createErrorResponse(
        request.id,
        `Unknown action: ${action}`,
        "UNKNOWN_ACTION",
      );
      this.sendMessage(socket, errorResponse);
    } catch (error) {
      this.log(
        `Error handling ${action}: ${String(error)}`,
      );
      const errorResponse = createErrorResponse(
        request.id,
        error instanceof Error
          ? error.message
          : "Unknown error",
        "INTERNAL_ERROR",
      );
      this.sendMessage(socket, errorResponse);
    }
  }

  private sendMessage(
    socket: net.Socket,
    message: IpcMessage,
  ): void {
    try {
      socket.write(JSON.stringify(message) + "\n");
    } catch (error) {
      this.log(
        `Failed to send message: ${String(error)}`,
      );
    }
  }

  async stop(): Promise<void> {
    for (const socket of this.connections) {
      socket.end();
    }
    this.connections.clear();

    if (!this.server) return;

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  dispose(): void {
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();
    this.server?.close();
    this.outputChannel.dispose();
  }
}
