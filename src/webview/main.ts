/// <reference lib="dom" />
/**
 * TUI-Inspired Webview Renderer
 *
 * Mirrors the Command Code CLI TUI experience: persistent status footer,
 * context sidebar, structured message rendering (thought accordions, tool
 * calls, diff blocks), and session-aware state tracking for long-horizon goals.
 */
import { marked } from 'marked';
import { escapeHtml } from '../util/util';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

interface SessionItem {
  id: string;
  label: string;
  model?: string;
  goalStatus?: string;
  startedAt?: number;
}

interface ContextInfo {
  workspaceRoot: string;
  activeFile: { path: string; language: string } | null;
  openFiles: Array<{ path: string; language: string; isActive: boolean }>;
  gitBranch: string | null;
  dirtyFilesCount: number;
  dirtyFiles: string[];
  diagnosticsCount: number;
}

interface MessageItem {
  id: string;
  role: string;
  content: string;
  raw?: string;
  isImage?: boolean;
  isDiffProposal?: boolean;
  dataUri?: string;
  diffText?: string;
  diffResponse?: 'accept' | 'reject';
}

const state: {
  tokens: { prompt: number; completion: number; total: number };
  modelId: string;
  permissionMode: string;
  statusText: string;
  sessions?: SessionItem[];
  currentSessionId: string | null;
  turnCount: number;
  isStreaming: boolean;
  context: ContextInfo;
  messages: MessageItem[];
  activePanel: 'chat' | 'sessions' | 'status' | 'agents';
  inputDraft: string;
  agents: { name: string; task: string }[];
  continuousLearning: boolean;
  cliVersion: string;
  modelsLabel: string;
} = {
  tokens: { prompt: 0, completion: 0, total: 0 },
  modelId: '',
  permissionMode: '',
  statusText: '',
  currentSessionId: null,
  turnCount: 0,
  isStreaming: false,
  context: {
    workspaceRoot: '',
    activeFile: null,
    openFiles: [],
    gitBranch: null,
    dirtyFilesCount: 0,
    dirtyFiles: [],
    diagnosticsCount: 0,
  },
  messages: [],
  activePanel: 'chat',
  inputDraft: '',
  agents: [],
  continuousLearning: true,
  cliVersion: '',
  modelsLabel: '',
};

function saveState() {
  vscode.setState({
    tokens: state.tokens,
    modelId: state.modelId,
    permissionMode: state.permissionMode,
    statusText: state.statusText,
    sessions: state.sessions,
    currentSessionId: state.currentSessionId,
    turnCount: state.turnCount,
    context: state.context,
    messages: state.messages,
    activePanel: state.activePanel,
    inputDraft: state.inputDraft,
    agents: state.agents,
    continuousLearning: state.continuousLearning,
    cliVersion: state.cliVersion,
    modelsLabel: state.modelsLabel,
  });
}

function addOrUpdateMessage(m: MessageItem) {
  const idx = state.messages.findIndex(item => item.id === m.id);
  if (idx !== -1) {
    state.messages[idx] = { ...state.messages[idx], ...m };
  } else {
    state.messages.push(m);
  }
  saveState();
}

let isExecuting = false;
let statusTimer: ReturnType<typeof setInterval> | null = null;
let executionStartTime = 0;
let streamingStartTime = 0;

// Autocomplete State
let autocompleteActive = false;
let autocompleteItems: string[] = [];
let autocompleteSelectedIndex = 0;
let autocompleteTokenStart = 0;
let autocompleteTokenEnd = 0;
let autocompleteTokenType: '/' | '@' | '!' | null = null;

function getActiveToken(text: string, caretPos: number): { type: '/' | '@' | '!' | null; query: string; start: number; end: number } {
  let start = caretPos;
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }
  const token = text.slice(start, caretPos);
  if (token.startsWith('@')) {
    return { type: '@', query: token.slice(1), start, end: caretPos };
  }
  if (token.startsWith('/')) {
    return { type: '/', query: token.slice(1), start, end: caretPos };
  }
  if (token.startsWith('!')) {
    return { type: '!', query: token.slice(1), start, end: caretPos };
  }
  return { type: null, query: '', start, end: caretPos };
}

function updateAutocompleteList() {
  const listEl = document.getElementById('autocomplete-list');
  if (!listEl) return;

  if (!autocompleteActive || autocompleteItems.length === 0) {
    listEl.classList.add('hidden');
    return;
  }

  listEl.classList.remove('hidden');
  listEl.innerHTML = autocompleteItems.map((item, index) => {
    const isSelected = index === autocompleteSelectedIndex;
    const prefix = autocompleteTokenType === '@' ? '@' : autocompleteTokenType === '/' ? '/' : '!';
    return `<div class="autocomplete-item ${isSelected ? 'selected' : ''}" data-index="${index}">${prefix}${escapeHtml(item)}</div>`;
  }).join('');
}

function insertAutocompleteSelection() {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  if (!input) return;

  const prefix = autocompleteTokenType === '@' ? '@' : autocompleteTokenType === '/' ? '/' : '!';
  const val = autocompleteItems[autocompleteSelectedIndex] + ' ';
  const text = input.value;
  const before = text.slice(0, autocompleteTokenStart);
  const after = text.slice(autocompleteTokenEnd);

  input.value = before + prefix + val + after;
  input.selectionStart = input.selectionEnd = autocompleteTokenStart + prefix.length + val.length;
  
  hideAutocomplete();
  input.focus();
}

function hideAutocomplete() {
  autocompleteActive = false;
  autocompleteItems = [];
  autocompleteSelectedIndex = 0;
  updateAutocompleteList();
}

function handleInputOrCursorChange(input: HTMLTextAreaElement) {
  const caretPos = input.selectionStart;
  const text = input.value;
  const token = getActiveToken(text, caretPos);

  if (!token.type) {
    hideAutocomplete();
    return;
  }

  let items: string[] = [];
  if (token.type === '/') {
    const all = ['help', 'clear', 'plan', 'taste', 'sessions', 'agents'];
    items = all.filter(cmd => cmd.startsWith(token.query));
  } else if (token.type === '@') {
    const allFiles = new Set<string>();
    if (state.context.activeFile) allFiles.add(state.context.activeFile.path);
    for (const f of state.context.openFiles) {
      allFiles.add(f.path);
    }
    items = Array.from(allFiles).filter(p => p.toLowerCase().includes(token.query.toLowerCase()));
  } else if (token.type === '!') {
    const all = ['npm test', 'npm run build', 'git status', 'git diff'];
    items = all.filter(cmd => cmd.toLowerCase().startsWith(token.query.toLowerCase()));
  }

  if (items.length > 0) {
    autocompleteActive = true;
    autocompleteItems = items;
    autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex, items.length - 1);
    autocompleteTokenStart = token.start;
    autocompleteTokenEnd = token.end;
    autocompleteTokenType = token.type;
    updateAutocompleteList();
  } else {
    hideAutocomplete();
  }
}



// ─── Toast Notification System ────────────────────────

function showToast(message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info', durationMs = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.getElementById('app')?.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-content">${escapeHtml(message)}</span>
    <button class="toast-close">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close') as HTMLElement;
  closeBtn.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 200);
  });

  container.appendChild(toast);

  if (durationMs > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 200);
      }
    }, durationMs);
  }
}

// ─── Model Provider Badge ─────────────────────────────

function getModelProvider(modelId: string): string | null {
  const id = modelId.toLowerCase();
  if (id.includes('claude') || id.includes('opus') || id.includes('sonnet') || id.includes('haiku')) return 'claude';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('gpt') || id.includes('o1') || id.includes('o3')) return 'gpt';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('ollama') || id.includes('llama')) return 'ollama';
  return null;
}

function formatModelDisplay(modelId: string): string {
  if (!modelId) return 'NONE';
  const provider = getModelProvider(modelId);
  const shortName = modelId.split('/').pop() || modelId;
  if (provider) {
    return `<span class="model-badge"><span class="model-provider ${provider}">${provider.toUpperCase()}</span> ${escapeHtml(shortName)}</span>`;
  }
  return escapeHtml(shortName);
}

// ─── Connection Status ────────────────────────────────

function updateConnectionStatus(connected: boolean) {
  const footerStream = document.getElementById('footer-stream');
  if (!footerStream) return;
  const dot = document.createElement('span');
  dot.className = `connection-dot ${connected ? 'connected' : 'disconnected'}`;
  // Remove old dot if exists
  const oldDot = footerStream.querySelector('.connection-dot');
  if (oldDot) oldDot.remove();
  footerStream.prepend(dot);
}

// ─── Empty State Helpers ──────────────────────────────

