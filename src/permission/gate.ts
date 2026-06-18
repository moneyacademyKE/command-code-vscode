import * as vscode from "vscode";

export interface PermissionRequest {
  action: string;
  description: string;
  filePaths?: string[];
  category: "file-read" | "file-write" | "shell" | "network" | "other";
}

export type PermissionChoice = "allow-once" | "allow-always" | "deny-once" | "deny-always";

export class PermissionGate implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private resolve: ((value: PermissionChoice) => void) | null = null;

  constructor(
    extensionUri: vscode.Uri,
    private readonly requests: PermissionRequest[],
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "cmd-lite.permissions",
      "Command Code — Permissions",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.webview.html = this.buildHtml();
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, "assets", "icon.png");

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((msg) => {
        switch (msg.command) {
          case "respond":
            this.resolve?.(msg.choice as PermissionChoice);
            this.panel.dispose();
            break;
        }
      }),
      this.panel.onDidDispose(() => {
        this.resolve?.("deny-once");
        this.dispose();
      }),
    );
  }

  waitForChoice(): Promise<PermissionChoice> {
    return new Promise<PermissionChoice>((resolve) => {
      this.resolve = resolve;
    });
  }

  private buildHtml(): string {
    const requestHtml = this.requests.map((r) => {
      const categoryIcon = {
        "file-read": "📂",
        "file-write": "✏️",
        "shell": "💻",
        "network": "🌐",
        "other": "❓",
      }[r.category];

      const filesHtml = r.filePaths
        ? `<ul>${r.filePaths.map((f) => `<li style="color: var(--vscode-textLink-foreground); font-family: monospace; font-size: 12px;">${escapeHtml(f)}</li>`).join("")}</ul>`
        : "";

      return `
        <div class="request">
          <div class="request-header">
            <span class="tag tag-${r.category}">${categoryIcon} ${r.category}</span>
            <strong>${escapeHtml(r.action)}</strong>
          </div>
          <p class="desc">${escapeHtml(r.description)}</p>
          ${filesHtml}
        </div>
      `;
    }).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Command Code — Permissions</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: 20px;
      font-family: var(--vscode-font-family, -apple-system, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
    h2 {
      margin-bottom: 8px;
      font-size: 16px;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
    }
    .request {
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .request-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }
    .tag-file-read { background: #3b82f620; color: #3b82f6; }
    .tag-file-write { background: #f59e0b20; color: #f59e0b; }
    .tag-shell { background: #8b5cf620; color: #8b5cf6; }
    .tag-network { background: #10b98120; color: #10b981; }
    .tag-other { background: #6b728020; color: #6b7280; }
    .desc {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    ul { padding-left: 20px; }
    .buttons {
      display: flex;
      gap: 8px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    .btn-allow-once { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-allow-once:hover { background: var(--vscode-button-hoverBackground); }
    .btn-allow-always { background: #059669; color: white; }
    .btn-allow-always:hover { background: #047857; }
    .btn-deny-once { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-deny-once:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-deny-always { background: #dc2626; color: white; }
    .btn-deny-always:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <h2>🔐 Command Code — Permissions</h2>
  <p class="subtitle">The following actions require your approval before execution.</p>
  ${requestHtml}
  <div class="buttons">
    <button class="btn-allow-once" onclick="respond('allow-once')">✅ Allow Once</button>
    <button class="btn-allow-always" onclick="respond('allow-always')">✅ Always Allow</button>
    <button class="btn-deny-once" onclick="respond('deny-once')">❌ Deny</button>
    <button class="btn-deny-always" onclick="respond('deny-always')">🚫 Always Deny</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function respond(choice) {
      vscode.postMessage({ command: 'respond', choice });
    }
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
