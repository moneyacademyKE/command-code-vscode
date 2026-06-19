import * as vscode from "vscode";
import type {
  EditorContext,
  ActiveFileInfo,
  SelectionInfo,
  OpenFileInfo,
  WorkspaceInfo,
  CursorInfo,
} from "./protocol";
import { getGitContext } from "./git";

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getWorkspaceName(): string | undefined {
  return vscode.workspace.name;
}

function getRelativePath(absolutePath: string): string {
  const root = getWorkspaceRoot();
  if (!root) return absolutePath;
  return absolutePath.startsWith(root)
    ? absolutePath.slice(root.length + 1)
    : absolutePath;
}

function getTabSize(
  options: vscode.TextEditorOptions,
): number {
  return typeof options.tabSize === "number" ? options.tabSize : 4;
}

function buildCursorInfo(
  position: vscode.Position,
): CursorInfo {
  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

function buildActiveFileInfo(
  editor: vscode.TextEditor,
): ActiveFileInfo {
  const { document, selection, options } = editor;
  const position = selection.active;

  return {
    path: document.uri.fsPath,
    relativePath: getRelativePath(document.uri.fsPath),
    language: document.languageId,
    lineCount: document.lineCount,
    cursor: buildCursorInfo(position),
    encoding:
      document.uri.scheme === "file"
        ? "utf-8"
        : document.uri.scheme,
    tabSize: getTabSize(options),
  };
}

function buildSelectionInfo(
  editor: vscode.TextEditor,
  maxLength: number,
): SelectionInfo | null {
  const { selection, document } = editor;
  if (selection.isEmpty) return null;

  const text = document.getText(selection);
  const truncatedText =
    text.length > maxLength
      ? text.substring(0, maxLength)
      : text;

  return {
    text: truncatedText,
    startLine: selection.start.line + 1,
    endLine: selection.end.line + 1,
    lineCount: selection.end.line - selection.start.line + 1,
  };
}

function buildOpenFileInfo(
  editor: vscode.TextEditor,
  activeFilePath: string | undefined,
): OpenFileInfo {
  const { document } = editor;
  return {
    path: document.uri.fsPath,
    relativePath: getRelativePath(document.uri.fsPath),
    language: document.languageId,
    isActive: document.uri.fsPath === activeFilePath,
  };
}

function deduplicateFiles<T extends { path: string }>(
  files: T[],
): T[] {
  return files.filter(
    (file, index, self) =>
      self.findIndex((f) => f.path === file.path) === index,
  );
}

export class ContextProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private cachedContext: EditorContext | null = null;
  private config: vscode.WorkspaceConfiguration;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.config = vscode.workspace.getConfiguration(
      "cmd-lite.context",
    );
    this.setupListeners();
    void this.updateContext();
  }

  private setupListeners(): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() =>
        this.updateContext(),
      ),
      vscode.window.onDidChangeTextEditorSelection(() =>
        this.debouncedUpdate(),
      ),
      vscode.workspace.onDidOpenTextDocument(() =>
        this.updateContext(),
      ),
      vscode.workspace.onDidCloseTextDocument(() =>
        this.updateContext(),
      ),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          !e.affectsConfiguration("cmd-lite.context")
        )
          return;
        this.config = vscode.workspace.getConfiguration(
          "cmd-lite.context",
        );
        void this.updateContext();
      }),
    );
  }

  async getContext(): Promise<EditorContext> {
    if (!this.cachedContext) {
      this.cachedContext = await this.buildContext();
    }
    return this.cachedContext;
  }

  private debouncedUpdate(): void {
    if (this.updateTimer !== null) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      void this.updateContext();
    }, 100);
  }

  private async updateContext(): Promise<void> {
    this.cachedContext = await this.buildContext();
  }

  private async buildContext(): Promise<EditorContext> {
    const workspace = this.getWorkspaceInfo();
    const activeFile = this.getActiveFileInfo();
    const selection = this.getSelectionInfo();
    const openFiles = this.getOpenFiles();
    const git = await getGitContext(workspace.rootPath);

    return {
      timestamp: Date.now(),
      workspace,
      activeFile,
      selection,
      openFiles,
      git,
    };
  }

  private getWorkspaceInfo(): WorkspaceInfo {
    const rootPath = getWorkspaceRoot() ?? process.cwd();
    const name = getWorkspaceName();
    return { rootPath, name };
  }

  private getActiveFileInfo(): ActiveFileInfo | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    return buildActiveFileInfo(editor);
  }

  private getSelectionInfo(): SelectionInfo | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    const maxLength = this.config.get<number>(
      "maxSelectionLength",
      10000,
    );
    return buildSelectionInfo(editor, maxLength);
  }

  private getOpenFiles(): OpenFileInfo[] {
    const activeEditor = vscode.window.activeTextEditor;
    const activeFilePath =
      activeEditor?.document.uri.fsPath;
    const files = vscode.window.visibleTextEditors.map(
      (editor) => buildOpenFileInfo(editor, activeFilePath),
    );
    return deduplicateFiles(files);
  }

  async openFile(filePath: string): Promise<boolean> {
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
      return true;
    } catch {
      return false;
    }
  }

  async applyEdit(editPayload: any): Promise<boolean> {
    if (!editPayload || typeof editPayload !== "object") return false;
    try {
      const workspaceEdit = new vscode.WorkspaceEdit();
      
      // Attempt to parse a standard { "file:///path": [{ range: [{line, character}, {line, character}], newText: "..." }] }
      for (const [uriStr, edits] of Object.entries(editPayload)) {
        const uri = vscode.Uri.parse(uriStr);
        if (Array.isArray(edits)) {
          for (const edit of edits) {
            if (edit.range && typeof edit.newText === "string") {
              const start = new vscode.Position(edit.range[0].line, edit.range[0].character);
              const end = new vscode.Position(edit.range[1].line, edit.range[1].character);
              workspaceEdit.replace(uri, new vscode.Range(start, end), edit.newText);
            }
          }
        }
      }
      return await vscode.workspace.applyEdit(workspaceEdit);
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
