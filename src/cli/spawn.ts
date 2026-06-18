import { spawn } from "node:child_process";
import { resolveCliPath } from "./resolve";
import type { CliResult, CliRunOptions } from "./types";

export async function runCli(
  args: string[],
  options: CliRunOptions = {},
): Promise<CliResult> {
  const cliPath = resolveCliPath();
  const cwd = options.cwd ?? process.cwd();
  const env = { ...process.env, ...(options.env ?? {}) };
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  const startedAt = Date.now();
  const child = spawn(cliPath, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;

  if (options.stdin !== undefined && child.stdin) {
    child.stdin.write(options.stdin);
    child.stdin.end();
  }

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
    options.onStdoutChunk?.(chunk);
  });

  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
    options.onStderrChunk?.(chunk);
  });

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
  }

  options.signal?.addEventListener(
    "abort",
    () => {
      timedOut = true;
      child.kill("SIGTERM");
    },
    { once: true },
  );

  const exitCode: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });

  if (timer) clearTimeout(timer);

  return {
    stdout,
    stderr,
    exitCode,
    durationMs: Date.now() - startedAt,
    command: cliPath,
    args,
    timedOut,
  };
}