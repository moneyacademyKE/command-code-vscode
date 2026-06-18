import * as vscode from "vscode";
import {
  getInfo,
  getStatus,
  logout,
  runPrint,
  updateCli,
  whoami,
} from "../cli/commands";
import { getActiveCwd } from "../config";
import { resolveCliPath } from "../cli/resolve";
import { startInteractiveSession } from "../permission/interactive";
import type { StatusBar } from "./statusBar";
import type { SessionTreeProvider } from "./sessionView";

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  statusBar: StatusBar,
  sessionTree: SessionTreeProvider,
  outputChannel: vscode.OutputChannel,
): void {
  const extUri = context.extensionUri;

  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.start", () => {
      const cwd = getActiveCwd();
      startInteractiveSession(extUri, { cwd, trust: true });
    }),

    vscode.commands.registerCommand("cmd-lite.continue", () => {
      const cwd = getActiveCwd();
      startInteractiveSession(extUri, { cwd, continueLast: true, trust: true });
    }),

    vscode.commands.registerCommand("cmd-lite.resume", async () => {
      const cwd = getActiveCwd();
      const name = await vscode.window.showInputBox({
        prompt: "Resume which session?",
        placeHolder: "session name or id (blank to pick from history)",
      });
      if (name !== undefined) {
        startInteractiveSession(extUri, {
          cwd,
          resume: name.trim() || undefined,
          trust: true,
        });
      }
    }),

    vscode.commands.registerCommand("cmd-lite.print", async () => {
      const cwd = getActiveCwd();
      const prompt = await vscode.window.showInputBox({
        prompt: "Run a headless query",
        placeHolder: "What should cmd do?",
      });
      if (!prompt) return;
      statusBar.setBusy(true);
      try {
        outputChannel.clear();
        outputChannel.show(true);
        const result = await runPrint(prompt, { cwd });
        outputChannel.appendLine(result.stdout);
        if (result.stderr.trim()) outputChannel.appendLine(result.stderr);
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("cmd-lite.plan", async () => {
      const cwd = getActiveCwd();
      const prompt = await vscode.window.showInputBox({
        prompt: "Plan a task (no files will be modified)",
        placeHolder: "Refactor the auth module…",
      });
      if (!prompt) return;
      statusBar.setBusy(true);
      try {
        const doc = await vscode.workspace.openTextDocument({
          content: "",
          language: "markdown",
        });
        const editor = await vscode.window.showTextDocument(doc, {
          preview: false,
        });
        const result = await runPrint(prompt, { cwd, plan: true });
        await editor.edit((b) => b.insert(new vscode.Position(0, 0), result.stdout));
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("cmd-lite.review", async () => {
      const cwd = getActiveCwd();
      const pr = await vscode.window.showInputBox({
        prompt: "Pull request number (leave empty for current branch)",
        placeHolder: "123",
      });
      const prompt = pr
        ? `Review PR #${pr.trim()} on the current branch`
        : "Review current changes on this branch";
      statusBar.setBusy(true);
      try {
        outputChannel.clear();
        outputChannel.show(true);
        const result = await runPrint(prompt, { cwd });
        outputChannel.appendLine(result.stdout);
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("cmd-lite.status", async () => {
      const text = await getStatus(getActiveCwd());
      outputChannel.clear();
      outputChannel.appendLine(text);
      outputChannel.show(true);
    }),

    vscode.commands.registerCommand("cmd-lite.info", async () => {
      const cwd = getActiveCwd();
      const text = await getInfo(cwd);
      vscode.window.showInformationMessage(text.split(/\r?\n/).slice(0, 6).join(" | "));
    }),

    vscode.commands.registerCommand("cmd-lite.login", () => {
      const cwd = getActiveCwd();
      const cliPath = resolveCliPath();
      const terminal = vscode.window.createTerminal({
        name: "Command Code",
        cwd,
      });
      terminal.sendText(`${cliPath} login`);
      terminal.show();
      sessionTree.refresh();
    }),

    vscode.commands.registerCommand("cmd-lite.logout", async () => {
      const cwd = getActiveCwd();
      await logout(cwd);
      sessionTree.refresh();
    }),

    vscode.commands.registerCommand("cmd-lite.update", async () => {
      statusBar.setBusy(true);
      try {
        const result = await updateCli(getActiveCwd());
        vscode.window.showInformationMessage(
          result.stdout.trim() || result.stderr.trim() || "Update complete.",
        );
      } finally {
        statusBar.setBusy(false);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.whoami", async () => {
      const who = await whoami(getActiveCwd());
      vscode.window.showInformationMessage(`Command Code: ${who}`);
    }),
  );
}