function renderEmptyState(container: HTMLElement, icon: string, label: string, actionLabel?: string, actionFn?: () => void) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-label">${escapeHtml(label)}</div>
      ${actionLabel ? `<button class="empty-state-action">${escapeHtml(actionLabel)}</button>` : ''}
    </div>
  `;
  if (actionLabel && actionFn) {
    const btn = container.querySelector('.empty-state-action') as HTMLElement;
    btn?.addEventListener('click', actionFn);
  }
}

// ─── Stateful ANSI Escape to HTML Parser ─────────────
function ansiToHtml(text: string): string {
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\u001b\[([0-9;]*)m/g;
  let currentSpanOpen = false;
  let result = '';
  let lastIndex = 0;
  let match;
  
  let fgColor: string | null = null;
  let isBold = false;

  function getSpanStyle() {
    const styles: string[] = [];
    if (fgColor) {
      styles.push(`color:${fgColor}`);
    }
    if (isBold) {
      styles.push('font-weight:bold');
    }
    return styles.length > 0 ? `style="${styles.join(';')}"` : '';
  }

  while ((match = ansiRegex.exec(text)) !== null) {
    const plainText = text.substring(lastIndex, match.index);
    result += escapeHtml(plainText);
    
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        fgColor = null;
        isBold = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code === 22) {
        isBold = false;
      } else if (code >= 30 && code <= 37) {
        const colors = [
          'var(--vscode-terminal-ansiBlack)',
          'var(--vscode-terminal-ansiRed)',
          'var(--vscode-terminal-ansiGreen)',
          'var(--vscode-terminal-ansiYellow)',
          'var(--vscode-terminal-ansiBlue)',
          'var(--vscode-terminal-ansiMagenta)',
          'var(--vscode-terminal-ansiCyan)',
          'var(--vscode-terminal-ansiWhite)'
        ];
        fgColor = colors[code - 30];
      } else if (code === 39) {
        fgColor = null;
      } else if (code >= 90 && code <= 97) {
        const brightColors = [
          'var(--vscode-terminal-ansiBrightBlack)',
          'var(--vscode-terminal-ansiBrightRed)',
          'var(--vscode-terminal-ansiBrightGreen)',
          'var(--vscode-terminal-ansiBrightYellow)',
          'var(--vscode-terminal-ansiBrightBlue)',
          'var(--vscode-terminal-ansiBrightMagenta)',
          'var(--vscode-terminal-ansiBrightCyan)',
          'var(--vscode-terminal-ansiBrightWhite)'
        ];
        fgColor = brightColors[code - 90];
      }
    }
    
    if (currentSpanOpen) {
      result += '</span>';
      currentSpanOpen = false;
    }
    
    const styleAttr = getSpanStyle();
    if (styleAttr) {
      result += `<span ${styleAttr}>`;
      currentSpanOpen = true;
    }
    
    lastIndex = ansiRegex.lastIndex;
  }
  
  result += escapeHtml(text.substring(lastIndex));
  if (currentSpanOpen) {
    result += '</span>';
  }
  return result;
}

function cleanAndColorAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  const cleanRegex = /\u001b\[[0-9;]*[a-lA-Ln-zN-Z]/g;
  let cleaned = text.replace(cleanRegex, '');
  cleaned = cleaned.replace(/\r+/g, '');
  return ansiToHtml(cleaned);
}

// ─── Custom Regex Code Syntax Highlighter ───────────
function highlightTokens(rawCode: string, lang: string): string {
  let commentRegex = /(\/\/.*)|(#.*)|(;.*)/;
  if (lang === 'clojure' || lang === 'clj') {
    commentRegex = /(;.*)/;
  } else if (lang === 'python' || lang === 'py') {
    commentRegex = /(#.*)/;
  } else {
    commentRegex = /(\/\/.*)|(\/\*[\s\S]*?\*\/)/;
  }
  
  const stringRegex = /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(`(?:\\.|[^`\\])*`)/;
  const numberRegex = /\b(\d+(?:\.\d+)?)\b/;
  const keywords = /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|class|interface|type|extends|implements|import|export|from|as|new|this|typeof|instanceof|async|await|try|catch|finally|throw|debugger|defn|def|fn|let|loop|recur|if-not|when|when-not|cond|case|nil|true|false|defmacro|ns|require|use|import|defmulti|defmethod|lambda|import|from|def|class|return|if|elif|else|for|while|try|except|finally|raise|assert|pass|with|as|yield|lambda|in|is|not|and|or|css|html)\b/;

  const rules = [
    { type: 'comment', regex: commentRegex },
    { type: 'string', regex: stringRegex },
    { type: 'keyword', regex: keywords },
    { type: 'number', regex: numberRegex }
  ];
  
  let index = 0;
  let html = '';
  
  while (index < rawCode.length) {
    let earliestMatch: { rule: typeof rules[0]; match: RegExpExecArray } | null = null;
    
    for (const rule of rules) {
      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      const m = regex.exec(rawCode.slice(index));
      if (m && m.index !== undefined) {
        if (!earliestMatch || m.index < earliestMatch.match.index) {
          earliestMatch = { rule, match: m };
        }
      }
    }
    
    if (earliestMatch) {
      const matchIndex = earliestMatch.match.index + index;
      const matchText = earliestMatch.match[0];
      
      if (matchIndex > index) {
        html += escapeHtml(rawCode.substring(index, matchIndex));
      }
      
      html += `<span class="token-${earliestMatch.rule.type}">${escapeHtml(matchText)}</span>`;
      index = matchIndex + matchText.length;
    } else {
      html += escapeHtml(rawCode.substring(index));
      break;
    }
  }
  
  return html;
}

function highlightCode(code: string, lang: string): string {
  const normalizedLang = (lang || '').toLowerCase().trim();
  if (!normalizedLang) {
    return escapeHtml(code);
  }
  if (['javascript', 'typescript', 'js', 'ts', 'json', 'clojure', 'clj', 'python', 'py', 'css', 'html'].includes(normalizedLang)) {
    return highlightTokens(code, normalizedLang);
  }
  return escapeHtml(code);
}

// ─── marked custom renderer for syntax highlighting and copy button ───
marked.use({
  renderer: {
    code({ text, lang }) {
      const highlighted = highlightCode(text, lang || '');
      const hasLang = !!lang;
      return `
        <div class="code-container">
          <div class="code-header">
            <span class="code-lang">${escapeHtml(lang || 'code')}</span>
            <button class="copy-code-btn" data-code="${encodeURIComponent(text)}">COPY</button>
          </div>
          <pre><code class="${hasLang ? 'language-' + escapeHtml(lang) : ''}">${highlighted}</code></pre>
        </div>
      `;
    }
  }
});

// ─── Smart Scroll ─────────────────────────────────

function isNearBottom(el: HTMLElement, threshold = 150): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function scrollToBottom(el: HTMLElement): void {
  // Double-rAF: wait two animation frames so layout reflow is complete before scrolling
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  });
}

function getActiveScrollContainer(): HTMLElement | null {
  const panel = state.activePanel;
  if (panel === 'chat') {
    return document.getElementById('chat-history');
  }
  if (panel === 'sessions') {
    return document.getElementById('session-list');
  }
  if (panel === 'agents') {
    return document.getElementById('agent-list');
  }
  if (panel === 'status') {
    return document.getElementById('status-content');
  }
  return null;
}


function setupScrollButton(container: HTMLElement): void {
  // Store the state locally on the container element to avoid global state entanglement
  (container as any).wasNearBottom = true;

  const btn = document.createElement('button');
  btn.id = container.id + '-scroll-bottom-btn';
  btn.className = 'scroll-bottom-btn';
  btn.textContent = '\u25BC BOTTOM';
  btn.addEventListener('click', () => {
    (container as any).wasNearBottom = true;
    scrollToBottom(container);
  });
  container.parentElement?.appendChild(btn);

  let lastScrollTop = container.scrollTop;

  // Scroll listener to update state and toggle button visibility
  container.addEventListener('scroll', () => {
    const currentScrollTop = container.scrollTop;

    if (isNearBottom(container)) {
      (container as any).wasNearBottom = true;
    } else if (currentScrollTop < lastScrollTop) {
      // User scrolled UP and is NOT near bottom
      (container as any).wasNearBottom = false;
    } else if (currentScrollTop > lastScrollTop) {
      // User scrolled DOWN and is NOT near bottom
      (container as any).wasNearBottom = false;
    }

    btn.classList.toggle('visible', !(container as any).wasNearBottom);

    lastScrollTop = currentScrollTop;
  });

  // Watch for any DOM changes inside the container (appended messages, syntax highlights, streaming text)
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if ((container as any).wasNearBottom) {
        scrollToBottom(container);
      }
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // Watch for image loads (which are async and change layout heights)
  container.addEventListener('load', (e) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'IMG') {
      if ((container as any).wasNearBottom) {
        scrollToBottom(container);
      }
    }
  }, true); // Use capture phase because load event does not bubble
}

