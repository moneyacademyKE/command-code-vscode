import * as fs from "node:fs";
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
import { resolveCliPath, installOrUpdateLocalCli } from "../cli/resolve";
import { startInteractiveSession } from "../permission/interactive";
import type { StatusBar } from "./statusBar";
import { type SessionTreeProvider, type SessionTreeItem, getJsonlPathForSession } from "./sessionView";
import type { ChatViewProvider } from "../webview/ChatViewProvider";
import { SessionManager } from "../sessionManager";

const session = SessionManager.getInstance();

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  statusBar: StatusBar,
  sessionTree: SessionTreeProvider,
  outputChannel: vscode.OutputChannel,
  chatProvider: ChatViewProvider,
): void {
  const extUri = context.extensionUri;

  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.start", () => {
      const cwd = getActiveCwd();
      session.activeAbortController?.abort();
      session.reset();
      chatProvider.dispatchEvent({
        jsonrpc: "2.0",
        method: "webview/dispatchEvent",
        params: {
          type: "ResetSession",
          payload: {}
        }
      });
      startInteractiveSession(extUri, { cwd, trust: true });
    }),

    vscode.commands.registerCommand("cmd-lite.continue", () => {
      const cwd = getActiveCwd();
      startInteractiveSession(extUri, { cwd, continueLast: true, trust: true });
    }),

    vscode.commands.registerCommand("cmd-lite.resume", async (sessionId?: string) => {
      const cwd = getActiveCwd();
      const id =
        sessionId ??
        (await vscode.window.showInputBox({
          prompt: "Resume which session?",
          placeHolder: "session name or id (blank to pick from history)",
        }));
      if (id) {
        const cleanId = id.trim();
        // Hydrate Webview from JSONL
        const jsonlPath = getJsonlPathForSession(cleanId);
        if (jsonlPath && fs.existsSync(jsonlPath)) {
          try {
            const raw = fs.readFileSync(jsonlPath, "utf-8");
            const lines = raw.split(/\r?\n/).filter((l) => l.trim());
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.role && (parsed.content || parsed.text)) {
                  chatProvider.dispatchEvent({
                    jsonrpc: "2.0",
                    method: "webview/dispatchEvent",
                    params: {
                      type: "RenderMessage",
                      payload: {
                        id: crypto.randomUUID(),
                        role: parsed.role,
                        content: parsed.content ?? parsed.text
                      }
                    }
                  });
                }
              } catch {
                // Ignore parsing errors for individual lines
              }
            }
          } catch (err) {
            outputChannel.appendLine(`Failed to hydrate session: ${err}`);
          }
        }
        
        startInteractiveSession(extUri, {
          cwd,
          resume: cleanId || undefined,
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
      for (const t of vscode.window.terminals) {
        if (t.name === "Command Code") {
          t.dispose();
        }
      }
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
      const configured = vscode.workspace
        .getConfiguration("cmd-lite")
        .get<string>("cliPath", "cmd")
        .trim();

      if (configured && configured !== "cmd" && configured !== "command-code") {
        statusBar.setBusy(true);
        try {
          const result = await updateCli(getActiveCwd());
          vscode.window.showInformationMessage(
            result.stdout.trim() || result.stderr.trim() || "Update complete.",
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Update failed: ${err instanceof Error ? err.message : String(err)}`
          );
        } finally {
          statusBar.setBusy(false);
        }
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Updating Command Code CLI...",
          cancellable: false,
        },
        async (progress) => {
          statusBar.setBusy(true);
          try {
            progress.report({ message: "Connecting to registry..." });
            const { version } = await installOrUpdateLocalCli(context.globalStorageUri, (pct) => {
              progress.report({ message: `Downloading... ${pct}%` });
            });
            vscode.window.showInformationMessage(
              `Command Code CLI successfully updated to v${version}`
            );
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to update CLI: ${err instanceof Error ? err.message : String(err)}`
            );
          } finally {
            statusBar.setBusy(false);
          }
        }
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.whoami", async () => {
      const who = await whoami(getActiveCwd());
      vscode.window.showInformationMessage(`Command Code: ${who}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.session.exportMarkdown", async (item?: SessionTreeItem) => {
      const jsonlPath = item?.session?.jsonlPath;
      if (!jsonlPath || !fs.existsSync(jsonlPath)) {
        vscode.window.showErrorMessage("Session file not found.");
        return;
      }

      try {
        const raw = fs.readFileSync(jsonlPath, "utf-8");
        const lines = raw.split(/\r?\n/).filter((l) => l.trim());
        const turns: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          try {
            const parsed = JSON.parse(lines[i]);
            const role = parsed.role ?? "unknown";
            const content = parsed.content ?? parsed.text ?? "";
            turns.push(`## Turn ${i + 1} (${role})\n\n${content.trim()}\n`);
          } catch {
            turns.push(`## Turn ${i + 1}\n\n\`\`\`\n${lines[i]}\n\`\`\`\n`);
          }
        }

        const markdown = turns.join("\n---\n\n");
        const title = item.session.label.length > 40
          ? item.session.label.slice(0, 37) + "…"
          : item.session.label;
        const doc = await vscode.workspace.openTextDocument({
          content: markdown,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: false });
        void vscode.window.setStatusBarMessage(
          `Exported session: ${title}`,
          3000,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to export session: ${message}`);
      }
    }),
  );
}
