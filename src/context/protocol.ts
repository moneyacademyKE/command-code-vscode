export const IPC_ACTIONS = {
  GET_CONTEXT: "getContext",
  GET_DIAGNOSTICS: "getDiagnostics",
  DISPATCH_WEBVIEW_EVENT: "dispatchWebviewEvent",
  CLAIM_UI_LOCK: "claimUiLock",
} as const;

export const IPC_AUTH_TIMEOUT_MS = 5000;

export type AuthMessage = {
  type: string;
  token: string;
};

export function isAuthMessage(msg: unknown): msg is AuthMessage {
  return (
    msg !== null &&
    typeof msg === "object" &&
    (msg as Record<string, unknown>).type === "auth" &&
    typeof (msg as Record<string, unknown>).token === "string"
  );
}

export type IpcAction =
  (typeof IPC_ACTIONS)[keyof typeof IPC_ACTIONS];

export interface IpcRequest {
  type: "request";
  id: string;
  payload: {
    action: string;
    filePaths?: string[];
    eventPayload?: unknown;
  };
}

export interface IpcResponse {
  type: "response";
  id: string;
  payload: unknown;
}

export interface IpcError {
  type: "error";
  id: string;
  payload: {
    message: string;
    code: string;
  };
}

export interface IpcEvent {
  type: "event";
  payload: {
    event: string;
    data: unknown;
  };
}

export type IpcMessage = IpcRequest | IpcResponse | IpcError | IpcEvent;

export const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
export const MAX_CONNECTIONS = 16;
export const IDLE_TIMEOUT_MS = 60000;

export interface CursorInfo {
  line: number;
  column: number;
}

export interface ActiveFileInfo {
  path: string;
  relativePath: string;
  language: string;
  lineCount: number;
  cursor: CursorInfo;
  encoding: string;
  tabSize: number;
}

export interface SelectionInfo {
  text: string;
  startLine: number;
  endLine: number;
  lineCount: number;
}

export interface OpenFileInfo {
  path: string;
  relativePath: string;
  language: string;
  isActive: boolean;
}

export interface WorkspaceInfo {
  rootPath: string;
  name: string | undefined;
}

export interface EditorContext {
  timestamp: number;
  workspace: WorkspaceInfo;
  activeFile: ActiveFileInfo | null;
  selection: SelectionInfo | null;
  openFiles: OpenFileInfo[];
  git: GitContext | null;
}

export interface GitContext {
  branch: string;
  headCommit: string;
  headCommitMessage: string;
  dirtyFiles: string[];
}

export interface DiagnosticEntry {
  range: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  message: string;
  severity: string;
  source: string | null;
  code: string | null;
}

export interface FileDiagnostics {
  file: string;
  relativePath: string;
  diagnostics: DiagnosticEntry[];
}