// ─── Footer Status Bar ────────────────────────────────

function updateHeader() {
  const mn = document.getElementById('model-name');
  if (mn) mn.innerHTML = `MODEL // ${formatModelDisplay(state.modelId)}`;
  const pm = document.getElementById('perm-mode');
  if (pm)
    pm.innerText = `PERM // ${state.permissionMode || 'STANDARD'}`;
  const tc = document.getElementById('token-count');
  if (tc)
    tc.innerText = `TOKENS // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;

  const hv = document.getElementById('header-version');
  if (hv) hv.textContent = state.cliVersion || 'v0.0.0';
  const hm = document.getElementById('header-models');
  if (hm) hm.textContent = state.modelsLabel || 'loading...';
  const hc = document.getElementById('header-cwd');
  if (hc) hc.textContent = state.context.workspaceRoot || '~';
}

function updateFooter() {
  const el = (id: string) => document.getElementById(id);
  const fModel = el('footer-model');
  const fMode = el('footer-mode');
  const fTokens = el('footer-tokens');
  const fSession = el('footer-session');
  const fTurn = el('footer-turn');
  const fStream = el('footer-stream');

  if (fModel) fModel.innerHTML = `MODEL // ${formatModelDisplay(state.modelId)}`;
  if (fMode) fMode.textContent = `MODE // ${state.permissionMode || 'STANDARD'}`;
  if (fTokens)
    fTokens.textContent = `T // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;
  if (fSession)
    fSession.textContent = `SESSION // ${state.currentSessionId ? state.currentSessionId.slice(0, 8) : '--'}`;
  if (fTurn) fTurn.textContent = `TURN // ${state.turnCount}`;
  if (fStream) {
    fStream.classList.toggle('is-active', state.isStreaming);
    // Preserve connection dot when updating
    const hasDot = fStream.querySelector('.connection-dot');
    if (!hasDot) updateConnectionStatus(true);
  }
}

// ─── Context Sidebar ──────────────────────────────────

function updateContextPanel() {
  const ctx = state.context;

  // Update header CWD
  const hc = document.getElementById('header-cwd');
  if (hc) hc.textContent = ctx.workspaceRoot || '~';

  const gitBody = document.getElementById('context-git-body');
  if (gitBody) {
    if (ctx.gitBranch) {
      const dirtyText =
        ctx.dirtyFilesCount > 0
          ? `<span class="context-git-dirty">${ctx.dirtyFilesCount} dirty</span>`
          : '<span style="color:var(--accent)">&#x2713; clean</span>';
      gitBody.innerHTML = `
        <span class="context-git-branch">&#xF4B0; ${escapeHtml(ctx.gitBranch)}</span>
        ${dirtyText}
      `;
    } else {
      gitBody.innerHTML = '<span class="context-muted">No git repo</span>';
    }
  }

  const filesBody = document.getElementById('context-files-body');
  if (filesBody) {
    if (ctx.activeFile || ctx.openFiles.length > 0) {
      let html = '';
      const changedFiles = typeof ctx.dirtyFiles === 'object' && Array.isArray(ctx.dirtyFiles) ? ctx.dirtyFiles : [];
      const isChanged = (path: string) => changedFiles.some((df: string) => df.includes(path));
      if (ctx.activeFile) {
        const changed = isChanged(ctx.activeFile.path);
        html += `<div class="context-file ${changed ? 'changed' : ''}">
          <span class="context-file-path">&#x25B6; ${escapeHtml(ctx.activeFile.path)}</span>
          <span class="context-file-lang">${changed ? '<span class="context-file-change-indicator">&#x2713;</span>' : ctx.activeFile.language}</span>
        </div>`;
      }
      for (const f of ctx.openFiles) {
        if (f.path !== ctx.activeFile?.path) {
          const changed = isChanged(f.path);
          html += `<div class="context-file ${changed ? 'changed' : ''}">
            <span class="context-file-path">${escapeHtml(f.path)}</span>
            <span class="context-file-lang">${changed ? '<span class="context-file-change-indicator">M</span>' : f.language}</span>
          </div>`;
        }
      }
      filesBody.innerHTML = html;
    } else {
      filesBody.innerHTML = '<span class="context-muted">No files open</span>';
    }
  }

  const diagBody = document.getElementById('context-diag-body');
  if (diagBody) {
    if (ctx.diagnosticsCount > 0) {
      diagBody.innerHTML = `
        <div class="context-diag-row">
          <span class="context-diag-error">&#x26A0; ${ctx.diagnosticsCount} issues</span>
          <button class="context-diag-fix-btn" title="Fix diagnostics automatically">🔧 FIX</button>
        </div>
      `;
    } else {
      diagBody.innerHTML = '<span style="color:var(--accent)">&#x2713; No issues</span>';
    }
  }
}

// ─── Streaming Cursor ─────────────────────────────────

function updateStreamingCursor() {
  const history = document.getElementById('chat-history');
  if (!history) return;
  const existing = document.getElementById('streaming-cursor');
  if (state.isStreaming) {
    if (!existing) {
      const cursor = document.createElement('div');
      cursor.id = 'streaming-cursor';
      cursor.className = 'streaming-cursor';
      history.appendChild(cursor);
      scrollToBottom(history);
    }
  } else {
    if (existing) existing.remove();
  }
}

// ─── Executing State ──────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatThoughtDuration(ms: number): string {
  const seconds = Math.max(1, Math.round((ms) / 1000));
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

function startStatusTimer() {
  const statusEl = document.getElementById('tui-active-status');
  if (!statusEl) return;
  statusEl.classList.remove('hidden');

  executionStartTime = Date.now();
  const spinnerEl = statusEl.querySelector('.tui-status-spinner') as HTMLElement;
  const timeEl = statusEl.querySelector('.tui-status-time') as HTMLElement;
  const tokensEl = statusEl.querySelector('.tui-status-tokens') as HTMLElement;

  const spinnerFrames = ['o', 'O', 'o', '.'];
  let frameIndex = 0;

  if (timeEl) timeEl.innerHTML = `&bull; 0s`;
  if (tokensEl) tokensEl.innerHTML = `&bull; &darr; 0`;

  statusTimer = setInterval(() => {
    const elapsed = Date.now() - executionStartTime;
    if (timeEl) timeEl.innerHTML = `&bull; ${formatDuration(elapsed)}`;
    if (spinnerEl) {
      spinnerEl.innerText = spinnerFrames[frameIndex];
      frameIndex = (frameIndex + 1) % spinnerFrames.length;
    }
    if (tokensEl) {
      tokensEl.innerHTML = `&bull; &darr; ${state.tokens.total.toLocaleString()}`;
    }
  }, 250);
}

function stopStatusTimer() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  const statusEl = document.getElementById('tui-active-status');
  if (statusEl) {
    statusEl.classList.add('hidden');
  }
}

function setExecutingState(executing: boolean) {
  isExecuting = executing;
  state.isStreaming = executing;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  if (sendBtn) {
    sendBtn.disabled = executing;
    sendBtn.innerText = executing ? 'RUNNING...' : 'EXECUTE';
    sendBtn.style.opacity = executing ? '0.5' : '1';
    sendBtn.style.cursor = executing ? 'not-allowed' : 'pointer';
  }
  if (input) {
    input.disabled = executing;
    if (!executing) input.focus();
  }
  updateFooter();
  updateStreamingCursor();
  if (executing) {
    updateConnectionStatus(true);
    startStatusTimer();
  } else {
    stopStatusTimer();
  }
}

// ─── Enhanced Message Processing ──────────────────────

function renderDiffProposalHtml(id: string, diffText: string, response?: 'accept' | 'reject'): string {
  if (response) {
    return `
      <div class="diff-widget">
        <div class="diff-header">
          <span>PROPOSAL</span>
          <div class="diff-actions">
            <span style="color:var(--accent)">[${response.toUpperCase()}]</span>
          </div>
        </div>
        <div class="diff-content">${escapeHtml(diffText)
          .replace(/^(\+.*)$/gm, '<span class="diff-line add">$1</span>')
          .replace(/^(-.*)$/gm, '<span class="diff-line sub">$1</span>')}</div>
      </div>
    `;
  }
  return `
    <div class="diff-widget">
      <div class="diff-header">
        <span>PROPOSAL</span>
        <div class="diff-actions">
          <button class="diff-btn accept" data-id="${id}">ACCEPT</button>
          <button class="diff-btn reject" data-id="${id}">REJECT</button>
        </div>
      </div>
      <div class="diff-content">${escapeHtml(diffText)
        .replace(/^(\+.*)$/gm, '<span class="diff-line add">$1</span>')
        .replace(/^(-.*)$/gm, '<span class="diff-line sub">$1</span>')}</div>
    </div>
  `;
}

