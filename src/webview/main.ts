/// <reference lib="dom" />
/**
 * Thin Glass UI Renderer
 */

// @ts-expect-error acquireVsCodeApi is provided by VS Code webview
const vscode = acquireVsCodeApi();

interface SessionItem {
  id: string;
  label: string;
  model?: string;
  goalStatus?: string;
  startedAt?: number;
}

// Minimal application state (mirrored from CLI)
const state = {
  messages: [] as Array<{ id: string, role: string, content: string }>,
  tokens: { prompt: 0, completion: 0, total: 0 },
  modelId: '',
  sessions: [] as SessionItem[],
  statusText: '',
};

// Track which panel is visible

function sendAction(action: string, payload?: Record<string, unknown>) {
  vscode.postMessage({ type: 'action', action, payload });
}

function initUI() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="crosshair tl"></div>
    <div class="crosshair tr"></div>
    <div class="crosshair bl"></div>
    <div class="crosshair br"></div>

    <div class="header">
      <h2>Command Code</h2>
      <div class="metrics">
        <span class="metric" id="token-count">TOKENS // ${state.tokens.total.toLocaleString()}</span>
        <span class="metric" id="model-name">MODEL // ${state.modelId || 'None'}</span>
      </div>
    </div>

    <div class="action-bar">
      <button class="action-btn" data-action="start" title="Start New Session">▶ START</button>
      <button class="action-btn" data-action="continue" title="Continue Last Session">↻ CONTINUE</button>
      <button class="action-btn" data-action="list-sessions" title="Recent Sessions">☰ SESSIONS</button>
      <button class="action-btn" data-action="pick-model" title="Pick Model">⚙ MODEL</button>
      <button class="action-btn" data-action="pick-permission" title="Pick Permission">⚙ PERM</button>
      <button class="action-btn" data-action="show-status" title="Show Status">ⓘ STATUS</button>
    </div>

    <div id="chat-panel" class="panel panel-active">
      <div class="chat-history" id="chat-history"></div>
      <div class="chat-input-container">
        <textarea id="chat-input" placeholder="Type a message..."></textarea>
        <div class="chat-input-row">
          <div class="qr-code"></div>
          <button id="send-btn">Execute</button>
        </div>
      </div>
    </div>

    <div id="sessions-panel" class="panel">
      <div class="panel-header">
        <span>RECENT SESSIONS</span>
        <button class="panel-close" data-panel="sessions">✕</button>
      </div>
      <div class="session-list" id="session-list"></div>
    </div>

    <div id="status-panel" class="panel">
      <div class="panel-header">
        <span>STATUS</span>
        <button class="panel-close" data-panel="status">✕</button>
      </div>
      <pre class="status-content" id="status-content"></pre>
    </div>
  `;

  attachEventListeners();
}

function attachEventListeners() {
  // Action buttons
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action) {
        if (action === 'list-sessions') {
          sendAction('list-sessions');
        } else if (action === 'show-status') {
          sendAction('show-status');
        } else {
          sendAction(action);
        }
      }
    });
  });

  // Panel close buttons
  document.querySelectorAll('.panel-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = (btn as HTMLElement).dataset.panel;
      if (panel) switchPanel('chat');
    });
  });

  // Session list click delegation
  const sessionList = document.getElementById('session-list');
  sessionList?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.session-item') as HTMLElement;
    if (item && item.dataset.sessionId) {
      sendAction('resume-session', { sessionId: item.dataset.sessionId });
    }
  });

  // Chat input
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('send-btn');

  const sendMessage = () => {
    if (input.value.trim()) {
      const prompt = input.value;
      vscode.postMessage({
        type: 'chatInput',
        payload: { prompt }
      });
      appendMessage({ id: 'local-' + Date.now(), role: 'user', content: prompt });
      input.value = '';
    }
  };

  sendBtn?.addEventListener('click', sendMessage);
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function switchPanel(panel: 'chat' | 'sessions' | 'status') {
  activePanel = panel;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('panel-active'));
  const target = document.getElementById(`${panel}-panel`);
  if (target) target.classList.add('panel-active');
}

function appendMessage(m: { id: string, role: string, content: string }) {
  const history = document.getElementById('chat-history');
  if (!history) return;
  switchPanel('chat');
  const div = document.createElement('div');
  div.className = `message message-${m.role}`;
  div.innerHTML = `<span class="message-role">${m.role}</span><span>${m.content}</span>`;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
}

function renderSessionList(sessions: SessionItem[]) {
  const list = document.getElementById('session-list');
  if (!list) return;
  switchPanel('sessions');
  if (sessions.length === 0) {
    list.innerHTML = '<div class="session-empty">No recent sessions.</div>';
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="session-item" data-session-id="${s.id}">
      <span class="session-icon">${s.goalStatus === 'completed' ? '✓' : '○'}</span>
      <div class="session-info">
        <span class="session-label">${escapeHtml(s.label)}</span>
        <span class="session-meta">${s.model ? s.model.split('/').pop() : 'unknown'} · ${s.id.slice(0, 8)}</span>
      </div>
    </div>
  `).join('');
}

function renderStatus(text: string) {
  const content = document.getElementById('status-content');
  if (!content) return;
  switchPanel('status');
  content.textContent = text;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for JSON-RPC payloads from the extension
window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message?.jsonrpc === '2.0' && message.method === 'webview/dispatchEvent') {
    const { type, payload } = message.params;
    switch (type) {
      case 'RenderMessage':
        state.messages.push(payload);
        appendMessage(payload);
        break;
      case 'UpdateTokens': {
        state.tokens = payload;
        const tc = document.getElementById('token-count');
        if (tc) tc.innerText = `TOKENS // ${state.tokens.total.toLocaleString()}`;
        break;
      }
      case 'StdoutChunk': {
        const content = document.getElementById('status-content');
        if (content) {
          switchPanel('status');
          content.textContent += payload.chunk;
          content.scrollTop = content.scrollHeight;
        }
        break;
      }
      case 'ModelChanged': {
        state.modelId = payload.modelId;
        const mn = document.getElementById('model-name');
        if (mn) mn.innerText = `MODEL // ${state.modelId || 'None'}`;
        break;
      }
      case 'SessionList':
        state.sessions = payload.sessions ?? [];
        renderSessionList(state.sessions);
        break;
      case 'StatusResult':
        state.statusText = payload.text ?? '';
        renderStatus(state.statusText);
        break;
      case 'Notification':
        appendMessage({ id: 'sys-' + Date.now(), role: 'system', content: payload.text });
        break;
    }
  }
});

initUI();
