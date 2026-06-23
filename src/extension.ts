import * as crypto from "node:crypto";
import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { registerChatParticipant, setParticipantPermissionMode } from "./chat/participant";
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
  detectLocalCli,
  setLocalCliPathOverride,
  installOrUpdateLocalCli,
  fetchLatestTarballInfo,
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
import { collectDiagnostics } from "./context/diagnostics";
import { ChatViewProvider, incrementTurnCount, setCurrentSessionId } from "./webview/ChatViewProvider";
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
import { runParallel, formatParallelResults, type AgentTask } from "./agents/orchestrator";
import { initializePermissionStore } from "./permission/store";
import { restoreLastCheckpoint } from "./git/checkpoint";
import { CmdMcpServer } from "./mcp/server";
import { diffProposeTool } from "./mcp/tools/diff";
import { terminalTool } from "./mcp/tools/terminal";
import { diagnosticsTool } from "./mcp/tools/diagnostics";
import { fileSearchTool } from "./mcp/tools/fileSearch";
import { generateMcpConfig } from "./mcp/config";
import { Logger } from "./logger";
import { SessionManager } from "./sessionManager";

const session = SessionManager.getInstance();

async function handleWebviewAction(
  msg: { type: "action"; action: string; payload?: Record<string, unknown> },
  chatProvider: ChatViewProvider,
): Promise<void> {
  const cwd = getActiveCwd();

  switch (msg.action) {
    case "start":
      vscode.commands.executeCommand("cmd-lite.start");
      break;
    case "clear-session":
      session.activeAbortController?.abort();
      session.reset();
      for (const t of vscode.window.terminals) {
        if (t.name === "Command Code") {
          t.dispose();
        }
      }
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
    case "pick-model": {
      const selected = await pickModel();
      if (selected) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "modelChanged", payload: { modelId: selected } }
        });
      }
      break;
    }
    case "pick-permission": {
      const selected = await pickPermissionMode();
      if (selected) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "permChanged", payload: { permissionMode: selected } }
        });
      }
      break;
    }
    case "set-permission-mode": {
      const mode = msg.payload?.permissionMode as "standard" | "plan" | "auto-accept" | undefined;
      if (mode) {
        setParticipantPermissionMode(mode);
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "permChanged", payload: { permissionMode: mode } }
        });
      }
      break;
    }
    case "interrupt-execution": {
      if (session.activeAbortController) {
        session.activeAbortController.abort();
        session.activeAbortController = null;
      }
      break;
    }
    case "checkpoint-restore": {
      vscode.commands.executeCommand("cmd-lite.checkpoint.restore");
      break;
    }
    case "open-in-editor": {
      // Open the webview input in VS Code's native input box
      const text = await vscode.window.showInputBox({
        prompt: "Type a message for Command Code",
        placeHolder: "Your prompt here... (multiline with Shift+Enter in some UIs)",
        value: "",
      });
      if (text && text.trim()) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "chatInput",
            payload: text.trim(),
          },
        });
      }
      break;
    }
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

async function checkLatestVersionBackground(currentVersion: string): Promise<void> {
  try {
    const latest = await fetchLatestTarballInfo();
    if (latest.version !== currentVersion) {
      vscode.window.showInformationMessage(
        `A new version of Command Code CLI is available (v${latest.version}). Update now?`,
        "Update",
        "Later"
      ).then(async (choice) => {
        if (choice === "Update") {
          await vscode.commands.executeCommand("cmd-lite.update");
        }
      });
    }
  } catch (err) {
    // ignore network errors for background checks
  }
}

