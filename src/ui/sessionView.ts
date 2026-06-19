import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as vscode from "vscode";

const SESSION_PROJECTS_DIR = path.join(os.homedir(), ".commandcode", "projects");

interface SessionMeta {
  title?: string;
  goal?: { text?: string; status?: string; startedAt?: number };
  model?: string;
}

function readSessionMeta(jsonlPath: string): SessionMeta {
  try {
    const raw = fs.readFileSync(jsonlPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const meta: SessionMeta = {};
    for (const line of lines.slice(0, 10)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.title) meta.title = parsed.title;
        if (parsed.goal) meta.goal = parsed.goal;
        if (parsed.model) meta.model = parsed.model;
      } catch {
        // skip unparseable lines
      }
    }
    return meta;
  } catch {
    return {};
  }
}

function slugifyCwd(cwd: string): string {
  return cwd
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function getProjectDir(cwd: string): string {
  const slug = slugifyCwd(cwd);
  return path.join(SESSION_PROJECTS_DIR, slug);
}

export function listSessions(cwd: string): SessionEntry[] {
  const projectDir = getProjectDir(cwd);
  if (!fs.existsSync(projectDir)) return [];
  try {
    const entries = fs.readdirSync(projectDir);
    const sessions: SessionEntry[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl") || entry.includes("checkpoints")) continue;
      const id = entry.replace(".jsonl", "");
      const jsonlPath = path.join(projectDir, entry);
      const meta = readSessionMeta(jsonlPath);
      sessions.push({
        id,
        jsonlPath,
        label: meta.title ?? meta.goal?.text ?? id.slice(0, 8),
        model: meta.model,
        goalStatus: meta.goal?.status,
        startedAt: meta.goal?.startedAt,
      });
    }
    sessions.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return sessions;
  } catch {
    return [];
  }
}

interface SessionEntry {
  id: string;
  label: string;
  model?: string;
  goalStatus?: string;
  startedAt?: number;
  jsonlPath: string;
}

export function getJsonlPathForSession(sessionId: string): string | null {
  const projectsDir = path.join(os.homedir(), ".commandcode", "projects");
  if (!fs.existsSync(projectsDir)) return null;
  for (const slug of fs.readdirSync(projectsDir)) {
    const projectDir = path.join(projectsDir, slug);
    if (!fs.statSync(projectDir).isDirectory()) continue;
    const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
    if (fs.existsSync(jsonlPath)) return jsonlPath;
  }
  return null;
}

export class SessionTreeItem extends vscode.TreeItem {
  readonly session: SessionEntry;

  constructor(session: SessionEntry) {
    const statusIcon = session.goalStatus === "completed" ? "pass-filled" : "circle-outline";
    const label = session.label.length > 50 ? session.label.slice(0, 47) + "…" : session.label;
    const description = session.model
      ? `${session.model.split("/").pop()}`
      : undefined;

    super(label, vscode.TreeItemCollapsibleState.None);
    this.session = session;
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(statusIcon);
    this.command = { command: "cmd-lite.resume", title: "Resume Session", arguments: [session.id] };
    this.tooltip = `Resume session: ${session.id.slice(0, 8)}\nModel: ${session.model ?? "unknown"}\nStatus: ${session.goalStatus ?? "unknown"}`;
    this.contextValue = "session";
  }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) return [];

    const cwd = getActiveCwd();
    const sessions = listSessions(cwd);

    const items: vscode.TreeItem[] = [];

    // Quick actions
    items.push(buildCommand("Start New Session", "cmd-lite.start", "play"));
    items.push(buildCommand("Continue Last Session", "cmd-lite.continue", "history"));

    if (sessions.length > 0) {
      // Separator
      const sep = new vscode.TreeItem("Recent Sessions", vscode.TreeItemCollapsibleState.Expanded);
      sep.contextValue = "separator";
      sep.iconPath = new vscode.ThemeIcon("folder-history");
      items.push(sep);

      for (const session of sessions.slice(0, 20)) {
        items.push(new SessionTreeItem(session));
      }
    }

    // Footer actions
    const footerSep = new vscode.TreeItem("Actions", vscode.TreeItemCollapsibleState.Collapsed);
    footerSep.iconPath = new vscode.ThemeIcon("tools");
    items.push(footerSep);

    items.push(buildCommand("Pick Model", "cmd-lite.model.pick", "symbol-misc"));
    items.push(buildCommand("Pick Permission", "cmd-lite.permission.pick", "shield"));
    items.push(buildCommand("Show Status", "cmd-lite.status", "info"));

    return items;
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }
}

function getActiveCwd(): string {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (folder) return folder.uri.fsPath;
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) return folders[0].uri.fsPath;
  return process.cwd();
}

function buildCommand(label: string, command: string, icon: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { command, title: label };
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}
