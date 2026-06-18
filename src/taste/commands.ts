import * as path from "node:path";
import * as vscode from "vscode";
import {
  openTaste,
  tasteLearn,
  tasteLint,
  tasteList,
  tastePull,
  tastePush,
} from "../cli/commands";
import { getActiveCwd } from "../config";
import type { TasteTreeProvider } from "./tasteView";

export function registerTasteCommands(
  context: vscode.ExtensionContext,
  provider: TasteTreeProvider,
  outputChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.taste.openFile", async () => {
      const cwd = getActiveCwd();
      const filePath = vscode.Uri.file(
        path.join(cwd, ".commandcode", "taste", "taste.md"),
      );
      try {
        await vscode.window.showTextDocument(filePath);
      } catch {
        vscode.window.showInformationMessage(
          "No taste.md found yet — learn some first.",
        );
      }
    }),

    vscode.commands.registerCommand("cmd-lite.taste.push", async () => {
      const packageName = await vscode.window.showInputBox({
        prompt: "Taste package name to push (leave empty to push all)",
        placeHolder: "cli, frontend, …",
      });
      const result = await tastePush({
        cwd: getActiveCwd(),
        package: packageName?.trim() || undefined,
      });
      showResult("Push taste", result.stdout, result.stderr, outputChannel);
      provider.refresh();
    }),

    vscode.commands.registerCommand("cmd-lite.taste.pull", async () => {
      const packageName = await vscode.window.showInputBox({
        prompt: "Taste package to pull",
        placeHolder: "owner/cli, ahmadawais/cli, …",
      });
      if (!packageName) return;
      const result = await tastePull({ cwd: getActiveCwd(), package: packageName.trim() });
      showResult("Pull taste", result.stdout, result.stderr, outputChannel);
      provider.refresh();
    }),

    vscode.commands.registerCommand("cmd-lite.taste.list", async () => {
      const result = await tasteList({ cwd: getActiveCwd() });
      if (result.length === 0) {
        vscode.window.showInformationMessage("No taste packages found.");
        return;
      }
      const items = result.map((p) => `${p.scope.padEnd(8)} ${p.name}`);
      const picked = await vscode.window.showQuickPick(items, {
        title: "Taste packages",
      });
      if (picked) {
        const name = picked.split(/\s+/)[1];
        await openTaste(name, getActiveCwd());
      }
    }),

    vscode.commands.registerCommand("cmd-lite.taste.lint", async () => {
      const result = await tasteLint(undefined, getActiveCwd());
      showResult("Lint taste", result.stdout, result.stderr, outputChannel);
    }),

    vscode.commands.registerCommand("cmd-lite.taste.learnHere", async () => {
      const cwd = getActiveCwd();
      const source = await vscode.window.showInputBox({
        prompt: "Source to learn taste from",
        value: ".",
        placeHolder: ". or owner/repo",
      });
      if (!source) return;
      const result = await tasteLearn(source.trim(), cwd);
      showResult("Learn taste", result.stdout, result.stderr, outputChannel);
      provider.refresh();
    }),

    vscode.commands.registerCommand("cmd-lite.taste.openWeb", () => {
      vscode.env.openExternal(vscode.Uri.parse("https://commandcode.ai/studio"));
    }),
  );
}

function showResult(title: string, stdout: string, stderr: string, channel: vscode.OutputChannel): void {
  const output = (stdout || stderr || "_(no output)_").trim();
  channel.clear();
  channel.appendLine(`## ${title}`);
  channel.appendLine(output);
  channel.show(true);
}
