import { runCli } from "./spawn";
import type {
  CliResult,
  ModelInfo,
  PermissionMode,
  TastePackageRef,
} from "./types";
import { createPreCheckpoint } from "../git/checkpoint";

export interface StartSessionOptions {
  cwd?: string;
  prompt?: string;
  model?: string;
  permissionMode?: PermissionMode;
  trust?: boolean;
  continueLast?: boolean;
  resume?: string;
  addDirs?: string[];
  skipOnboarding?: boolean;
  plan?: boolean;
  autoAccept?: boolean;
  yolo?: boolean;
}

export async function startSession(
  options: StartSessionOptions,
): Promise<CliResult> {
  return runInteractive(buildSessionArgs(options), { cwd: options.cwd });
}

export function buildSessionArgs(options: StartSessionOptions): string[] {
  const args: string[] = [];
  if (options.continueLast) args.push("-c");
  if (options.resume) args.push("-r", options.resume);
  if (options.trust !== false) args.push("-t");
  if (options.plan) args.push("--plan");
  if (options.autoAccept !== false) args.push("--auto-accept");
  if (options.yolo !== false) args.push("--yolo");
  if (options.permissionMode) {
    args.push("--permission-mode", options.permissionMode);
  }
  if (options.model) args.push("-m", options.model);
  if (options.skipOnboarding) args.push("--skip-onboarding");
  if (options.addDirs) {
    for (const dir of options.addDirs) args.push("--add-dir", dir);
  }
  if (options.prompt) args.push(options.prompt);
  return args;
}

export async function runPrint(
  prompt: string,
  options: {
    cwd?: string;
    model?: string;
    maxTurns?: number;
    permissionMode?: PermissionMode;
    plan?: boolean;
    resume?: string;
    timeoutMs?: number;
    onStdoutChunk?: (chunk: string) => void;
  },
): Promise<CliResult> {
  const args: string[] = ["-p", prompt, "--yolo", "--auto-accept"];
  if (options.maxTurns !== undefined) {
    args.push("--max-turns", String(options.maxTurns));
  }
  if (options.model) args.push("-m", options.model);
  if (options.permissionMode) {
    args.push("--permission-mode", options.permissionMode);
  }
  if (options.plan) args.push("--plan");
  if (options.resume) args.push("-r", options.resume);
  return runCli(args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    onStdoutChunk: options.onStdoutChunk,
  });

  // Create a pre-flight git checkpoint before file-modifying operations
  if (!options.plan) {
    await createPreCheckpoint(options.cwd).catch(() => {});
  }

  return runCli(args, { cwd: options.cwd, timeoutMs: options.timeoutMs });
}

export async function listModels(cwd?: string): Promise<ModelInfo[]> {
  const result = await runCli(["--list-models"], { cwd, timeoutMs: 15_000 });
  if (result.exitCode !== 0) return [];
  return parseModelList(result.stdout);
}

export async function getStatus(cwd?: string): Promise<string> {
  const result = await runCli(["status"], { cwd, timeoutMs: 15_000 });
  return result.stdout || result.stderr;
}

export async function getInfo(cwd?: string): Promise<string> {
  const result = await runCli(["info"], { cwd, timeoutMs: 15_000 });
  return result.stdout || result.stderr;
}

export async function whoami(cwd?: string): Promise<string> {
  const result = await runCli(["whoami"], { cwd, timeoutMs: 15_000 });
  return result.stdout.trim() || result.stderr.trim();
}

export async function login(cwd?: string): Promise<CliResult> {
  return runInteractive(["login"], { cwd });
}

export async function logout(cwd?: string): Promise<CliResult> {
  return runCli(["logout"], { cwd, timeoutMs: 15_000 });
}

export async function updateCli(cwd?: string): Promise<CliResult> {
  return runCli(["update"], { cwd, timeoutMs: 120_000 });
}

export interface TasteListScope {
  cwd?: string;
  scope?: "project" | "global" | "remote";
}