async function bootstrapLocalCli(context: vscode.ExtensionContext): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Setting up Command Code CLI...",
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: "Bootstrapping dependencies..." });
        const { version } = await installOrUpdateLocalCli(context.globalStorageUri, (pct) => {
          progress.report({ message: `Downloading CLI... ${pct}%` });
        });
        vscode.window.showInformationMessage(`Command Code CLI successfully installed: v${version}`);
        
        const localPath = detectLocalCli(context.globalStorageUri);
        if (localPath) {
          setLocalCliPathOverride(localPath);
          void vscode.window.setStatusBarMessage(`Command Code CLI resolved to local v${version}`, 3000);
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to bootstrap local CLI: ${err instanceof Error ? err.message : String(err)}. Please try running 'cmd-lite.update' manually.`
        );
      }
    }
  );
}

async function validateAndCheckCli(cliPath: string, context: vscode.ExtensionContext): Promise<void> {
  const configured = vscode.workspace.getConfiguration("cmd-lite").get<string>("cliPath", "cmd").trim();
  const isDefault = configured === "cmd" || configured === "command-code";

  if (isDefault) {
    const localPath = detectLocalCli(context.globalStorageUri);
    if (!localPath) {
      await bootstrapLocalCli(context);
      return;
    }
  }

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
    const version = await checkCliVersion(cliPath);
    if (!version.compatible && version.message) {
      vscode.window.showWarningMessage(
        `Command Code: ${version.message}`,
        "Update",
      ).then((choice) => {
        if (choice === "Update") {
          vscode.commands.executeCommand("cmd-lite.update");
        }
      });
    } else if (isDefault && version.version) {
      void checkLatestVersionBackground(version.version);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const localCli = detectLocalCli(context.globalStorageUri);
  if (localCli) {
    setLocalCliPathOverride(localCli);
  }

  const cliPath = resolveCliPath();

  void vscode.window.setStatusBarMessage(
    `Command Code extension loaded (cli: ${cliPath})`,
    3000,
  );

  validateAndCheckCli(cliPath, context);

  Logger.initialize("Command Code");

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
        const input = data as { type: "chatInput"; payload: { prompt: string; isBash?: boolean; plan?: boolean } };
        let prompt = input.payload?.prompt;
        if (!prompt) return;

        // Handle /fix command to automatically gather workspace diagnostics and run fixing agent
        if (prompt.trim() === "/fix" || prompt.trim().startsWith("/fix ")) {
          const extraInstruction = prompt.trim().slice(4).trim();
          
          const EXCLUDED_PATTERNS = [
            /node_modules/i,
            /\.git/i,
            /dist/i,
            /build/i,
            /\.svelte-kit/i,
            /\.next/i,
            /\.nuxt/i
          ];
          
          // Gather workspace diagnostics
          const fileDiags = collectDiagnostics();
          
          // Filter out excluded folders and keep only Errors and Warnings
          const filteredDiags = fileDiags.filter(fd => {
            const isExcluded = EXCLUDED_PATTERNS.some(pattern => pattern.test(fd.file));
            return !isExcluded;
          }).map(fd => ({
            ...fd,
            diagnostics: fd.diagnostics.filter(d => d.severity === "error" || d.severity === "warning")
          })).filter(fd => fd.diagnostics.length > 0);
          
          // Flatten diagnostics for sorting and capping
          const allDiagnostics: { file: string; relativePath: string; diag: any }[] = [];
          for (const fd of filteredDiags) {
            for (const d of fd.diagnostics) {
              allDiagnostics.push({ file: fd.file, relativePath: fd.relativePath, diag: d });
            }
          }
          
          // Sort Errors before Warnings
          allDiagnostics.sort((a, b) => {
            const severityA = a.diag.severity === "error" ? 0 : 1;
            const severityB = b.diag.severity === "error" ? 0 : 1;
            return severityA - severityB;
          });
          
          const MAX_DIAGNOSTICS = 30;
          const cappedDiagnostics = allDiagnostics.slice(0, MAX_DIAGNOSTICS);
          const totalCollected = allDiagnostics.length;
          
          if (cappedDiagnostics.length === 0) {
            const msgId = `fix-info-${Date.now()}`;
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "StreamMessageChunk",
                payload: { id: msgId, role: "system", chunk: `No compilation errors or warnings found in the active workspace.` },
              },
            });
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: { type: "StreamFinished", payload: { id: msgId } }
            });
            return;
          }
          
          // Format diagnostics into a prompt for the agent, grouping by file path
          let formattedPrompt = `Please resolve the compilation diagnostics (errors and warnings) in the active workspace.`;
          if (extraInstruction) {
            formattedPrompt += `\nAdditional instruction: "${extraInstruction}"`;
          }
          formattedPrompt += `\n\nDiagnostics found:`;
          
          const fileGroups: Record<string, { relativePath: string; diagnostics: any[] }> = {};
          for (const item of cappedDiagnostics) {
            if (!fileGroups[item.file]) {
              fileGroups[item.file] = { relativePath: item.relativePath, diagnostics: [] };
            }
            fileGroups[item.file].diagnostics.push(item.diag);
          }
          
          for (const [file, group] of Object.entries(fileGroups)) {
            formattedPrompt += `\n\nFile: ${group.relativePath || file}`;
            for (const d of group.diagnostics) {
              const severity = d.severity.toUpperCase();
              const line = d.range.startLine;
              const col = d.range.startCol;
              const source = d.source ? ` [${d.source}]` : "";
              const code = d.code ? ` (${d.code})` : "";
              formattedPrompt += `\n- Line ${line}, Col ${col}: [${severity}] ${d.message}${source}${code}`;
            }
          }
          
          if (totalCollected > MAX_DIAGNOSTICS) {
            formattedPrompt += `\n\n*Note: Showing first ${MAX_DIAGNOSTICS} out of ${totalCollected} diagnostics in the workspace.*`;
          }
          
          prompt = formattedPrompt;
        }

        // Handle direct Bash execution mode
        if (input.payload?.isBash) {
          Logger.info(`[webview] bash command received: ${prompt}`);
          const msgId = `bash-${Date.now()}`;
          chatProvider.dispatchEvent({
            jsonrpc: "2.0",
            method: "webview/dispatchEvent",
            params: {
              type: "StreamMessageChunk",
              payload: { id: msgId, role: "system", chunk: `> ${prompt}\n` },
            },
          });
          const child = spawn(prompt, [], { cwd: getActiveCwd(), shell: true });
          child.stdout.on("data", (chunk) => {
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "StreamMessageChunk",
                payload: { id: msgId, role: "system", chunk: chunk.toString() },
              },
            });
          });
          child.stderr.on("data", (chunk) => {
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "StreamMessageChunk",
                payload: { id: msgId, role: "system", chunk: chunk.toString() },
              },
            });
          });
          child.on("close", (code) => {
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "StreamMessageChunk",
                payload: { id: msgId, role: "system", chunk: `\n[Process completed with exit code ${code}]` },
              },
            });
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: { type: "StreamFinished", payload: { id: msgId } }
            });
          });
          return;
        }

        Logger.info(`[webview] chatInput received: ${prompt.slice(0, 80)}`);
        let streamedAny = false;
        const msgId = `agent-${Date.now()}`;

        // Increment turn count and push session info to footer
        const turnCount = incrementTurnCount();
        if (session.currentSessionId) {
          chatProvider.dispatchSessionInfo(session.currentSessionId, turnCount);
        }

        session.activeAbortController = new AbortController();
        try {
          const result = await runPrint(prompt, {
            cwd: getActiveCwd(),
            model: getEffectiveModel(),
            maxTurns: getEffectiveMaxTurns(),
            permissionMode: getEffectivePermissionMode(),
            plan: input.payload?.plan,
            onStdoutChunk: (chunk: string) => {
              streamedAny = true;
              chatProvider.dispatchEvent({
                jsonrpc: "2.0",
                method: "webview/dispatchEvent",
                params: {
                  type: "StreamMessageChunk",
                  payload: {
                    id: msgId,
                    role: "agent",
                    chunk: chunk,
                  },
                },
              });
            },
            timeoutMs: 5 * 60 * 1000,
            signal: session.activeAbortController.signal,
          });

          Logger.info(`[webview] runPrint done: exit=${result.exitCode}, stdout=${result.stdout.length}b, streamed=${streamedAny}`);

          // Fallback: if nothing streamed but stdout has content, send it now
          if (!streamedAny && result.stdout.trim()) {
            chatProvider.dispatchEvent({
              jsonrpc: "2.0",
              method: "webview/dispatchEvent",
              params: {
                type: "RenderMessage",
                payload: {
                  id: msgId,
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
          Logger.error(`[webview] runPrint error: ${message}`);
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
        } finally {
          session.activeAbortController = null;
          chatProvider.dispatchEvent({
            jsonrpc: "2.0",
            method: "webview/dispatchEvent",
            params: { type: "StreamFinished", payload: { id: msgId } }
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
      session.ipcServer?.dispatchToWebviewOwner(eventName, data);
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
  registerTasteCommands(context, tasteProvider, Logger.instance);
  initializePermissionStore(context);
  registerSessionCommands(context, statusBar, sessionProvider, Logger.instance, chatProvider);
  registerChatParticipant(context);
  registerLmTools(context);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "cmd-lite-diff",
      proposedDiffProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.focusChatInput", async () => {
      await vscode.commands.executeCommand("cmd-lite.chatView.focus");
      setTimeout(() => {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "FocusInput",
            payload: {}
          }
        });
      }, 100);
    }),
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
        Logger.clear();
        Logger.info(formatted);
        Logger.show(true);
      } finally {
        statusBar.setBusy(false);
      }
    }),
    vscode.commands.registerCommand("cmd-lite.generateMcpConfig", async () => {
      await generateMcpConfig();
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
      Logger.dispose();
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cmd-lite.cliPath")) {
        clearCliPathCache();
        const newCliPath = resolveCliPath();
        validateAndCheckCli(newCliPath, context);
      }
      if (e.affectsConfiguration("cmd-lite.showStatusBar")) {
        if (showStatusBarEnabled()) statusBar.show();
        else statusBar.hide();
      }
    }),
  );

  // --- IPC context server ---
  const sessionId = crypto.randomUUID();
  session.currentSessionId = sessionId;
  setCurrentSessionId(sessionId);
  const ideName = detectIdeName();
  session.currentIdeName = ideName;
  const socketPath = getSocketPath(sessionId, ideName);
  const mcpSocketPath = getSocketPath(sessionId + "-mcp", ideName);
  const authToken = crypto.randomUUID();

  cleanupSocket(socketPath);
  cleanupSocket(mcpSocketPath);
  cleanupStaleSockets(ideName);

  const contextProvider = new ContextProvider();
  session.ipcServer = new IPCServer(contextProvider, socketPath, authToken);

  session.ipcServer.setWebviewDispatcher((eventPayload) => {
    chatProvider.dispatchEvent(eventPayload);
  });

  // ── Context push to webview ──────────────────────────────────
  const pushContext = async () => {
    try {
      const ctx = await contextProvider.getContext();
      chatProvider.dispatchContext(ctx);
    } catch (err) {
      Logger.warn("Context push failed:", err);
    }
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(pushContext),
    vscode.workspace.onDidSaveTextDocument(pushContext),
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          pushContext();
        }
      },
    ),
  );

  // Push initial context once webview is resolved (deferred)
  setTimeout(pushContext, 1000);

  session.mcpServer = new CmdMcpServer(mcpSocketPath, [
    terminalTool,
    diffProposeTool,
    diagnosticsTool,
    fileSearchTool,
  ]);
  session.mcpServer.start();

  session.ipcServer.start()
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
        Logger.error("CommandCode: failed to write session file:", error);
      }
    })
    .catch((error) => {
      Logger.error("CommandCode: IPC server failed to start:", error);
      vscode.window.showErrorMessage(
        "CommandCode: Failed to start context server. CLI integration may not work.",
      );
    });

  context.subscriptions.push(contextProvider);
  context.subscriptions.push(session.ipcServer);
}

export function deactivate(): void {
  if (session.currentSessionId && session.currentIdeName) {
    removeSessionFile(session.currentSessionId, session.currentIdeName);
  }
  session.ipcServer?.dispose();
  session.mcpServer?.stop();
}