/**
 * Shared structural replacements applied to both streaming (light) and final (full) rendering.
 * Handles <thought>, <tool_call>, <result> tags and ```diff blocks.
 * Returns the processed string; the caller decides whether to run marked.parse().
 */
function applyStructuralReplacements(raw: string): string {
  let processed = raw;

  processed = processed.replace(
    /<thought>([\s\S]*?)<\/thought>/gi,
    (_m: string, inner: string) => {
      const html = marked.parse(inner.trim()) as string;
      return `<details class="step-accordion" open><summary>Thought ${streamingStartTime ? 'for ' + formatThoughtDuration(Date.now() - streamingStartTime) + ' ' : ''}[ctrl+o to expand]</summary><div class="thought-content">${html}</div></details>`;
    },
  );

  processed = processed.replace(
    /<tool_call>([\s\S]*?)<\/tool_call>/gi,
    (_m: string, inner: string) => {
      const nameMatch = inner.match(/name:\s*(\S+)/);
      const toolName = nameMatch ? nameMatch[1] : 'unknown';
      return `<div class="tool-call"><span class="tool-call-header">&#x1F527; TOOL CALL // ${escapeHtml(toolName)}</span><pre class="tool-call-body">${escapeHtml(inner)}</pre></div>`;
    },
  );

  processed = processed.replace(
    /<result>([\s\S]*?)<\/result>/gi,
    (_m: string, inner: string) => {
      return `<div class="tool-result"><span class="tool-call-header">&#x1F4CB; RESULT</span><pre class="tool-call-body">${escapeHtml(inner)}</pre></div>`;
    },
  );

  processed = processed.replace(
    /```diff\n([\s\S]*?)```/g,
    (_m: string, inner: string) => {
      const lines = inner.split('\n');
      const formatted = lines
        .map((line) => {
          if (line.startsWith('+'))
            return `<span class="diff-line add">${escapeHtml(line)}</span>`;
          if (line.startsWith('-'))
            return `<span class="diff-line sub">${escapeHtml(line)}</span>`;
          if (line.startsWith('@@'))
            return `<span class="diff-line hunks">${escapeHtml(line)}</span>`;
          return escapeHtml(line);
        })
        .join('\n');
      return `<pre class="diff-block">${formatted}</pre>`;
    },
  );

  return processed;
}

function processMessageContentLight(raw: string): string {
  // Fast streaming path: structural replacements only, no marked.parse()
  // Used on every streaming chunk to avoid O(n²) re-parse
  if (raw.startsWith('<img') || raw.startsWith('<div class="diff-widget"') || raw.startsWith('<div class="code-container"')) {
    return raw;
  }
  return applyStructuralReplacements(raw);
}

function processMessageContent(raw: string): string {
  // Final message path: full render including marked.parse()
  if (raw.startsWith('<img') || raw.startsWith('<div class="diff-widget"') || raw.startsWith('<div class="code-container"')) {
    return raw;
  }
  const processed = applyStructuralReplacements(raw);
  // Only do full marked.parse() at completion — never during streaming
  if (processed === raw) {
    return marked.parse(raw) as string;
  }
  return processed;
}

// ─── Message Rendering ────────────────────────────────

function appendMessage(m: { id: string; role: string; content: string }, streaming?: boolean) {
  const history = document.getElementById('chat-history');
  if (!history) return;
  switchPanel('chat');

  // Remove onboarding welcome if it exists
  const onboarding = history.querySelector('.onboarding-welcome');
  if (onboarding) {
    onboarding.remove();
  }

  // Determine if we were at the bottom before mutating the DOM
  if (m.role === 'user') {
    (history as any).wasNearBottom = true;
  }
  const shouldScroll = (history as any).wasNearBottom || isNearBottom(history);

  let div = document.getElementById(m.id);
  if (!div) {
    div = document.createElement('div');
    div.id = m.id;
    div.className = `message message-${m.role}`;
    history.appendChild(div);
  }

  // Prepend ⠶ to system/agent responses (CLI visual parity)
  let contentToRender = m.content;
  if ((m.role === 'system' || m.role === 'agent') && 
      !contentToRender.startsWith('⠶') &&
      !contentToRender.startsWith('<img') &&
      !contentToRender.startsWith('<div class="diff-widget"')) {
    contentToRender = '⠶ ' + contentToRender;
  }

  let parsedContent: string;
  try {
    parsedContent = streaming ? processMessageContentLight(contentToRender) : processMessageContent(contentToRender);
  } catch {
    parsedContent = `<pre>${escapeHtml(contentToRender)}</pre>`;
  }

  div.innerHTML = `<span class="message-role">${m.role}</span><div class="message-content">${parsedContent}</div>`;

  // Apply contextual styling to system messages
  if (div.classList.contains('message-system')) {
    const lower = m.content.toLowerCase();
    if (lower.includes('**error:**') || lower.includes('error (exit')) {
      div.classList.add('is-error');
    } else if (lower.includes('_(') || lower.includes('cancelled')) {
      div.classList.add('is-warning');
    } else if (lower.includes('completed') || lower.includes('done') || lower.includes('✓')) {
      div.classList.add('is-success');
    }
  }

  if (shouldScroll) {
    (history as any).wasNearBottom = true;
    scrollToBottom(history);
  }
}

// ─── Panel System ─────────────────────────────────────

function switchPanel(panel: 'chat' | 'sessions' | 'status' | 'agents') {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('panel-active'));
  const target = document.getElementById(`${panel}-panel`);
  if (target) target.classList.add('panel-active');
  state.activePanel = panel;
  saveState();
}

// ─── Renderers ────────────────────────────────────────

function renderSessionList(sessions: SessionItem[]) {
  const list = document.getElementById('session-list');
  if (!list) return;
  switchPanel('sessions');
  if (sessions.length === 0) {
    renderEmptyState(list, '\u2630', 'No recent sessions', 'Start a new session', () => sendAction('start'));
    return;
  }
  list.innerHTML = sessions
    .map(
      (s) => `
    <div class="session-item" data-session-id="${s.id}">
      <span class="session-icon">${s.goalStatus === 'completed' ? '\u2713' : '\u25CB'}</span>
      <div class="session-info">
        <span class="session-label">${escapeHtml(s.label)}</span>
        <span class="session-meta">${s.model ? s.model.split('/').pop() : 'unknown'} \u00B7 ${s.id.slice(0, 8)}</span>
        <span class="session-meta-timestamp">${s.startedAt ? new Date(s.startedAt).toLocaleDateString() : ''}</span>
      </div>
    </div>
  `,
    )
    .join('');
}

function renderAgentList(agents: { name: string; task: string }[]) {
  const list = document.getElementById('agent-list');
  if (!list) return;
  switchPanel('agents');
  if (agents.length === 0) {
    renderEmptyState(list, '\u2691', 'No active agents', 'Run parallel agents', () => sendAction('start'));
    return;
  }

  const planning: typeof agents = [];
  const execution: typeof agents = [];
  const verification: typeof agents = [];

  for (const a of agents) {
    const key = (a.name + ' ' + a.task).toLowerCase();
    if (key.includes('plan') || key.includes('design') || key.includes('analyze')) {
      planning.push(a);
    } else if (key.includes('test') || key.includes('doc') || key.includes('verify') || key.includes('lint')) {
      verification.push(a);
    } else {
      execution.push(a);
    }
  }

  const renderCol = (title: string, items: typeof agents) => {
    const cards = items.map(a => `
      <div class="kanban-card">
        <div class="kanban-card-title">${escapeHtml(a.name)}</div>
        <div class="kanban-card-desc">${escapeHtml(a.task)}</div>
      </div>
    `).join('');
    return `
      <div class="kanban-column">
        <div class="kanban-column-title">${title} (${items.length})</div>
        <div class="kanban-cards">${cards || '<div class="session-empty" style="padding:10px;">Idle</div>'}</div>
      </div>
    `;
  };

  list.innerHTML = `
    <div class="kanban-board">
      ${renderCol('Planning', planning)}
      ${renderCol('Execution', execution)}
      ${renderCol('Verification', verification)}
    </div>
  `;
}

function renderStatus(text: string) {
  const content = document.getElementById('status-content');
  if (!content) return;
  switchPanel('status');
  // Wrap status panel parent in terminal chrome
  const statusPanel = document.getElementById('status-panel');
  if (statusPanel && !statusPanel.querySelector('.status-terminal-bar')) {
    const header = statusPanel.querySelector('.panel-header');
    if (header) {
      const bar = document.createElement('div');
      bar.className = 'status-terminal-bar';
      bar.innerHTML = `
        <span class="status-terminal-dot close"></span>
        <span class="status-terminal-dot minimize"></span>
        <span class="status-terminal-dot maximize"></span>
        <span class="status-terminal-title">cmd status</span>
      `;
      header.after(bar);
    }
  }
  content.innerHTML = cleanAndColorAnsi(text);
}

