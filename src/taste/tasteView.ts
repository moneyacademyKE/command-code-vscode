import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";

type Entry =
  | { kind: "root"; label: string }
  | { kind: "file"; label: string; filePath: string; preview: string }
  | { kind: "category"; label: string; filePath: string }
  | { kind: "info"; label: string };

export class TasteTreeProvider implements vscode.TreeDataProvider<Entry> {
  private readonly emitter = new vscode.EventEmitter<Entry | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(public readonly workspaceRoot: string) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: Entry): vscode.TreeItem {
    if (element.kind === "file" || element.kind === "category") {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None,
      );
      item.resourceUri = vscode.Uri.file(element.filePath);
      item.tooltip = element.filePath;
      item.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [vscode.Uri.file(element.filePath)],
      };
      item.iconPath = new vscode.ThemeIcon("file");
      if (element.kind === "file" && element.preview) {
        item.description = element.preview;
      }
      return item;
    }
    if (element.kind === "root") {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = new vscode.ThemeIcon("circuit-board");
      return item;
    }
    return new vscode.TreeItem(element.label);
  }

  async getChildren(element?: Entry): Promise<Entry[]> {
    if (element) return [];
    const tasteDir = path.join(this.workspaceRoot, ".commandcode", "taste");
    try {
      const stats = await fs.stat(tasteDir);
      if (!stats.isDirectory()) return [];
    } catch {
      return [
        { kind: "info", label: "No taste learned yet — run cmd taste learn ." },
      ];
    }

    const entries: Entry[] = [];
    let mainPreview = "";
    try {
      const mainFile = path.join(tasteDir, "taste.md");
      mainPreview = (await fs.readFile(mainFile, "utf8")).split(/\r?\n/)[0] ?? "";
      if (mainPreview.length > 80) mainPreview = mainPreview.slice(0, 77) + "…";
      entries.push({
        kind: "file",
        label: "taste.md",
        filePath: mainFile,
        preview: mainPreview,
      });
    } catch {
      // no main taste file
    }

    let categoryDirs: string[] = [];
    try {
      categoryDirs = (await fs.readdir(tasteDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      // ignore
    }

    for (const dir of categoryDirs) {
      const categoryFile = path.join(tasteDir, dir, "taste.md");
      try {
        await fs.access(categoryFile);
        entries.push({
          kind: "category",
          label: dir,
          filePath: categoryFile,
        });
      } catch {
        entries.push({ kind: "info", label: `${dir}/ (empty)` });
      }
    }

    if (entries.length === 0) {
      entries.push({ kind: "info", label: "Taste directory is empty." });
    }
    return entries;
  }
}

export function registerTasteWatcher(
  context: vscode.ExtensionContext,
  provider: TasteTreeProvider,
): void {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      provider.workspaceRoot,
      ".commandcode/taste/**/taste.md",
    ),
  );
  watcher.onDidChange(() => provider.refresh());
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(watcher);
}