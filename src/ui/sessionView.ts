import * as vscode from "vscode";

export class SessionTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    items.push(buildCommand("Start Session", "commandcode.start", "$(play)"));
    items.push(buildCommand("Continue Last", "commandcode.continue", "$(history)"));
    items.push(buildCommand("Resume Past…", "commandcode.resume", "$(history)"));
    items.push(buildCommand("Run Headless…", "commandcode.print", "$(terminal)"));
    items.push(buildCommand("Plan…", "commandcode.plan", "$(planning)"));
    items.push(buildCommand("Review PR…", "commandcode.review", "$(git-pull-request)"));
    items.push(buildCommand("Pick Model", "commandcode.model.pick", "$(symbol-misc)"));
    items.push(buildCommand("Pick Permission", "commandcode.permission.pick", "$(shield)"));
    items.push(buildCommand("Show Status", "commandcode.status", "$(info)"));
    return items;
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }
}

function buildCommand(label: string, command: string, icon: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { command, title: label };
  item.iconPath = new vscode.ThemeIcon(icon.replace(/[()]/g, ""));
  return item;
}