// ─── Event Listeners ─────────────────────────────────

function sendAction(action: string, payload?: Record<string, unknown>) {
  vscode.postMessage({ type: 'action', action, payload });
}

function adjustTextareaHeight(input: HTMLTextAreaElement) {
  input.style.height = 'auto';
  const newHeight = Math.min(Math.max(input.scrollHeight, 60), 200);
  input.style.height = `${newHeight}px`;
}

function updateTasteUI() {
  const toggle = document.getElementById('tui-taste-toggle');
  if (toggle) {
    toggle.innerHTML = state.continuousLearning ? '&#9745; TASTE' : '&#9634; TASTE';
    toggle.classList.toggle('active', state.continuousLearning);
  }
}

function hydrateUI() {
  const history = document.getElementById('chat-history');
  if (!history) return;
  
  history.innerHTML = '';
  if (state.messages.length === 0) {
    history.innerHTML = `
      <div class="onboarding-welcome">
        <div class="onboarding-logo-container">
          <pre class="onboarding-ascii">
 ██████╗███╗   ███╗██████╗ 
██╔════╝████╗ ████║██╔══██╗
██║     ██╔████╔██║██║  ██║
██║     ██║╚██╔╝██║██║  ██║
╚██████╗██║ ╚═╝ ██║██████╔╝
 ╚═════╝╚═╝     ╚═╝╚═════╝ 
          </pre>
        </div>
        <div class="onboarding-tagline">Your autonomous coding agent with taste</div>
        
        <div class="onboarding-section">
          <button class="onboarding-btn onboarding-start-session-btn" data-action="start">
            <span class="btn-icon">▶</span>
            <span class="btn-title">Start New Session</span>
          </button>
        </div>
        
        <div class="onboarding-section">
          <h3>Quick Actions</h3>
          <div class="onboarding-buttons">
            <button class="onboarding-btn" data-prompt="/fix">
              <div class="btn-header">
                <span class="btn-icon">🔧</span>
                <span class="btn-title">Fix Diagnostics</span>
              </div>
              <span class="btn-desc">Analyze and fix active workspace diagnostics</span>
            </button>
            <button class="onboarding-btn" data-prompt="/plan ">
              <div class="btn-header">
                <span class="btn-icon">📝</span>
                <span class="btn-title">Plan Mode</span>
              </div>
              <span class="btn-desc">Propose an implementation plan for a task</span>
            </button>
            <button class="onboarding-btn" data-prompt="/taste">
              <div class="btn-header">
                <span class="btn-icon">👅</span>
                <span class="btn-title">Inspect Taste</span>
              </div>
              <span class="btn-desc">View learned taste preferences for this repo</span>
            </button>
            <button class="onboarding-btn" data-prompt="/learn">
              <div class="btn-header">
                <span class="btn-icon">🧠</span>
                <span class="btn-title">Learn Taste</span>
              </div>
              <span class="btn-desc">Learn code style patterns from folder</span>
            </button>
          </div>
        </div>

        <div class="onboarding-section">
          <h3>Keyboard Shortcuts</h3>
          <table class="shortcuts-table">
            <tr><td><kbd>Cmd+Shift+\`</kbd> / <kbd>Ctrl+Shift+\`</kbd></td><td>Start New Session</td></tr>
            <tr><td><kbd>Ctrl+T</kbd></td><td>Toggle Continuous Learning</td></tr>
            <tr><td><kbd>Enter</kbd></td><td>Submit prompt</td></tr>
            <tr><td><kbd>Shift+Enter</kbd></td><td>Insert new line</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Interrupt execution</td></tr>
          </table>
        </div>
      </div>
    `;
  } else {
    state.messages.forEach(m => {
      const div = document.createElement('div');
      div.id = m.id;
      div.className = `message message-${m.role}`;
      if (m.raw) {
        div.dataset.raw = m.raw;
      }
      // Add ⠶ prefix for system/agent messages on rehydrate
      let content = m.content;
      if ((m.role === 'system' || m.role === 'agent') &&
          !content.startsWith('⠶') &&
          !content.startsWith('<img') &&
          !content.startsWith('<div class="diff-widget"')) {
        content = '⠶ ' + content;
      }
      const parsed = processMessageContent(content);
      div.innerHTML = `<span class="message-role">${m.role}</span><div class="message-content">${parsed}</div>`;
      history.appendChild(div);
    });
  }
  
  scrollToBottom(history);
  switchPanel(state.activePanel);
  
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  if (input) {
    input.value = state.inputDraft;
    adjustTextareaHeight(input);
  }
  
  const statusContent = document.getElementById('status-content');
  if (statusContent && state.statusText) {
    statusContent.innerHTML = cleanAndColorAnsi(state.statusText);
  }

  if (state.agents && state.agents.length > 0) {
    renderAgentList(state.agents);
  }

  updateHeader();
  updateFooter();
  updateContextPanel();
  updateTasteUI();
}

