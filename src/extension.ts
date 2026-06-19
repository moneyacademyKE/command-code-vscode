import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { registerChatParticipant } from "./chat/participant";
import {
  getActiveCwd,
  showStatusBarEnabled,
  getEffectiveModel,
  getEffectiveMaxTurns,
  getEffectivePermissionMode,
} from "./config";
import {
  resolveCliPath,
  validateCliPath,
  checkCliVersion,
  clearCliPathCache,
} from "./cli/resolve";
import { registerSessionCommands } from "./ui/sessionCommands";
import { SessionTreeProvider, listSessions } from "./ui/sessionView";
import { StatusBar } from "./ui/statusBar";
import { pickModel, pickPermissionMode } from "./ui/pickers";
import { defineHeadlessTask } from "./ui/headless";
import { registerTasteCommands } from "./taste/commands";
import {
  registerTasteWatcher,
  TasteTreeProvider,
} from "./taste/tasteView";
import { ChatViewProvider } from "./webview/ChatViewProvider";
import { ContextProvider } from "./context/provider";
import { IPCServer } from "./context/ipc-server";
import {
  detectIdeName,
  getSocketPath,
  writeSessionFile,
  removeSessionFile,
  cleanupSocket,
  cleanupStaleSockets,
} from "./context/session";
import { registerLmTools } from "./tools/lm-tools";
import { showInlineDiff, extractFirstDiffFile, proposedDiffProvider, acceptDiffProposals, rejectDiffProposals, getCurrentDiffManager } from "./diff/preview";
import { runPrint, getStatus } from "./cli/commands";
import { listSessions } from "./ui/sessionView";
import { runParallel, formatParallelResults, type AgentTask } from "./agents/orchestrator";
import { initializePermissionStore } from "./permission/store";
import { restoreLastCheckpoint } from "./git/checkpoint";
import { CmdMcpServer } from "./mcp/server";
import { readFileTool, writeFileTool, listFilesTool } from "./mcp/tools/fs";
import { gitContextTool } from "./mcp/tools/git";
import { diffProposeTool } from "./mcp/tools/diff";
import { terminalTool } from "./mcp/tools/terminal";

let currentSessionId: string | null = null;
let currentIdeName: string | null = null;
let ipcServer: IPCServer | null = null;
let mcpServer: CmdMcpServer | null = null;

