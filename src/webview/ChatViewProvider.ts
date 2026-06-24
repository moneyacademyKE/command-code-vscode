import * as vscode from 'vscode';
import { getEffectiveModel, getEffectivePermissionMode, getActiveCwd } from '../config';
import { resolveCliPath, checkCliVersion } from '../cli/resolve';
import type { EditorContext } from '../context/protocol';
import { Logger } from '../logger';
import { readSessionState } from '../cli/store';

import { SessionManager } from '../sessionManager';

const session = SessionManager.getInstance();

export function setCurrentSessionId(id: string | null) {
  session.currentSessionId = id;
}

export function getCurrentSessionId(): string | null {
  return session.currentSessionId;
}

export function incrementTurnCount(): number {
  return session.incrementTurnCount();
}

export function getTurnCount(): number {
  return session.turnCount;
}

export function resetTurnCount() {
  session.resetTurnCount();
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'cmd-lite.chatView';

  private _view?: vscode.WebviewView;
  private _cliVersion = '';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onEvent?: (eventName: string, data: unknown) => void
  ) {}

  public getModelsLabel(): string {
    return this._buildModelsLabel();
  }

  public updateModelsLabel(): void {
    // Dynamic resolution via readSessionState, no caching needed
  }

  private async _fetchCliInfo() {
    try {
      const cliPath = resolveCliPath();
      const versionResult = await checkCliVersion(cliPath);
      this._cliVersion = versionResult.version || '';
    } catch {
      this._cliVersion = '';
    }
  }

  private _buildModelsLabel(): string {
    const state = readSessionState();
    const model = state.model ?? getEffectiveModel();
    const parts: string[] = [];
    if (model) {
      const short = model.split('/').pop() || model;
      parts.push(short);
    }
    parts.push('taste-1');
    return parts.join(' · ');
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      if (this._onEvent) {
        this._onEvent('webview_interaction', message);
      } else {
        if (message.type === "ping") {
          return;
        }
        Logger.debug('Received message from webview (unhandled):', message);
      }
    });

    // Send initial state to hydrate the webview
    const initPersistedState = readSessionState();
    this.dispatchEvent({
      jsonrpc: "2.0",
      method: "webview/dispatchEvent",
      params: {
        type: "initState",
        payload: {
          modelId: initPersistedState.model ?? getEffectiveModel() ?? '',
          permissionMode: initPersistedState.permissionMode ?? getEffectivePermissionMode(),
          tokens: { prompt: 0, completion: 0, total: 0 },
          sessionId: session.currentSessionId ?? '',
          turnCount: session.turnCount,
          cliVersion: this._cliVersion,
          modelsLabel: this._buildModelsLabel(),
        }
      }
    });

    // Fetch CLI version asynchronously and push when ready
    this._fetchCliInfo().then(() => {
      const postPersistedState = readSessionState();
      this.dispatchEvent({
        jsonrpc: "2.0",
        method: "webview/dispatchEvent",
        params: {
          type: "initState",
          payload: {
            modelId: postPersistedState.model ?? getEffectiveModel() ?? '',
            permissionMode: postPersistedState.permissionMode ?? getEffectivePermissionMode(),
            tokens: { prompt: 0, completion: 0, total: 0 },
            sessionId: session.currentSessionId ?? '',
            turnCount: session.turnCount,
            cliVersion: this._cliVersion,
            modelsLabel: this._buildModelsLabel(),
          }
        }
      });
      this.dispatchContext({
        timestamp: Date.now(),
        workspace: { rootPath: getActiveCwd(), name: '' },
        activeFile: null,
        selection: null,
        openFiles: [],
        git: null,
      });
    });
  }

  public dispatchEvent(eventPayload: unknown) {
    if (this._view) {
      this._view.webview.postMessage(eventPayload);
    }
  }

  /** Send full editor context to the webview sidebar */
  public dispatchContext(context: EditorContext) {
    this.dispatchEvent({
      jsonrpc: "2.0",
      method: "webview/dispatchEvent",
      params: {
        type: "UpdateContext",
        payload: context,
      },
    });
  }

  /** Send session state info to the webview footer */
  public dispatchSessionInfo(sessionId: string, tCount: number) {
    this.dispatchEvent({
      jsonrpc: "2.0",
      method: "webview/dispatchEvent",
      params: {
        type: "UpdateSessionInfo",
        payload: { sessionId, turnCount: tCount },
      },
    });
  }

  /** Send updated turn count */
  public dispatchTurnCount(tCount: number) {
    this.dispatchEvent({
      jsonrpc: "2.0",
      method: "webview/dispatchEvent",
      params: {
        type: "UpdateTurnCount",
        payload: { turnCount: tCount },
      },
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'style.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>Command Code</title>
      </head>
      <body>
        <div id="app"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
