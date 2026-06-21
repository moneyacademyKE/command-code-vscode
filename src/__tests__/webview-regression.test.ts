import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");

describe("webview visual parity regression prevention", () => {
  const css = readFileSync(join(root, "dist", "webview", "style.css"), "utf-8");
  const mainSrc = readFileSync(join(root, "src", "webview", "main.ts"), "utf-8");

  // ── Build Artifacts Exist ──
  it("build outputs exist", () => {
    expect(existsSync(join(root, "dist", "webview", "main.js"))).toBe(true);
    expect(existsSync(join(root, "dist", "webview", "style.css"))).toBe(true);
    expect(existsSync(join(root, "dist", "extension.js"))).toBe(true);
  });

  // ── Header Visual Elements ──
  describe("header parity", () => {
    it("has CMD ASCII art logo in initUI template", () => {
      expect(mainSrc).toContain("header-logo");
      expect(mainSrc).toMatch(/█.*█.*█/); // block characters in logo
    });

    it("has #-prefixed version span", () => {
      expect(mainSrc).toContain('id="header-version"');
      expect(css).toContain("header-version");
      expect(css).toContain('content: "# "');
    });

    it("has #-prefixed models span", () => {
      expect(mainSrc).toContain('id="header-models"');
      expect(css).toContain("header-models");
    });

    it("has #-prefixed CWD span", () => {
      expect(mainSrc).toContain('id="header-cwd"');
      expect(css).toContain("header-cwd");
    });

    it("has crosshair corner decorations (4)", () => {
      expect(mainSrc).toMatch(/crosshair.*tl.*tr.*bl.*br/s);
      expect(css).toContain(".crosshair");
      expect(css).toContain(".tl");
      expect(css).toContain(".tr");
      expect(css).toContain(".bl");
      expect(css).toContain(".br");
    });

    it("has CRT scan-line overlay", () => {
      expect(css).toContain("body::after");
      expect(css).toContain("Scanning line overlay");
    });

    it("has grid background", () => {
      expect(css).toContain("background-size: 20px 20px");
    });
  });

  // ── Action Bar ──
  describe("action bar parity", () => {
    it("has 8 action buttons", () => {
      const matches = mainSrc.match(/class="action-btn"/g);
      expect(matches?.length).toBe(8);
    });

    it("has START button", () => expect(mainSrc).toContain("START"));
    it("has CONTINUE button", () => expect(mainSrc).toContain("CONTINUE"));
    it("has SESSIONS button", () => expect(mainSrc).toContain("SESSIONS"));
    it("has AGENTS button", () => expect(mainSrc).toContain("AGENTS"));
    it("has CTX button", () => expect(mainSrc).toContain("CTX"));
    it("has MODEL button", () => expect(mainSrc).toContain("MODEL"));
    it("has PERM button", () => expect(mainSrc).toContain("PERM"));
    it("has STATUS button", () => expect(mainSrc).toContain("STATUS"));
  });

  // ── Input Area Visual Elements ──
  describe("input area parity", () => {
    it("has ❯ input prompt character", () => {
      expect(mainSrc).toContain("input-prompt");
      expect(css).toContain("input-prompt");
      expect(mainSrc).toContain("&#x276F;"); // ❯ HTML entity
    });

    it('has "Ask your question..." placeholder', () => {
      expect(mainSrc).toContain("Ask your question...");
    });

    it("has CLI-style separator line (::before)", () => {
      expect(css).toContain("chat-input-container::before");
      expect(css).toContain("repeating-linear-gradient");
    });

    it("has second separator below input row (::after)", () => {
      expect(css).toContain("input-prompt-row::after");
      expect(css).toContain("repeating-linear-gradient");
    });

    it('has "? for shortcuts" text', () => {
      expect(mainSrc).toContain("? for shortcuts");
    });

    it('has "[ctrl+t] continuous learning" text', () => {
      expect(mainSrc).toContain("[ctrl+t] continuous learning");
    });

    it("has TASTE toggle element", () => {
      expect(mainSrc).toContain("tui-taste-toggle");
      expect(mainSrc).toContain("TASTE");
    });

    it("has ❯ prefix on send button", () => {
      expect(mainSrc).toContain("&#x276F; Execute</button>");
    });
  });

  // ── Footer ──
  describe("footer parity", () => {
    it("has footer-bar with 6 items", () => {
      expect(mainSrc).toContain("footer-bar");
      expect(mainSrc).toContain('id="footer-model"');
      expect(mainSrc).toContain('id="footer-mode"');
      expect(mainSrc).toContain('id="footer-tokens"');
      expect(mainSrc).toContain('id="footer-session"');
      expect(mainSrc).toContain('id="footer-turn"');
      expect(mainSrc).toContain('id="footer-stream"');
    });

    it("has connection status dot", () => {
      expect(css).toContain("connection-dot");
      expect(css).toContain("connection-dot.connected");
      expect(css).toContain("connection-dot.disconnected");
    });

    it("has streaming indicator blink", () => {
      expect(css).toContain("streaming-indicator");
      expect(css).toContain("blink-cursor");
    });
  });

  // ── Thought Accordion ──
  describe("thought accordion parity", () => {
    it("has ✻ prefix via CSS", () => {
      expect(css).toContain("step-accordion summary::before");
      expect(css).toContain('content: "');
      expect(css).toContain("✻");
    });

    it("renders duration when streaming", () => {
      expect(mainSrc).toContain("formatThoughtDuration");
      expect(mainSrc).toContain("streamingStartTime ? 'for ' + formatThoughtDuration");
      expect(mainSrc).toContain("ctrl+o to expand");
    });

    it('uses "second/seconds" format', () => {
      expect(mainSrc).toContain("formatThoughtDuration");
      expect(mainSrc).toContain("1 second");
      expect(mainSrc).toContain("seconds");
    });
  });

  // ── Message Rendering ──
  describe("message rendering parity", () => {
    it("prepends ⠶ to system/agent messages", () => {
      expect(mainSrc).toContain("⠶");
      expect(mainSrc).toContain("contentToRender = '⠶ ' + contentToRender");
    });

    it("renders thought accordion from <thought> tags", () => {
      expect(mainSrc).toContain("<thought>");
      expect(mainSrc).toContain("step-accordion");
    });

    it("renders tool call widgets from <tool_call> tags", () => {
      expect(mainSrc).toContain("<tool_call>");
      expect(mainSrc).toContain('tool-call-header"');
    });

    it("renders result widgets from <result> tags", () => {
      expect(mainSrc).toContain("<result>");
      expect(mainSrc).toContain("tool-result");
    });

    it("renders diff blocks from ```diff", () => {
      expect(mainSrc).toContain("```diff");
      expect(mainSrc).toContain("diff-block");
    });

    it("has syntax highlighting token classes", () => {
      expect(css).toContain(".token-comment");
      expect(css).toContain(".token-string");
      expect(css).toContain(".token-keyword");
      expect(css).toContain(".token-number");
    });

    it("has code copy buttons", () => {
      expect(mainSrc).toContain("copy-code-btn");
      expect(css).toContain(".copy-code-btn");
    });
  });

  // ── Slash Commands ──
  describe("slash command routing parity", () => {
    it("handles /clear locally", () => {
      expect(mainSrc).toContain("'/clear'");
    });

    it("handles /help locally with full listing", () => {
      expect(mainSrc).toContain("'/help'");
      const helpContent = mainSrc.match(/helpMsg.*\n[\s\S]*?;/);
      expect(helpContent).not.toBeNull();
    });

    it("handles /plan with CLI routing", () => {
      expect(mainSrc).toContain("'/plan'");
      expect(mainSrc).toContain("plan: true");
    });

    it("handles /sessions locally", () => {
      expect(mainSrc).toContain("'/sessions'");
      expect(mainSrc).toContain("list-sessions");
    });

    it("handles /agents locally", () => {
      expect(mainSrc).toContain("'/agents'");
    });

    it("routes unknown slash commands to CLI", () => {
      expect(mainSrc).toContain("cliSlashMsg");
      // Should NOT have "Unknown command" error text
      expect(mainSrc).not.toContain("Unknown command:");
    });
  });

  // ── Keyboard Shortcuts ──
  describe("keyboard shortcut parity", () => {
    it("handles Shift+Tab for permission mode", () => {
      expect(mainSrc).toContain("Shift+Tab");
      expect(mainSrc).toContain("set-permission-mode");
    });

    it("handles Ctrl+T for learning toggle", () => {
      expect(mainSrc).toContain("Ctrl+T");
      expect(mainSrc).toContain("continuousLearning");
    });

    it("handles Ctrl+O for accordion toggle", () => {
      expect(mainSrc).toContain("Ctrl+O");
    });

    it("handles Alt+P for model picker", () => {
      expect(mainSrc).toContain("Alt+P");
      expect(mainSrc).toContain("pick-model");
    });

    it("handles Ctrl+G for editor open", () => {
      expect(mainSrc).toContain("Ctrl+G");
      expect(mainSrc).toContain("open-in-editor");
    });

    it("handles Escape for interrupt/checkpoint", () => {
      expect(mainSrc).toContain("Escape");
      expect(mainSrc).toContain("interrupt-execution");
      expect(mainSrc).toContain("checkpoint-restore");
    });
  });

  // ── Panel System ──
  describe("panel system parity", () => {
    it("has chat panel", () => {
      expect(mainSrc).toContain('id="chat-panel"');
    });

    it("has sessions panel", () => {
      expect(mainSrc).toContain('id="sessions-panel"');
    });

    it("has agents panel (kanban)", () => {
      expect(mainSrc).toContain('id="agents-panel"');
      expect(css).toContain(".kanban-board");
      expect(css).toContain(".kanban-column");
      expect(css).toContain(".kanban-card");
    });

    it("has status panel", () => {
      expect(mainSrc).toContain('id="status-panel"');
      expect(css).toContain("status-terminal-bar");
    });

    it("has toggleable context sidebar", () => {
      expect(mainSrc).toContain('id="context-panel"');
      expect(css).toContain(".sidebar.hidden");
    });
  });

  // ── Onboarding Welcomer ──
  describe("onboarding welcomer parity", () => {
    it("renders Start New Session button on messages empty state", () => {
      expect(mainSrc).toContain("onboarding-start-session-btn");
      expect(mainSrc).toContain('data-action="start"');
      expect(mainSrc).toContain("Start New Session");
    });

    it("has start session button styling defined in CSS", () => {
      expect(css).toContain(".onboarding-start-session-btn");
      expect(css).toContain("transform: scale(1.02)");
      expect(css).toContain("transform: scale(0.98)");
      expect(css).toContain(".onboarding-start-session-btn:focus-visible");
    });

    it("delegates click action start to sendAction", () => {
      expect(mainSrc).toContain("action === 'start'");
      expect(mainSrc).toContain("sendAction('start')");
    });
  });

  // ── Streaming Status ──
  describe("streaming status parity", () => {
    it("has Hypothesizing status line", () => {
      expect(mainSrc).toContain("tui-active-status");
      expect(mainSrc).toContain("Hypothesizing");
      expect(mainSrc).toContain("esc to interrupt");
    });

    it("has spinner that rotates frames", () => {
      expect(mainSrc).toContain("spinnerFrames");
      expect(mainSrc).toContain("spinnerEl.innerText");
    });

    it("tracks duration with status timer", () => {
      expect(mainSrc).toContain("statusTimer");
      expect(mainSrc).toContain("formatDuration");
    });

    it("tracks token count during execution", () => {
      expect(mainSrc).toContain("tokensEl.innerHTML");
    });
  });

  // ── Autocomplete ──
  describe("autocomplete parity", () => {
    it("autocompletes /commands", () => {
      expect(mainSrc).toContain("'/help'");
      expect(mainSrc).toContain("'/clear'");
    });

    it("autocompletes @files", () => {
      expect(mainSrc).toContain("'@'");
      expect(mainSrc).toContain("state.context.openFiles");
    });

    it("autocompletes !bash", () => {
      expect(mainSrc).toContain("'!'");
      expect(mainSrc).toContain("npm test");
    });
  });

  // ── ChatViewProvider Integration ──
  describe("extensions host parity", () => {
    const chatViewSrc = readFileSync(join(root, "src", "webview", "ChatViewProvider.ts"), "utf-8");

    it("sends cliVersion in initState", () => {
      expect(chatViewSrc).toContain("cliVersion");
    });

    it("sends modelsLabel in initState", () => {
      expect(chatViewSrc).toContain("modelsLabel");
    });

    it("fetches CLI version asynchronously", () => {
      expect(chatViewSrc).toContain("_fetchCliInfo");
      expect(chatViewSrc).toContain("checkCliVersion");
    });
  });
});
