import * as vscode from "vscode";
import {
  getStatus,
  login,
  logout,
  runPrint,
  startSession,
  updateCli,
  whoami,
} from "../cli/commands";
import { getActiveCwd } from "../config";
import type { StatusBar } from "./statusBar";
import type { SessionTreeProvider } from "./sessionView";

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  statusBar: StatusBar,
  sessionTree: SessionTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("commandcode.start", async () => {
      const cwd = getActiveCwd();
      statusBar.setBusy(true);
      try {
        await startSession({ cwd, trust: true });
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("commandcode.continue", async () => {
      const cwd = getActiveCwd();
      statusBar.setBusy(true);
      try {
        await startSession({ cwd, continueLast: true });
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("commandcode.resume", async () => {
      const cwd = getActiveCwd();
      const name = await vscode.window.showInputBox({
        prompt: "Resume which session?",
        placeHolder: "session name or id (blank to pick from history)",
      });
      statusBar.setBusy(true);
      try {
        await startSession({ cwd, resume: name?.trim() || undefined });
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("commandcode.print", async () => {
      const cwd = getActiveCwd();
      const prompt = await vscode.window.showInputBox({
        prompt: "Run a headless query",
        placeHolder: "What should cmd do?",
      });
      if (!prompt) return;
      statusBar.setBusy(true);
      try {
        const channel = vscode.window.createOutputChannel("Command Code");
        channel.show(true);
        const result = await runPrint(prompt, { cwd });
        channel.appendLine(result.stdout);
        if (result.stderr.trim()) channel.appendLine(result.stderr);
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("commandcode.plan", async () => {
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

    vscode.commands.registerCommand("commandcode.review", async () => {
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
        const channel = vscode.window.createOutputChannel("Command Code");
        channel.show(true);
        const result = await runPrint(prompt, { cwd });
        channel.appendLine(result.stdout);
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("commandcode.status", async () => {
      const text = await getStatus(getActiveCwd());
      const channel = vscode.window.createOutputChannel("Command Code");
      channel.clear();
      channel.appendLine(text);
      channel.show(true);
    }),

    vscode.commands.registerCommand("commandcode.info", async () => {
      const cwd = getActiveCwd();
      const text = await (await import("../cli/commands")).getInfo(cwd);
      vscode.window.showInformationMessage(text.split(/\r?\n/).slice(0, 6).join(" | "));
    }),

    vscode.commands.registerCommand("commandcode.login", async () => {
      statusBar.setBusy(true);
      try {
        await login(getActiveCwd());
        sessionTree.refresh();
      } finally {
        statusBar.setBusy(false);
      }
    }),

    vscode.commands.registerCommand("commandcode.logout", async () => {
      const cwd = getActiveCwd();
      await logout(cwd);
      sessionTree.refresh();
    }),

    vscode.commands.registerCommand("commandcode.update", async () => {
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
    vscode.commands.registerCommand("commandcode.whoami", async () => {
      const who = await whoami(getActiveCwd());
      vscode.window.showInformationMessage(`Command Code: ${who}`);
    }),
  );
}