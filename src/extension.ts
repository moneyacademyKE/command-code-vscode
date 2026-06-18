import * as vscode from "vscode";
import { registerChatParticipant } from "./chat/participant";
import {
  getActiveCwd,
  showStatusBarEnabled,
} from "./config";
import { resolveCliPath } from "./cli/resolve";
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

export function activate(context: vscode.ExtensionContext): void {
  const cliPath = resolveCliPath();
  void vscode.window.setStatusBarMessage(
    `Command Code extension loaded (cli: ${cliPath})`,
    3000,
  );

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
  registerTasteCommands(context, tasteProvider);
  registerSessionCommands(context, statusBar, sessionProvider);
  registerChatParticipant(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("commandcode.model.pick", () => pickModel()),
    vscode.commands.registerCommand("commandcode.permission.pick", () =>
      pickPermissionMode(),
    ),
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
    dispose: () => statusBar.hide(),
  });
}

export function deactivate(): void {
  // nothing to dispose — context.subscriptions handles it
}