function attachEventListeners() {
  // Action buttons with loading state
  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (!action) return;

      if (action === 'toggle-context') {
        const sidebar = document.getElementById('context-panel');
        if (sidebar) sidebar.classList.toggle('hidden');
        return;
      }

      // Show loading state for actions that trigger CLI
      if (['start', 'continue', 'pick-model', 'pick-permission', 'show-status', 'list-sessions'].includes(action)) {
        btn.classList.add('loading');
        setTimeout(() => btn.classList.remove('loading'), 3000);
      }

      if (action === 'list-agents') {
        switchPanel('agents');
        return;
      }
      if (action === 'list-sessions') {
        sendAction('list-sessions');
      } else if (action === 'show-status') {
        sendAction('show-status');
      } else {
        sendAction(action);
      }
    });
  });

  // Panel close buttons
  document.querySelectorAll('.panel-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = (btn as HTMLElement).dataset.panel;
      if (panel && panel !== 'context') switchPanel('chat');
      else if (panel === 'context') {
        const sidebar = document.getElementById('context-panel');
        if (sidebar) sidebar.classList.add('hidden');
      }
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
    if (input && input.value.trim() && !isExecuting) {
      const rawPrompt = input.value.trim();
      input.value = '';
      state.inputDraft = '';
      saveState();
      adjustTextareaHeight(input);
      hideAutocomplete();

      // Local slash commands routing
      if (rawPrompt.startsWith('/')) {
        const parts = rawPrompt.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const arg = rawPrompt.slice(parts[0].length).trim();

        if (cmd === '/clear') {
          state.messages = [];
          state.statusText = '';
          state.agents = [];
          saveState();
          hydrateUI();
          sendAction('clear-session');
          return;
        }

        if (cmd === '/help') {
          const helpMsg = {
            id: 'help-' + Date.now(),
            role: 'system',
            content: `### Command Code Webview Guide\n\n` +
                     `**Slash Commands**\n` +
                     `- \`/help\` - Show this help guide\n` +
                     `- \`/clear\` - Clear chat history\n` +
                     `- \`/plan <task>\` - Execute task in plan mode (dry-run)\n` +
                     `- \`/sessions\` - Switch to recent sessions panel\n` +
                     `- \`/agents\` - Switch to active agents board\n` +
                     `- \`/taste\` - Manage Taste learning and usage\n` +
                     `- \`/context\` - Show context window usage\n` +
                     `- \`/status\` - Show comprehensive environment status\n` +
                     `- \`/login\` - Log in to Command Code\n` +
                     `- \`/logout\` - Log out of Command Code\n` +
                     `- \`/update\` - Update Command Code to the latest version\n` +
                     `- \`/exit\` - Exit Command Code\n\n` +
                     `All other CLI slash commands (\`/goal\`, \`/memory\`, \`/taste\`, \`/skills\`, \`/mcp\`, \`/review\`, \`/pr-comments\`, \`/usage\`, \`/feedback\`, etc.) are routed to the CLI and handled there.\n\n` +
                     `**Direct Bash**\n` +
                     `- \`!<command>\` - Run bash commands (e.g. \`!npm test\`)\n\n` +
                     `**Autocomplete**\n` +
                     `- \`/<text>\` - Slash commands\n` +
                     `- \`@<text>\` - File context paths\n` +
                     `- \`!<text>\` - Bash history\n\n` +
                     `**Keyboard Shortcuts**\n` +
                     `- \`Shift+Tab\` - Cycle permission mode\n` +
                     `- \`Ctrl+T\` - Toggle continuous learning\n` +
                     `- \`Ctrl+O\` - Toggle expanded thought blocks\n` +
                     `- \`Alt+P\` - Switch model\n` +
                     `- \`Ctrl+G\` - Open input in external editor\n` +
                     `- \`Esc\` - Interrupt execution\n` +
                     `- \`Esc\` (×2) - Rewind to last checkpoint\n`
          };
          appendMessage(helpMsg);
          addOrUpdateMessage(helpMsg);
          return;
        }

        if (cmd === '/plan') {
          if (!arg) {
            const planErr = { id: 'plan-err-' + Date.now(), role: 'system', content: `Usage: /plan <task>` };
            appendMessage(planErr);
            addOrUpdateMessage(planErr);
            return;
          }
          setExecutingState(true);
          vscode.postMessage({
            type: 'chatInput',
            payload: { prompt: arg, plan: true },
          });
          const planMsg = { id: 'local-' + Date.now(), role: 'user', content: `/plan ${arg}` };
          appendMessage(planMsg);
          addOrUpdateMessage(planMsg);
          return;
        }

        if (cmd === '/sessions') {
          sendAction('list-sessions');
          return;
        }

        if (cmd === '/agents') {
          switchPanel('agents');
          return;
        }

        // For /exit, /clear is already handled above and /sessions and /agents
        // are handled locally. All other slash commands route to the CLI.
        const cliSlashMsg = { id: 'local-' + Date.now(), role: 'user', content: rawPrompt };
        appendMessage(cliSlashMsg);
        addOrUpdateMessage(cliSlashMsg);
        setExecutingState(true);
        vscode.postMessage({
          type: 'chatInput',
          payload: { prompt: rawPrompt },
        });
        return;
      }

      // Direct Bash execution routing
      if (rawPrompt.startsWith('!')) {
        const cmdStr = rawPrompt.slice(1).trim();
        if (!cmdStr) {
          const bashErr = { id: 'bash-err-' + Date.now(), role: 'system', content: `Usage: !<command>` };
          appendMessage(bashErr);
          addOrUpdateMessage(bashErr);
          return;
        }
        setExecutingState(true);
        vscode.postMessage({
          type: 'chatInput',
          payload: { prompt: cmdStr, isBash: true },
        });
        const bashMsg = { id: 'local-' + Date.now(), role: 'user', content: `!${cmdStr}` };
        appendMessage(bashMsg);
        addOrUpdateMessage(bashMsg);
        return;
      }

      // Default prompt routing
      setExecutingState(true);
      vscode.postMessage({
        type: 'chatInput',
        payload: { prompt: rawPrompt },
      });
      const userMsg = { id: 'local-' + Date.now(), role: 'user', content: rawPrompt };
      appendMessage(userMsg);
      addOrUpdateMessage(userMsg);
    }
  };

  sendBtn?.addEventListener('click', sendMessage);
  let lastEscapeTime = 0;
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    // Keyboard navigation keys forwarding when autocomplete is not active
    if (!autocompleteActive) {
      const history = document.getElementById('chat-history');
      if (history) {
        const lineScrollAmount = 40;
        const pageScrollAmount = history.clientHeight - 40;

        if (e.key === 'PageDown') {
          e.preventDefault();
          history.scrollTop += pageScrollAmount;
          return;
        }
        if (e.key === 'PageUp') {
          e.preventDefault();
          history.scrollTop -= pageScrollAmount;
          return;
        }
        if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          history.scrollTop -= lineScrollAmount;
          return;
        }
        if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          history.scrollTop += lineScrollAmount;
          return;
        }
        if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          history.scrollTop = 0;
          return;
        }
        if (e.key === 'End' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          history.scrollTop = history.scrollHeight;
          return;
        }
      }
    }

    // 1. Shift+Tab: cycle permission mode
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const current = state.permissionMode || 'standard';
      let nextMode: 'standard' | 'plan' | 'auto-accept';
      if (current === 'standard') nextMode = 'auto-accept';
      else if (current === 'auto-accept') nextMode = 'plan';
      else nextMode = 'standard';
      sendAction('set-permission-mode', { permissionMode: nextMode });
      return;
    }

    // 2. Ctrl+T: toggle Continuous Learning
    if (e.key === 't' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      state.continuousLearning = !state.continuousLearning;
      updateTasteUI();
      saveState();
      const statusText = state.continuousLearning ? 'Continuous learning enabled' : 'Continuous learning disabled';
      const localMsg = {
        id: 'sys-' + Date.now(),
        role: 'system',
        content: `_${statusText}_`,
      };
      appendMessage(localMsg);
      addOrUpdateMessage(localMsg);
      return;
    }

    // 3. Ctrl+O: toggle expanded outputs
    if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const details = document.querySelectorAll('details.step-accordion');
      const anyOpen = Array.from(details).some(d => d.hasAttribute('open'));
      details.forEach(d => {
        if (anyOpen) d.removeAttribute('open');
        else d.setAttribute('open', '');
      });
      return;
    }

    // Ctrl+G: open input in external editor ($EDITOR)
    if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendAction('open-in-editor');
      return;
    }

    // 4. Alt+P (Option+P): pick model
    if (e.key === 'p' && (e.altKey || e.metaKey)) {
      e.preventDefault();
      sendAction('pick-model');
      return;
    }

    // 5. Escape: interrupt running CLI or rewind checkpoint
    if (e.key === 'Escape') {
      if (isExecuting) {
        e.preventDefault();
        sendAction('interrupt-execution');
        return;
      } else {
        const now = Date.now();
        if (now - lastEscapeTime < 400) {
          e.preventDefault();
          sendAction('checkpoint-restore');
          lastEscapeTime = 0;
          return;
        }
        lastEscapeTime = now;
      }
    }

    if (autocompleteActive) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteSelectedIndex = (autocompleteSelectedIndex + 1) % autocompleteItems.length;
        updateAutocompleteList();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteSelectedIndex = (autocompleteSelectedIndex - 1 + autocompleteItems.length) % autocompleteItems.length;
        updateAutocompleteList();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertAutocompleteSelection();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideAutocomplete();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input?.addEventListener('input', () => {
    state.inputDraft = input.value;
    saveState();
    adjustTextareaHeight(input);
    handleInputOrCursorChange(input);
  });

  input?.addEventListener('click', () => {
    handleInputOrCursorChange(input);
  });

  document.getElementById('tui-taste-toggle')?.addEventListener('click', () => {
    state.continuousLearning = !state.continuousLearning;
    updateTasteUI();
    saveState();
    const statusText = state.continuousLearning ? 'Continuous learning enabled' : 'Continuous learning disabled';
    const localMsg = {
      id: 'sys-' + Date.now(),
      role: 'system',
      content: `_${statusText}_`,
    };
    appendMessage(localMsg);
    addOrUpdateMessage(localMsg);
  });

  document.getElementById('autocomplete-list')?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.autocomplete-item') as HTMLElement;
    if (item && item.dataset.index !== undefined) {
      autocompleteSelectedIndex = parseInt(item.dataset.index, 10);
      insertAutocompleteSelection();
    }
  });

  // Drag and Drop for context
  const inputContainer = document.querySelector(
    '.chat-input-container',
  ) as HTMLElement;
  if (inputContainer) {
    inputContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      inputContainer.classList.add('dropzone-active');
    });
    inputContainer.addEventListener('dragleave', (e) => {
      e.preventDefault();
      inputContainer.classList.remove('dropzone-active');
    });
    inputContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      inputContainer.classList.remove('dropzone-active');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          sendAction('file-dropped', {
            name: file.name,
            type: file.type,
            data: ev.target?.result,
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Diff button delegation
  const chatHistory = document.getElementById('chat-history');
  chatHistory?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('diff-btn')) {
      const action = target.classList.contains('accept') ? 'accept' : 'reject';
      const id = target.dataset.id;
      if (id) {
        sendAction('respond-diff', { id, response: action });
        target.parentElement!.innerHTML = `<span style="color:var(--accent)">[${action.toUpperCase()}]</span>`;
        const msg = state.messages.find(item => item.id === id);
        if (msg) {
          msg.diffResponse = action;
          msg.content = renderDiffProposalHtml(id, msg.diffText || '', action);
          saveState();
        }
      }
    }
  });

  // Copy code button delegation
  const appElement = document.getElementById('app');
  appElement?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('copy-code-btn')) {
      const code = decodeURIComponent(target.dataset.code || '');
      navigator.clipboard.writeText(code).then(() => {
        const originalText = target.innerText;
        target.innerText = 'COPIED!';
        target.style.color = 'var(--accent)';
        setTimeout(() => {
          target.innerText = originalText;
          target.style.color = '';
        }, 1500);
      });
    }
  });

  // Context file click — send action to open file (future use)
  document.getElementById('context-panel')?.addEventListener('click', (e) => {
    const fileRow = (e.target as HTMLElement).closest('.context-file');
    if (fileRow) {
      const pathEl = fileRow.querySelector('.context-file-path');
      if (pathEl) {
        const path = pathEl.textContent?.replace(/^▶ /, '').trim();
        if (path) sendAction('open-context-file', { path });
      }
    }
  });

  // Global keyboard scrolling listener
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    // If the user is currently typing in an input or textarea, let the element handle it.
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
      return;
    }

    // If the target is inside a scrollable element that is NOT the main scroll container,
    // let the native browser scroll handle it.
    const target = e.target as HTMLElement;
    if (target && target !== document.body) {
      let current: HTMLElement | null = target;
      const activeContainer = getActiveScrollContainer();
      while (current && current !== document.body && current !== activeContainer) {
        if (current.scrollHeight > current.clientHeight) {
          const overflowY = window.getComputedStyle(current).overflowY;
          if (overflowY === 'auto' || overflowY === 'scroll') {
            return;
          }
        }
        if (current.scrollWidth > current.clientWidth) {
          const overflowX = window.getComputedStyle(current).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') {
            return;
          }
        }
        current = current.parentElement;
      }
    }

    const scrollContainer = getActiveScrollContainer();
    if (!scrollContainer) return;

    const lineScrollAmount = 40;
    const pageScrollAmount = scrollContainer.clientHeight - 40;

    let handled = false;
    switch (e.key) {
      case 'ArrowUp':
        scrollContainer.scrollTop -= lineScrollAmount;
        handled = true;
        break;
      case 'ArrowDown':
        scrollContainer.scrollTop += lineScrollAmount;
        handled = true;
        break;
      case 'PageUp':
        scrollContainer.scrollTop -= pageScrollAmount;
        handled = true;
        break;
      case 'PageDown':
        scrollContainer.scrollTop += pageScrollAmount;
        handled = true;
        break;
      case ' ': // Space key
        if (e.shiftKey) {
          scrollContainer.scrollTop -= pageScrollAmount;
        } else {
          scrollContainer.scrollTop += pageScrollAmount;
        }
        handled = true;
        break;
      case 'Home':
        scrollContainer.scrollTop = 0;
        handled = true;
        break;
      case 'End':
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
    }
  });

  // Onboarding action buttons delegation
  const onboardingChatHistory = document.getElementById('chat-history');
  onboardingChatHistory?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.onboarding-btn') as HTMLButtonElement | null;
    if (btn) {
      const action = btn.dataset.action;
      if (action === 'start') {
        sendAction('start');
        return;
      }
      const promptVal = btn.dataset.prompt;
      if (promptVal) {
        const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement | null;
        if (chatInput) {
          chatInput.value = promptVal;
          chatInput.focus();
          adjustTextareaHeight(chatInput);
        }
      }
    }
  });

  // Diagnostics sidebar FIX button click delegation
  const diagBody = document.getElementById('context-diag-body');
  diagBody?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('context-diag-fix-btn') || target.closest('.context-diag-fix-btn')) {
      if (isExecuting) return;
      const rawPrompt = "/fix";
      const msgId = 'local-' + Date.now();
      const userMsg = { id: msgId, role: 'user', content: rawPrompt };
      appendMessage(userMsg);
      addOrUpdateMessage(userMsg);
      setExecutingState(true);
      vscode.postMessage({
        type: 'chatInput',
        payload: { prompt: rawPrompt },
      });
    }
  });
}

