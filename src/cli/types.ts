export type PermissionMode = "standard" | "plan" | "auto-accept";

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  command: string;
  args: string[];
  timedOut: boolean;
}

export interface CliRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
  signal?: AbortSignal;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export interface SessionDescriptor {
  id: string;
  name: string;
  startedAt: number;
  cwd: string;
  model?: string;
  permissionMode?: PermissionMode;
}

export interface ModelInfo {
  id: string;
  label?: string;
  provider?: string;
}

export interface TastePackageRef {
  name: string;
  scope: "project" | "global" | "remote";
}