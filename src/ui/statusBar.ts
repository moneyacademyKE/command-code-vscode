import * as vscode from "vscode";
import { getParticipantModel } from "../chat/participant";
import type { PermissionMode } from "../cli/types";

export interface StatusState {
  permissionMode: PermissionMode;
  busy: boolean;
}

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private state: StatusState = { permissionMode: "standard", busy: false };

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.command = "cmd-lite.permission.pick";
    this.update();
  }

  setPermissionMode(mode: PermissionMode): void {
    this.state.permissionMode = mode;
    this.update();
  }

  setBusy(busy: boolean): void {
    this.state.busy = busy;
    this.update();
  }

  show(): void {
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  private update(): void {
    const model = getParticipantModel();
    const mode = this.state.permissionMode;
    const busy = this.state.busy ? "$(loading~spin) " : "";
    const modelPart = model ? ` · ${model}` : "";
    this.item.text = `${busy}cmd · ${mode}${modelPart}`;
    this.item.tooltip = "Command Code — click to change permission mode";
  }
}