async function handleWebviewAction(
  msg: { type: "action"; action: string; payload?: Record<string, unknown> },
  chatProvider: ChatViewProvider,
): Promise<void> {
  const cwd = getActiveCwd();

  switch (msg.action) {
    case "start":
      vscode.commands.executeCommand("cmd-lite.start");
      break;
    case "continue":
      vscode.commands.executeCommand("cmd-lite.continue");
      break;
    case "resume-session": {
      const sessionId = msg.payload?.sessionId as string | undefined;
      if (sessionId) {
        vscode.commands.executeCommand("cmd-lite.resume", sessionId);
      }
      break;
    }
    case "list-sessions": {
      const sessions = listSessions(cwd);
      chatProvider.dispatchEvent({
        jsonrpc: "2.0",
        method: "webview/dispatchEvent",
        params: {
          type: "SessionList",
          payload: { sessions },
        },
      });
      break;
    }
    case "pick-model":
      await pickModel();
      break;
    case "pick-permission":
      await pickPermissionMode();
      break;
    case "show-status": {
      try {
        const text = await getStatus(cwd);
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "StatusResult",
            payload: { text },
          },
        });
      } catch (err) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "StatusResult",
            payload: { text: `Error: ${err instanceof Error ? err.message : String(err)}` },
          },
        });
      }
      break;
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const cliPath = resolveCliPath();

  void vscode.window.setStatusBarMessage(
    `Command Code extension loaded (cli: ${cliPath})`,
    3000,
  );

  const validation = validateCliPath(cliPath);
  if (!validation.valid) {
    vscode.window.showErrorMessage(
      `Command Code: ${validation.message}`,
      "Install CLI",
      "Settings",
    ).then((choice) => {
      if (choice === "Settings") {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "cmd-lite.cliPath",
        );
      }
    });
  } else {
    const version = checkCliVersion(cliPath);
    if (!version.compatible && version.message) {
      vscode.window.showWarningMessage(
        `Command Code: ${version.message}`,
        "Update",
      ).then((choice) => {
        if (choice === "Update") {
          vscode.commands.executeCommand("cmd-lite.update");
        }
      });
    }
  }

  const outputChannel = vscode.window.createOutputChannel("Command Code");

  const statusBar = new StatusBar();
  if (showStatusBarEnabled()) statusBar.show();

  const tasteProvider = new TasteTreeProvider(getActiveCwd());
  const sessionProvider = new SessionTreeProvider();

  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    async (eventName, data) => {
      // Handle chatInput directly by running runPrint and streaming back to webview
      if (
        eventName === "webview_interaction" &&
        data &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "chatInput"
      ) {
        const input = data as { type: "chatInput"; payload: { prompt: string } };
        const prompt = input.payload?.prompt;
        if (!prompt) return;

        outputChannel.appendLine(`[webview] chatInput received: ${prompt.slice(0, 80)}`);
        let streamedAny = false;

        try {
          const result = await runPrint(prompt, {
            cwd: getActiveCwd(),
            model: getEffectiveModel(),
            maxTurns: getEffectiveMaxTurns(),
            permissionMode: getEffectivePermissionMode(),
            onStdoutChunk: (chunk: string) => {
              streamedAny = true;
              chatProvider.dispatchEvent({
                jsonrpc: "2.0",
                method: "webview/dispatchEvent",
                params: {
                  type: "StdoutChunk",
                  payload: {
                    chunk: chunk,
                  },
                },
              });
            },
            timeoutMs: 5 * 60 * 1000,
          });

          outputChannel.appendLine(`[webview] runPrint done: exit=${result.exitCode}, stdout=${result.stdout.length}b, streamed=${streamedAny}`);

          // Fallback: if nothing streamed but stdout has content, send it now
          if (!streamedAny && result.stdout.trim()) {
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "RenderMessage",
                payload: {
                  id: `agent-${Date.now()}`,
                  role: "agent",
                  content: result.stdout,
                },
              },
            });
          }

          if (result.timedOut) {
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "RenderMessage",
                payload: {
                  id: `error-${Date.now()}`,
                  role: "system",
                  content: "\n\n_(Command Code was cancelled.)_\n",
                },
              },
            });
          }

          if (result.exitCode !== 0 && result.stderr.trim()) {
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "RenderMessage",
                payload: {
                  id: `error-${Date.now()}`,
                  role: "system",
                  content: `\n\n**Error (exit ${result.exitCode}):** ${result.stderr.trim()}\n`,
                },
              },
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          outputChannel.appendLine(`[webview] runPrint error: ${message}`);
          chatProvider.dispatchEvent({
            jsonrpc: "2.0",
            method: "webview/dispatchEvent",
            params: {
              type: "RenderMessage",
              payload: {
                id: `error-${Date.now()}`,
                role: "system",
                content: `\n\n**Error:** ${message}\n`,
              },
            },
          });
        }
        return;
      }

      // Handle action messages from webview buttons
      if (
        eventName === "webview_interaction" &&
        data &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "action"
      ) {
        const msg = data as { type: "action"; action: string; payload?: Record<string, unknown> };
        handleWebviewAction(msg, chatProvider);
        return;
      }

      // Fall through to IPC for other message types (e.g. when CLI is connected)
      ipcServer?.dispatchToWebviewOwner(eventName, data);
    }
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "cmd-lite.tasteView",
      tasteProvider,
    ),
    vscode.window.registerTreeDataProvider(
      "cmd-lite.sessionView",
      sessionProvider,
    ),
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider
    ),
  );

  registerTasteWatcher(context, tasteProvider);
  registerTasteCommands(context, tasteProvider, outputChannel);
  initializePermissionStore(context);
  registerSessionCommands(context, statusBar, sessionProvider, outputChannel);
  registerChatParticipant(context);
  registerLmTools(context);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "cmd-lite-diff",
      proposedDiffProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.model.pick", () => pickModel()),
    vscode.commands.registerCommand("cmd-lite.permission.pick", () =>
      pickPermissionMode(),
    ),
    vscode.commands.registerCommand("cmd-lite.diff.show", (output: string) => {
      const diff = extractFirstDiffFile(output);
      if (diff) {
        showInlineDiff(diff.filePath, diff.content, "Command Code Proposal");
      } else {
        vscode.window.showInformationMessage("No code changes found in the output.");
      }
    }),
    vscode.commands.registerCommand("cmd-lite.diff.acceptAll", () => {
      const mgr = getCurrentDiffManager();
      if (mgr) acceptDiffProposals(mgr);
    }),
    vscode.commands.registerCommand("cmd-lite.diff.rejectAll", () => {
      const mgr = getCurrentDiffManager();
      if (mgr) rejectDiffProposals(mgr);
    }),
    vscode.commands.registerCommand("cmd-lite.checkpoint.restore", async () => {
      const cwd = getActiveCwd();
      const ok = await restoreLastCheckpoint(cwd);
      if (ok) {
        vscode.window.showInformationMessage("Restored pre-run file state from git stash.");
      } else {
        vscode.window.showInformationMessage("No cmd-lite checkpoint to restore.");
      }
    }),
    vscode.commands.registerCommand("cmd-lite.agents.parallel", async () => {
      const result = await vscode.window.showInputBox({
        prompt: "Describe what to do (will be split across agents)",
        placeHolder: "Implement feature X with tests and docs",
      });
      if (!result) return;
      statusBar.setBusy(true);
      try {
        const tasks: AgentTask[] = [
          { label: "impl", prompt: `${result} — implement the core logic. Write concise, tested code.` },
          { label: "tests", prompt: `${result} — write comprehensive tests.` },
          { label: "docs", prompt: `${result} — write documentation.` },
        ];

        const results = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Running parallel agents…",
            cancellable: true,
          },
          async (progress, token) => {
            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());

            const doneLabels = new Set<string>();
            const total = tasks.length;

            progress.report({ message: `0/${total} complete` });

            const agentResults = await runParallel(tasks, {
              signal: abortController.signal,
              onAgentProgress(label, chunk) {
                const summary = chunk.replace(/\s+/g, " ").trim();
                const truncated = summary.length > 60
                  ? summary.slice(0, 57) + "…"
                  : summary;
                progress.report({
                  message: `${doneLabels.size}/${total} complete — ${label}: ${truncated}`,
                });
              },
              onAgentDone(label) {
                doneLabels.add(label);
                progress.report({
                  message: `${doneLabels.size}/${total} complete — ${label} finished`,
                });
              },
            });

            return agentResults;
          },
        );

        const formatted = formatParallelResults(results);
        outputChannel.clear();
        outputChannel.appendLine(formatted);
        outputChannel.show(true);
      } finally {
        statusBar.setBusy(false);
      }
    }),
  );

  statusBar.setPermissionMode(
    (vscode.workspace
      .getConfiguration("cmd-lite")
      .get<string>("defaultPermissionMode", "standard") as
      | "standard"
      | "plan"
      | "auto-accept") ?? "standard",
  );

  vscode.tasks.registerTaskProvider("cmd-lite", {
    provideTasks: () => [defineHeadlessTask()],
    resolveTask: () => undefined,
  });

  context.subscriptions.push({
    dispose: () => {
      statusBar.hide();
      outputChannel.dispose();
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cmd-lite.cliPath")) {
        clearCliPathCache();
      }
      if (e.affectsConfiguration("cmd-lite.showStatusBar")) {
        if (showStatusBarEnabled()) statusBar.show();
        else statusBar.hide();
      }
    }),
  );

  // --- IPC context server ---
  const sessionId = crypto.randomUUID();
  currentSessionId = sessionId;
  const ideName = detectIdeName();
  currentIdeName = ideName;
  const socketPath = getSocketPath(sessionId, ideName);
  const mcpSocketPath = getSocketPath(sessionId + "-mcp", ideName);
  const authToken = crypto.randomUUID();

  cleanupSocket(socketPath);
  cleanupSocket(mcpSocketPath);
  cleanupStaleSockets(ideName);

  const contextProvider = new ContextProvider();
  ipcServer = new IPCServer(contextProvider, socketPath, authToken);

  ipcServer.setWebviewDispatcher((eventPayload) => {
    chatProvider.dispatchEvent(eventPayload);
  });

  mcpServer = new CmdMcpServer(mcpSocketPath, [
    terminalTool,
    readFileTool,
    writeFileTool,
    listFilesTool,
    gitContextTool,
    diffProposeTool,
  ]);
  mcpServer.start();

  ipcServer.start()
    .then(() => {
      const workspaceFolders =
        vscode.workspace.workspaceFolders?.map(
          (f) => f.uri.fsPath,
        ) ?? [];

      try {
        writeSessionFile(
          sessionId,
          socketPath,
          mcpSocketPath,
          workspaceFolders,
          ideName,
          authToken,
        );
      } catch (error) {
        console.error(
          "CommandCode: failed to write session file:",
          error,
        );
      }
    })
    .catch((error) => {
      console.error(
        "CommandCode: IPC server failed to start:",
        error,
      );
      vscode.window.showErrorMessage(
        "CommandCode: Failed to start context server. CLI integration may not work.",
      );
    });

  context.subscriptions.push(contextProvider);
  context.subscriptions.push(ipcServer);
}

export function deactivate(): void {
  if (currentSessionId && currentIdeName) {
    removeSessionFile(currentSessionId, currentIdeName);
  }
  ipcServer?.dispose();
  mcpServer?.stop();
}