// ─── UI Initialization ────────────────────────────────

function initUI() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="crosshair tl"></div>
    <div class="crosshair tr"></div>
    <div class="crosshair bl"></div>
    <div class="crosshair br"></div>

    <div class="header">
      <div class="header-top">
        <div class="header-logo">
   ███  ███ █████
   █ █  █ █ █
   █    █ █ ███
   █ █  █ █ █
   ███  ███ █████
        </div>
        <div class="header-title-area">
          <h2 class="header-title">Command Code</h2>
          <span class="header-version" id="header-version">v0.0.0</span>
          <span class="header-models" id="header-models">loading...</span>
          <span class="header-cwd" id="header-cwd">~</span>
        </div>
      </div>
      <div class="metrics">
        <span class="metric" id="token-count">TOKENS // P 0 / C 0 / 0</span>
        <span class="metric" id="model-name">MODEL // NONE</span>
        <span class="metric" id="perm-mode">PERM // STANDARD</span>
      </div>
    </div>

    <div class="action-bar">
      <button class="action-btn" data-action="start" title="Start New Session">&#x25B6; START</button>
      <button class="action-btn" data-action="continue" title="Continue Last Session">&#x21BB; CONTINUE</button>
      <button class="action-btn" data-action="list-sessions" title="Recent Sessions">&#x2630; SESSIONS</button>
      <button class="action-btn" data-action="list-agents" title="Active Agents">&#x2691; AGENTS</button>
      <button class="action-btn" data-action="toggle-context" title="Toggle Context Panel">&#x2630; CTX</button>
      <button class="action-btn" data-action="pick-model" title="Pick Model">&#x2699; MODEL</button>
      <button class="action-btn" data-action="pick-permission" title="Pick Permission">&#x2699; PERM</button>
      <button class="action-btn" data-action="show-status" title="Show Status">&#x2139; STATUS</button>
    </div>

    <div class="main-content">
      <div class="panel-container">
        <div id="chat-panel" class="panel panel-active">
          <div class="chat-history" id="chat-history"></div>
          <div id="tui-active-status" class="tui-status-line hidden">
            <span class="tui-status-spinner">o</span>
            <span class="tui-status-text">Hypothesizing... esc to interrupt</span>
            <span class="tui-status-time">&bull; 0s</span>
            <span class="tui-status-tokens">&bull; &darr; 0</span>
          </div>
          <div class="chat-input-container">
            <div id="autocomplete-list" class="autocomplete-list hidden"></div>
            <div class="input-prompt-row">
              <span class="input-prompt">&#x276F;</span>
              <textarea id="chat-input" placeholder="Ask your question..."></textarea>
            </div>
            <div class="prompt-tui-bar">
              <span class="tui-shortcut-help">? for shortcuts</span>
              <span class="tui-learning-status">[ctrl+t] continuous learning</span>
              <span class="tui-taste-toggle" id="tui-taste-toggle">&#x25A1; TASTE</span>
            </div>
            <div class="chat-input-row">
              <div class="qr-code"></div>
              <button id="send-btn">&#x276F; Execute</button>
            </div>
          </div>
        </div>

        <div id="sessions-panel" class="panel">
          <div class="panel-header">
            <span>RECENT SESSIONS</span>
            <button class="panel-close" data-panel="sessions">&#x2715;</button>
          </div>
          <div class="session-list" id="session-list"></div>
        </div>

        <div id="agents-panel" class="panel">
          <div class="panel-header">
            <span>ACTIVE AGENTS</span>
            <button class="panel-close" data-panel="agents">&#x2715;</button>
          </div>
          <div class="session-list" id="agent-list"></div>
        </div>

        <div id="status-panel" class="panel">
          <div class="panel-header">
            <span>STATUS</span>
            <button class="panel-close" data-panel="status">&#x2715;</button>
          </div>
          <pre class="status-content" id="status-content"></pre>
        </div>
      </div>

      <div id="context-panel" class="sidebar hidden">
        <div class="panel-header">
          <span>CONTEXT</span>
          <button class="panel-close" data-panel="context">&#x2715;</button>
        </div>
        <div class="context-section">
          <div class="context-section-title">GIT</div>
          <div class="context-section-body" id="context-git-body">
            <span class="context-muted">No git data</span>
          </div>
        </div>
        <div class="context-section">
          <div class="context-section-title">FILES</div>
          <div class="context-section-body" id="context-files-body">
            <span class="context-muted">No files open</span>
          </div>
        </div>
        <div class="context-section">
          <div class="context-section-title">DIAGNOSTICS</div>
          <div class="context-section-body" id="context-diag-body">
            <span class="context-muted">No diagnostics</span>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <span class="footer-item" id="footer-model">MODEL // \${state.modelId || 'NONE'}</span>
      <span class="footer-item" id="footer-mode">MODE // \${state.permissionMode || 'STANDARD'}</span>
      <span class="footer-item" id="footer-tokens">T // P 0 / C 0 / 0</span>
      <span class="footer-item" id="footer-session">SESSION // --</span>
      <span class="footer-item" id="footer-turn">TURN // 0</span>
      <span class="footer-item streaming-indicator" id="footer-stream"></span>
    </div>
  `;

  attachEventListeners();
  updateFooter();

  const chatHistory = document.getElementById('chat-history');
  if (chatHistory) setupScrollButton(chatHistory);
  const statusContent = document.getElementById('status-content');
  if (statusContent) setupScrollButton(statusContent);

  // Restore state if it exists
  const previousState = vscode.getState() as Partial<typeof state> | null;
  if (previousState) {
    state.tokens = previousState.tokens || state.tokens;
    state.modelId = previousState.modelId || state.modelId;
    state.permissionMode = previousState.permissionMode || state.permissionMode;
    state.statusText = previousState.statusText || state.statusText;
    state.sessions = previousState.sessions;
    state.currentSessionId = previousState.currentSessionId || null;
    state.turnCount = previousState.turnCount || 0;
    state.context = previousState.context || state.context;
    if (!state.context.dirtyFiles) state.context.dirtyFiles = [];
    state.messages = previousState.messages || [];
    state.activePanel = previousState.activePanel || 'chat';
    state.inputDraft = previousState.inputDraft || '';
    state.agents = previousState.agents || [];
    state.continuousLearning = previousState.continuousLearning !== undefined ? previousState.continuousLearning : state.continuousLearning;
    state.cliVersion = previousState.cliVersion || '';
    state.modelsLabel = previousState.modelsLabel || '';
    hydrateUI();
  } else {
    updateTasteUI();
  }
}

// ─── Message Event Handler ────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message?.jsonrpc === '2.0' && message.method === 'webview/dispatchEvent') {
    const { type, payload } = message.params;

    switch (type) {
      case 'RenderMessage': {
        const { id, role, content } = payload as {
          id: string;
          role: string;
          content: string;
        };
        appendMessage({ id, role, content });
        addOrUpdateMessage({ id, role, content });
        break;
      }

      case 'RenderImage': {
        const { id, role, dataUri } = payload as {
          id: string;
          role: string;
          dataUri: string;
        };
        const content = `<img src="${dataUri}" class="chat-image" />`;
        appendMessage({
          id,
          role,
          content,
        });
        addOrUpdateMessage({ id, role, content, isImage: true, dataUri });
        break;
      }

      case 'RenderDiffProposal': {
        const { id, diffText } = payload as { id: string; diffText: string };
        const html = renderDiffProposalHtml(id, diffText);
        appendMessage({ id, role: 'system', content: html });
        addOrUpdateMessage({ id, role: 'system', content: html, isDiffProposal: true, diffText });
        break;
      }

      case 'UpdateAgents': {
        state.agents = payload.agents ?? [];
        saveState();
        renderAgentList(state.agents);
        break;
      }

      case 'UpdateTokens': {
        state.tokens = payload;
        saveState();
        updateHeader();
        updateFooter();
        break;
      }

      case 'StreamMessageChunk': {
        const { id, role, chunk } = payload as {
          id: string;
          role: string;
          chunk: string;
        };
        // Track when streaming starts for thought duration
        if (!streamingStartTime) streamingStartTime = Date.now();

        const history = document.getElementById('chat-history');
        if (!history) break;
        switchPanel('chat');

        let div = document.getElementById(id);
        if (!div) {
          div = document.createElement('div');
          div.id = id;
          div.className = `message message-${role}`;
          div.dataset.raw = '';
          history.appendChild(div);
          // Remove streaming cursor when first chunk arrives
          const cursor = document.getElementById('streaming-cursor');
          if (cursor) cursor.remove();
        }

        div.dataset.raw += chunk;

        const raw = div.dataset.raw ?? '';
        // Light path: structural replacements only, no marked.parse()
        appendMessage({ id, role, content: raw }, true);
        addOrUpdateMessage({ id, role, content: raw, raw });
        break;
      }

      case 'StreamFinished': {
        setExecutingState(false);
        streamingStartTime = 0;
        // Final full render: re-render streaming messages with marked.parse()
        // so the user sees fully formatted markdown at completion
        const { id } = payload as { id: string };
        if (id) {
          const msg = state.messages.find(m => m.id === id);
          if (msg) {
            appendMessage({ id: msg.id, role: msg.role, content: msg.content || msg.raw || '' }, false);
            addOrUpdateMessage({ id: msg.id, role: msg.role, content: msg.content || msg.raw || '' });
          }
        }
        break;
      }

      case 'StdoutChunk': {
        const content = document.getElementById('status-content');
        if (content) {
          switchPanel('status');
          const wasAtBottom = isNearBottom(content);
          state.statusText += payload.chunk;
          saveState();
          content.innerHTML = cleanAndColorAnsi(state.statusText);
          if (wasAtBottom) {
            scrollToBottom(content);
          }
        }
        break;
      }

      case 'ClearChat':
      case 'ResetSession': {
        state.messages = [];
        state.statusText = '';
        state.agents = [];
        saveState();
        hydrateUI();
        switchPanel('chat');
        break;
      }

      case 'FocusInput': {
        const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
        if (input) {
          input.focus();
        }
        break;
      }

      case 'initState': {
        const { modelId, permissionMode, tokens, sessionId, turnCount, cliVersion, modelsLabel } =
          payload as {
            modelId: string;
            permissionMode: string;
            tokens: {
              prompt: number;
              completion: number;
              total: number;
            };
            sessionId?: string;
            turnCount?: number;
            cliVersion?: string;
            modelsLabel?: string;
          };
        state.modelId = modelId;
        state.permissionMode = permissionMode;
        state.tokens = tokens;
        state.currentSessionId = sessionId ?? null;
        state.turnCount = turnCount ?? 0;
        if (cliVersion) state.cliVersion = cliVersion;
        if (modelsLabel) state.modelsLabel = modelsLabel;
        saveState();
        updateHeader();
        updateFooter();
        break;
      }

      case 'permChanged': {
        state.permissionMode = payload.permissionMode;
        saveState();
        updateHeader();
        updateFooter();
        break;
      }

      case 'modelChanged':
      case 'ModelChanged': {
        state.modelId = payload.modelId;
        if (payload.modelsLabel) {
          state.modelsLabel = payload.modelsLabel;
        }
        saveState();
        updateHeader();
        updateFooter();
        break;
      }

      case 'SessionList': {
        state.sessions = payload.sessions ?? [];
        saveState();
        renderSessionList(state.sessions ?? []);
        break;
      }

      case 'StatusResult': {
        setExecutingState(false);
        state.statusText = payload.text ?? '';
        saveState();
        renderStatus(state.statusText);
        break;
      }

      case 'Notification': {
        showToast(payload.text ?? '', 'info', 5000);
        break;
      }

      case 'BackgroundTaskNotification': {
        const data = payload.data as Record<string, unknown> | undefined;
        const title =
          typeof data?.title === 'string'
            ? data.title
            : 'Background Task Completed';
        const message =
          typeof data?.message === 'string'
            ? data.message
            : 'A background task has finished execution.';
        showToast(`${title}: ${message}`, 'success', 6000);
        break;
      }

      case 'UpdateContext': {
        const { workspace, activeFile, openFiles, git } = payload as {
          workspace?: { rootPath: string };
          activeFile?: { relativePath: string; language: string };
          openFiles?: Array<{
            relativePath: string;
            language: string;
            isActive?: boolean;
          }>;
          git?: { branch: string; dirtyFiles: Array<unknown> };
        };
        state.context.workspaceRoot = workspace?.rootPath ?? '';
        state.context.activeFile = activeFile
          ? { path: activeFile.relativePath, language: activeFile.language }
          : null;
        state.context.openFiles = (openFiles ?? []).map((f) => ({
          path: f.relativePath,
          language: f.language,
          isActive: f.isActive ?? false,
        }));
        state.context.gitBranch = git?.branch ?? null;
        state.context.dirtyFilesCount = git?.dirtyFiles?.length ?? 0;
        state.context.dirtyFiles = (git?.dirtyFiles as string[]) ?? [];
        saveState();
        updateContextPanel();
        break;
      }

      case 'UpdateSessionInfo': {
        const { sessionId, turnCount: tCount } = payload as {
          sessionId: string;
          turnCount: number;
        };
        state.currentSessionId = sessionId;
        state.turnCount = tCount ?? 0;
        saveState();
        updateFooter();
        break;
      }

      case 'UpdateTurnCount': {
        state.turnCount = payload.turnCount;
        saveState();
        updateFooter();
        break;
      }

      case 'UpdateDiagnostics': {
        const diags = payload.diagnostics as
          | Array<{ diagnostics: Array<unknown> }>
          | undefined;
        state.context.diagnosticsCount =
          diags?.reduce(
            (sum: number, f: { diagnostics: unknown[] }) =>
              sum + (f.diagnostics?.length ?? 0),
            0,
          ) ?? 0;
        saveState();
        updateContextPanel();
        break;
      }
    }
  }
});

try {
  initUI();
} catch (err) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div style="padding: 20px; color: var(--vscode-errorForeground); font-family: sans-serif;">
        <h3>⚠️ Something went wrong</h3>
        <p>Failed to initialize the CMD Lite UI.</p>
        <pre style="background: rgba(0,0,0,0.1); padding: 10px; border-radius: 4px; overflow-x: auto;">${err instanceof Error ? err.stack || err.message : String(err)}</pre>
        <button onclick="window.location.reload()" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 2px; cursor: pointer;">Reload Window</button>
      </div>
    `;
  }
}