export async function tasteList(
  scope: TasteListScope = {},
): Promise<TastePackageRef[]> {
  const args = ["taste", "list"];
  if (scope.scope) args.push("--scope", scope.scope);
  const result = await runCli(args, { cwd: scope.cwd, timeoutMs: 15_000 });
  if (result.exitCode !== 0) return [];
  return parseTasteList(result.stdout);
}

export interface TastePushOptions {
  cwd?: string;
  package?: string;
  global?: boolean;
  remote?: boolean;
}

export async function tastePush(
  options: TastePushOptions = {},
): Promise<CliResult> {
  const args = ["taste", "push"];
  if (options.package) args.push(options.package);
  if (options.global) args.push("--global");
  if (options.remote) args.push("--remote");
  return runCli(args, { cwd: options.cwd, timeoutMs: 60_000 });
}

export interface TastePullOptions {
  cwd?: string;
  package: string;
  global?: boolean;
  force?: boolean;
}

export async function tastePull(
  options: TastePullOptions,
): Promise<CliResult> {
  const args = ["taste", "pull", options.package];
  if (options.global) args.push("--global");
  if (options.force) args.push("--force");
  return runCli(args, { cwd: options.cwd, timeoutMs: 60_000 });
}

export async function tasteLint(
  packageName: string | undefined,
  cwd?: string,
): Promise<CliResult> {
  const args = ["taste", "lint"];
  if (packageName) args.push(packageName);
  return runCli(args, { cwd, timeoutMs: 30_000 });
}

export async function tasteLearn(
  source: string,
  cwd?: string,
): Promise<CliResult> {
  return runCli(["taste", "learn", source], { cwd, timeoutMs: 30_000 });
}

export async function openTaste(
  packageName: string | undefined,
  cwd?: string,
): Promise<CliResult> {
  const args = ["taste", "open"];
  if (packageName) args.push(packageName);
  return runCli(args, { cwd, timeoutMs: 15_000 });
}

async function runInteractive(
  args: string[],
  options: { cwd?: string } = {},
): Promise<CliResult> {
  return runCli(args, {
    cwd: options.cwd,
    timeoutMs: 0,
  });
}

function parseModelList(raw: string): ModelInfo[] {
  const models: ModelInfo[] = [];
  const lines = raw.split(/\r?\n/);
  let currentProvider: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[A-Za-z][\w &/.-]{0,40}$/.test(trimmed) && !/[/]/.test(trimmed)) {
      const knownHeaders = [
        "Open Source",
        "Anthropic",
        "OpenAI",
        "Frontier",
        "Open",
        "Yours",
        "Available models",
      ];
      if (knownHeaders.some((h) => trimmed.toLowerCase().startsWith(h.toLowerCase()))) {
        currentProvider = trimmed;
        continue;
      }
    }
    if (/^Available\s+models/i.test(trimmed)) continue;
    const idMatch = /^([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|[A-Za-z][A-Za-z0-9._-]*)\s+(.+)$/.exec(
      trimmed,
    );
    if (idMatch) {
      models.push({ id: idMatch[1].trim(), label: idMatch[2].trim(), provider: currentProvider });
      continue;
    }
    const dashMatch = /^[-*]\s+(\S+)\s+(.+)$/.exec(trimmed);
    if (dashMatch) {
      models.push({ id: dashMatch[1].trim(), label: dashMatch[2].trim(), provider: currentProvider });
      continue;
    }
    const firstToken = trimmed.split(/\s+/)[0];
    if (/^[A-Za-z0-9._/-]+$/.test(firstToken)) {
      models.push({ id: firstToken, provider: currentProvider });
    }
  }
  return models;
}

function parseTasteList(raw: string): TastePackageRef[] {
  const packages: TastePackageRef[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const scopeMatch = /^(\[?(project|global|remote)\]?\s+)?(.+?)(?:\s+\(([^)]+)\))?$/.exec(
      trimmed,
    );
    if (scopeMatch) {
      const scope = (scopeMatch[2] as TastePackageRef["scope"]) ?? "project";
      packages.push({ name: scopeMatch[3].trim(), scope });
    }
  }
  return packages;
}