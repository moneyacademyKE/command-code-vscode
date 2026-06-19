/// <reference lib="dom" />
/**
 * TUI-Inspired Webview Renderer
 *
 * Mirrors the Command Code CLI TUI experience: persistent status footer,
 * context sidebar, structured message rendering (thought accordions, tool
 * calls, diff blocks), and session-aware state tracking for long-horizon goals.
 */
import { marked } from 'marked';

// @ts-expect-error acquireVsCodeApi is provided by VS Code webview
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
    diagnosticsCount: 0,
  },
  messages: [],
  activePanel: 'chat',
  inputDraft: '',
  agents: [],
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

// ─── Utilities ───────────────────────────────────────

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Stateful ANSI Escape to HTML Parser ─────────────
function ansiToHtml(text: string): string {
  const ansiRegex = /\u001b\[([0-9;]*)m/g;
  let currentSpanOpen = false;
  let result = '';
  let lastIndex = 0;
  let match;
  
  let fgColor: string | null = null;
  let isBold = false;

  function getSpanStyle() {
    let styles: string[] = [];
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
  let cleaned = text.replace(/\u001b\[[0-9;]*[a-lA-Ln-zN-Z]/g, '');
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
  el.scrollTop = el.scrollHeight;
}

function setupScrollButton(container: HTMLElement): void {
  const btn = document.createElement('button');
  btn.id = 'scroll-bottom-btn';
  btn.className = 'scroll-bottom-btn';
  btn.textContent = '\u25BC BOTTOM';
  btn.addEventListener('click', () => scrollToBottom(container));
  container.parentElement?.appendChild(btn);

  container.addEventListener('scroll', () => {
    btn.classList.toggle('visible', !isNearBottom(container));
  });
}

// ─── Footer Status Bar ────────────────────────────────

function updateHeader() {
  const mn = document.getElementById('model-name');
  if (mn) mn.innerText = `MODEL // ${state.modelId || 'NONE'}`;
  const pm = document.getElementById('perm-mode');
  if (pm)
    pm.innerText = `PERM // ${state.permissionMode || 'STANDARD'}`;
  const tc = document.getElementById('token-count');
  if (tc)
    tc.innerText = `TOKENS // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;
}

function updateFooter() {
  const el = (id: string) => document.getElementById(id);
  const fModel = el('footer-model');
  const fMode = el('footer-mode');
  const fTokens = el('footer-tokens');
  const fSession = el('footer-session');
  const fTurn = el('footer-turn');
  const fStream = el('footer-stream');

  if (fModel) fModel.textContent = `MODEL // ${state.modelId || 'NONE'}`;
  if (fMode) fMode.textContent = `MODE // ${state.permissionMode || 'STANDARD'}`;
  if (fTokens)
    fTokens.textContent = `T // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;
  if (fSession)
    fSession.textContent = `SESSION // ${state.currentSessionId ? state.currentSessionId.slice(0, 8) : '--'}`;
  if (fTurn) fTurn.textContent = `TURN // ${state.turnCount}`;
  if (fStream) fStream.classList.toggle('is-active', state.isStreaming);
}

// ─── Context Sidebar ──────────────────────────────────

function updateContextPanel() {
  const ctx = state.context;

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
      if (ctx.activeFile) {
        html += `<div class="context-file">
          <span class="context-file-path">&#x25B6; ${escapeHtml(ctx.activeFile.path)}</span>
          <span class="context-file-lang">${ctx.activeFile.language}</span>
        </div>`;
      }
      for (const f of ctx.openFiles) {
        if (f.path !== ctx.activeFile?.path) {
          html += `<div class="context-file">
            <span class="context-file-path">${escapeHtml(f.path)}</span>
            <span class="context-file-lang">${f.language}</span>
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
      diagBody.innerHTML = `<span class="context-diag-error">&#x26A0; ${ctx.diagnosticsCount} issues</span>`;
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

function processMessageContentLight(raw: string): string {
  // Fast streaming path: structural replacements only, no marked.parse()
  // Used on every streaming chunk to avoid O(n²) re-parse
  if (raw.startsWith('<img') || raw.startsWith('<div class="diff-widget"') || raw.startsWith('<div class="code-container"')) {
    return raw;
  }

  let processed = raw;

  processed = processed.replace(
    /<thought>([\s\S]*?)<\/thought>/gi,
    (_m: string, inner: string) => {
      const html = marked.parse(inner.trim()) as string;
      return `<details class="step-accordion" open><summary>&#x1F914; Reasoning</summary><div class="thought-content">${html}</div></details>`;
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

function processMessageContent(raw: string): string {
  // Final message path: full render including marked.parse()
  if (raw.startsWith('<img') || raw.startsWith('<div class="diff-widget"') || raw.startsWith('<div class="code-container"')) {
    return raw;
  }

  let processed = raw;

  processed = processed.replace(
    /<thought>([\s\S]*?)<\/thought>/gi,
    (_m: string, inner: string) => {
      const html = marked.parse(inner.trim()) as string;
      return `<details class="step-accordion" open><summary>&#x1F914; Reasoning</summary><div class="thought-content">${html}</div></details>`;
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

  // Only do full marked.parse() at completion — never during streaming
  if (processed === raw) {
    processed = marked.parse(raw) as string;
  }

  return processed;
}

// ─── Message Rendering ────────────────────────────────

function appendMessage(m: { id: string; role: string; content: string }, streaming?: boolean) {
  const history = document.getElementById('chat-history');
  if (!history) return;
  switchPanel('chat');
  let div = document.getElementById(m.id);
  if (!div) {
    div = document.createElement('div');
    div.id = m.id;
    div.className = `message message-${m.role}`;
    history.appendChild(div);
  }

  let parsedContent: string;
  try {
    parsedContent = streaming ? processMessageContentLight(m.content) : processMessageContent(m.content);
  } catch {
    parsedContent = `<pre>${escapeHtml(m.content)}</pre>`;
  }

  div.innerHTML = `<span class="message-role">${m.role}</span><div class="message-content">${parsedContent}</div>`;
  if (isNearBottom(history)) scrollToBottom(history);
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
    list.innerHTML = '<div class="session-empty">No recent sessions.</div>';
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
    list.innerHTML = '<div class="session-empty">No active agents.</div>';
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
  content.textContent = text;
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

function hydrateUI() {
  const history = document.getElementById('chat-history');
  if (!history) return;
  
  history.innerHTML = '';
  state.messages.forEach(m => {
    const div = document.createElement('div');
    div.id = m.id;
    div.className = `message message-${m.role}`;
    if (m.raw) {
      div.dataset.raw = m.raw;
    }
    const parsed = processMessageContent(m.content);
    div.innerHTML = `<span class="message-role">${m.role}</span><div class="message-content">${parsed}</div>`;
    history.appendChild(div);
  });
  
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
}

function attachEventListeners() {
  // Action buttons
  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (!action) return;

      if (action === 'toggle-context') {
        const sidebar = document.getElementById('context-panel');
        if (sidebar) sidebar.classList.toggle('hidden');
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
          const history = document.getElementById('chat-history');
          if (history) history.innerHTML = '';
          state.messages = [];
          saveState();
          return;
        }

        if (cmd === '/help') {
          const helpMsg = {
            id: 'help-' + Date.now(),
            role: 'system',
            content: `### Command Code CLI Webview Guide\n\n` +
                     `- \`/help\` - Show this help guide\n` +
                     `- \`/clear\` - Clear chat history\n` +
                     `- \`/plan <task>\` - Execute task in plan mode (dry-run)\n` +
                     `- \`/sessions\` - Switch to recent sessions panel\n` +
                     `- \`/agents\` - Switch to active agents board\n` +
                     `- \`!<command>\` - Run direct bash commands (e.g. \`!npm test\`)\n` +
                     `- \`@<filename>\` - Autocomplete file context paths\n`
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

        const cmdErr = { id: 'cmd-err-' + Date.now(), role: 'system', content: `Unknown command: ${cmd}. Type /help for options.` };
        appendMessage(cmdErr);
        addOrUpdateMessage(cmdErr);
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
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
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
      <h2>Command Code</h2>
      <div class="metrics">
        <span class="metric" id="token-count">TOKENS // P \${state.tokens.prompt.toLocaleString()} / C \${state.tokens.completion.toLocaleString()} / \${state.tokens.total.toLocaleString()}</span>
        <span class="metric" id="model-name">MODEL // \${state.modelId || 'NONE'}</span>
        <span class="metric" id="perm-mode">PERM // \${state.permissionMode || 'STANDARD'}</span>
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
          <div class="chat-input-container">
            <div id="autocomplete-list" class="autocomplete-list hidden"></div>
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

  // Restore state if it exists
  const previousState = vscode.getState();
  if (previousState) {
    state.tokens = previousState.tokens || state.tokens;
    state.modelId = previousState.modelId || state.modelId;
    state.permissionMode = previousState.permissionMode || state.permissionMode;
    state.statusText = previousState.statusText || state.statusText;
    state.sessions = previousState.sessions;
    state.currentSessionId = previousState.currentSessionId || null;
    state.turnCount = previousState.turnCount || 0;
    state.context = previousState.context || state.context;
    state.messages = previousState.messages || [];
    state.activePanel = previousState.activePanel || 'chat';
    state.inputDraft = previousState.inputDraft || '';
    state.agents = previousState.agents || [];
    hydrateUI();
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
          state.statusText += payload.chunk;
          saveState();
          content.innerHTML = cleanAndColorAnsi(state.statusText);
          if (isNearBottom(content)) scrollToBottom(content);
        }
        break;
      }

      case 'initState': {
        const { modelId, permissionMode, tokens, sessionId, turnCount } =
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
          };
        state.modelId = modelId;
        state.permissionMode = permissionMode;
        state.tokens = tokens;
        state.currentSessionId = sessionId ?? null;
        state.turnCount = turnCount ?? 0;
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
        const helpMsg = {
          id: 'sys-' + Date.now(),
          role: 'system',
          content: payload.text,
        };
        appendMessage(helpMsg);
        addOrUpdateMessage(helpMsg);
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
        const html = `
          <div class="diff-widget" style="border-color: var(--vscode-notificationsInfoIcon-foreground);">
            <div class="diff-header" style="background: var(--vscode-notificationsInfoIcon-foreground); color: var(--vscode-editor-background);">
              <span>&#x1F514; NOTIFICATION</span>
            </div>
            <div class="diff-content" style="padding: 8px;">
              <strong>${escapeHtml(title)}</strong><br/>
              ${escapeHtml(message)}
            </div>
          </div>
        `;
        const notificationMsg = { id: 'bg-' + Date.now(), role: 'system', content: html };
        appendMessage(notificationMsg);
        addOrUpdateMessage(notificationMsg);
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

initUI();
