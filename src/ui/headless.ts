import * as vscode from "vscode";
import { runPrint } from "../cli/commands";
import {
  getActiveCwd,
  getEffectiveMaxTurns,
  getEffectiveModel,
  getEffectivePermissionMode,
} from "../config";

export function defineHeadlessTask(): vscode.Task {
  const task = new vscode.Task(
    { type: "cmd-lite", task: "headless" },
    vscode.TaskScope.Workspace,
    "Command Code (headless)",
    "cmd-lite",
    new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
      return new HeadlessPseudoterminal();
    }),
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
  };
  return task;
}

class HeadlessPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  open(): void {
    this.writeEmitter.fire("Command Code headless task — type a prompt and press Enter.\r\n");
  }

  close(): void {
    // no-op
  }

  handleInput(data: string): void {
    const prompt = data.replace(/\r?\n/g, "").trim();
    if (!prompt) return;
    void this.run(prompt);
  }

  private async run(prompt: string): Promise<void> {
    this.writeEmitter.fire(`\r\n$ cmd -p "${prompt}"\r\n`);
    const result = await runPrint(prompt, {
      cwd: getActiveCwd(),
      model: getEffectiveModel(),
      maxTurns: getEffectiveMaxTurns(),
      permissionMode: getEffectivePermissionMode(),
      onStdoutChunk: (chunk) => this.writeEmitter.fire(chunk.replace(/\n/g, "\r\n")),
    });
    this.writeEmitter.fire(`\r\n--- exit ${result.exitCode} in ${result.durationMs}ms ---\r\n`);
  }
}
