import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { registerChatParticipant } from "./chat/participant";
import {
  getActiveCwd,
  showStatusBarEnabled,
} from "./config";
import {
  resolveCliPath,
  validateCliPath,
  checkCliVersion,
  clearCliPathCache,
} from "./cli/resolve";
import { registerSessionCommands } from "./ui/sessionCommands";
import { SessionTreeProvider } from "./ui/sessionView";
import { StatusBar } from "./ui/statusBar";
import { pickModel, pickPermissionMode } from "./ui/pickers";
import { defineHeadlessTask } from "./ui/headless";
import { registerTasteCommands } from "./taste/commands";
import {
  registerTasteWatcher,
  TasteTreeProvider,
} from "./taste/tasteView";
import { ContextProvider } from "./context/provider";
import { IPCServer } from "./context/ipc-server";
import {
  detectIdeName,
  getSocketPath,
  writeSessionFile,
  removeSessionFile,
  cleanupSocket,
} from "./context/session";
import { registerLmTools } from "./tools/lm-tools";
import { showInlineDiff, extractFirstDiffFile, proposedDiffProvider } from "./diff/preview";
import { runParallel, formatParallelResults, type AgentTask } from "./agents/orchestrator";

let currentSessionId: string | null = null;
let currentIdeName: string | null = null;
let ipcServer: IPCServer | null = null;

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
          "commandcode.cliPath",
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
          vscode.commands.executeCommand("commandcode.update");
        }
      });
    }
  }

  const outputChannel = vscode.window.createOutputChannel("Command Code");

  const statusBar = new StatusBar();
  if (showStatusBarEnabled()) statusBar.show();

  const tasteProvider = new TasteTreeProvider(getActiveCwd());
  const sessionProvider = new SessionTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "commandcode.tasteView",
      tasteProvider,
    ),
    vscode.window.registerTreeDataProvider(
      "commandcode.sessionView",
      sessionProvider,
    ),
  );

  registerTasteWatcher(context, tasteProvider);
  registerTasteCommands(context, tasteProvider, outputChannel);
  registerSessionCommands(context, statusBar, sessionProvider, outputChannel);
  registerChatParticipant(context);
  registerLmTools(context);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "commandcode-diff",
      proposedDiffProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("commandcode.model.pick", () => pickModel()),
    vscode.commands.registerCommand("commandcode.permission.pick", () =>
      pickPermissionMode(),
    ),
    vscode.commands.registerCommand("commandcode.diff.show", (output: string) => {
      const diff = extractFirstDiffFile(output);
      if (diff) {
        showInlineDiff(diff.filePath, diff.content, "Command Code Proposal");
      } else {
        vscode.window.showInformationMessage("No code changes found in the output.");
      }
    }),
    vscode.commands.registerCommand("commandcode.agents.parallel", async () => {
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
        const results = await runParallel(tasks);
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
      .getConfiguration("commandcode")
      .get<string>("defaultPermissionMode", "standard") as
      | "standard"
      | "plan"
      | "auto-accept") ?? "standard",
  );

  vscode.tasks.registerTaskProvider("commandcode", {
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
      if (e.affectsConfiguration("commandcode.cliPath")) {
        clearCliPathCache();
      }
      if (e.affectsConfiguration("commandcode.showStatusBar")) {
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
  const authToken = crypto.randomUUID();

  cleanupSocket(socketPath);

  const contextProvider = new ContextProvider();
  ipcServer = new IPCServer(contextProvider, socketPath, authToken);

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
}
