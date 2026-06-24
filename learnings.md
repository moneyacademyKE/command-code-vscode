# Learnings — Command Code VS Code Extension

## Overview
This document records key technical learnings and installation details discovered during development.

## Project Structure & Setup
- **Type**: VS Code Extension wrapper for Command Code (`cmd`) CLI.
- **Main Entrypoint**: [extension.ts](file:///Users/moe/Desktop/cmd/src/extension.ts)
- **CLI Resolution**: Resolves binary using path configured in `commandcode.cliPath` (defaults to `cmd`).
- **Dependencies**: Uses `esbuild` for bundling and `@vscode/vsce` for packaging.

## Installation Methods
To install and run this extension:
1. **Prerequisite**: Globally install the `command-code` CLI:
   ```bash
   npm i -g command-code
   ```
2. **Direct VSIX Installation**:
   If a pre-packaged VSIX file is present in the workspace, run:
   ```bash
   code --install-extension command-code-0.1.0.vsix
   ```
3. **Build from Source & Package**:
   To compile and package locally:
   ```bash
   npm install
   npm run build
   npm run package
   code --install-extension command-code-0.1.0.vsix
   ```

## Development Commands
- `npm run watch` for auto-compilation during development.
- `npm run typecheck` to run typescript checks.

## CLI Session Management Gotchas
- **Argument Parsing Behavior**: Running `cmd -reset` or `cmd -restart` leads to errors like `No session named "eset" found.` because the parser interprets `-r` as the short flag for `--resume [name]` and consumes the remaining characters (`eset` or `estart`) as the session identifier.
- **Starting/Restarting**:
  - To start a new clean interactive session: `cmd`
  - To resume the last session: `cmd -c` or `cmd --continue`
  - To resume a specific session by ID or name: `cmd -r [name]`
  - To exit a running CLI session: type `/exit` in the terminal, or send a termination signal (e.g. `kill <pid>`).

## Package Manager and Version Conflicts
- **Problem**: When both `npm` and `yarn` are configured globally, `cmd update` might update the NPM package, but the active system binary in `/opt/homebrew/bin/cmd` might point to Yarn's global path (e.g. `/Users/moe/.config/yarn/global/node_modules/.bin/cmd`), leaving the executable stuck on the older version (e.g. `0.38.2`).
- **Solution**: To correctly update the CLI to the latest version in this setup, run:
  ```bash
  yarn global add command-code@latest
  ```
- Refer to [gap-analysis.md](file:///Users/moe/Desktop/cmd/docs/gap-analysis.md) for a comprehensive feature breakdown of `v0.39.0`.

## Extension Architecture & IPC Learnings (v0.1.0)
- **Token Handshake Security**: The extension secures UDS connections by establishing a UUID token handshake. The token is stored in the local session file, restricting access to processes that have access to the session directory (permissions set to `0o700`).
- **Debounced Context Updates**: Selection changes in the editor are debounced by 100ms before broadcasting to the context server. This avoids flooding the UDS IPC with message traffic during continuous editing.
- **Language Model Tools Integration**: Exposing `commandcode_runPrint`, `commandcode_getTaste`, and `commandcode_getDiagnostics` allows the Command Code agent to compose with other IDE chat participants (e.g. Copilot).
- **Session History Mapping**: Session history is parsed directly from `~/.commandcode/projects/{slug}/{uuid}.jsonl` metadata files, translating CLI execution logs into interactive sidebar components.
- **Headless Execution Authorization**: When executing `cmd` non-interactively via background processes or command runners (e.g., `-p` print mode), the `--yolo` flag (alias for `--dangerously-skip-permissions`) is required to authorize filesystem modification tools; otherwise, the agent is restricted by security sandbox defaults and halts.
- **Version Control Safety**: Initializing local Git tracking in the target workspace allows the agent to safely compute diff boundaries, run testing iterations, and roll back unintended modifications during automated execution loops.

## CI Dependency Resolution & Platform Binaries
- **Esbuild Platform Optional Dependencies**: When compiling extensions or web applications that use tools relying on platform-specific binaries (such as `esbuild`, `vite`, or `vitest`), version discrepancies between root devDependencies (e.g. `esbuild@^0.21.0`) and transitive dependencies of other tools (e.g. `vite@8` requesting `esbuild@^0.28.0`) can cause `npm ci` failures on CI runners with errors like `Missing: @esbuild/linux-x64@0.28.1 from lock file`. Aligning top-level devDependencies to match the versions requested by downstream tools allows `npm install` to correctly generate and lock platform-specific binaries for all target operating systems and architectures in the `package-lock.json`.

## Rebranding and Namespace Decoupling (v0.1.0)
- **Marketplace Isolation**: To prevent conflicts with the official extension, the package name is renamed to `cmd-lite` under display name `CMD Lite` and publisher `moneyacademyke`.
- **Namespace Consistency**: Internal settings namespaces, custom commands, and socket paths remain configured under the legacy `commandcode` namespace (e.g. `commandcode.cliPath`) to maintain compatibility with the global `cmd` CLI, keeping editor metadata changes decoupled from execution compatibility.

## UI Architecture (Thin Glass Pattern)
- **Webview vs CLI State**: Introducing rich frontend Webviews (like the Kilo Code sidebar) risks massive state entanglement if the frontend maintains its own model selection or token count state.
- **Dumb Renderers**: We solved this by using the "Thin Glass" pattern. The Webview is built with Vanilla JS without heavy frameworks. It purely receives `webview/dispatchEvent` JSON-RPC payloads (e.g., `RenderMessage`, `UpdateTokens`) from the `cmd` CLI via the extension, and acts as a dumb renderer.
- **Event-Driven Inputs**: All UI interactions (clicks, text input) are fired back to the CLI without mutating local UI state. The CLI processes them and emits a new state payload, ensuring Rich Hickey's "Simple Made Easy" principles are upheld in our UI layer.
- **Bi-directional Webview IPC**: We expanded the legacy `IpcMessage` protocol (Request/Response) with a unidirectional `IpcEvent` type. This allows the extension to bubble raw Webview interactions to the active CLI socket seamlessly, preventing the CLI from needing to poll the editor.
- **Uncomplecting DOM Rendering**: When building Vanilla JS Webviews, replacing the entire `innerHTML` on every state tick wipes out user input focus and text drafts. State updates should target specific DOM elements (`updateTokens`, `appendMessage`) to preserve structural UI identity.
- **Implicit UI Lock Inference**: To resolve deadlocks where older CLIs didn't send `CLAIM_UI_LOCK` but still actively sent Webview UI events (`DISPATCH_WEBVIEW_EVENT`), we added implicit lock inference to the IPC Server. A process generating UI events is implicitly recognized as the interactive UI owner, ensuring backward compatibility without losing 1:1 Session Affinity.
- **Defensive Architecture against Frameworks**: When evaluating frameworks like SolidJS (for fine-grained reactivity) and Partytown (for Web Worker DOM proxying), we apply Rich Hickey's Gap Analysis. For simple stateless Webviews, introducing JSX compilation and Web Worker proxies adds massive incidental complexity. We intentionally reject these frameworks to preserve our zero-dependency "Thin Glass" baseline, as they solve problems (vast local state, third-party script blocking) that our domain does not have.
- **Switch Case Block Scoping**: When handling multiple dispatch cases (e.g. `RenderMessage`, `UpdateTokens`) in Vanilla JS/TS reducers, ESLint's `no-case-declarations` prevents lexical declarations (`let`, `const`) inside case clauses without block scopes. Wrap case clauses containing lexical declarations in curly braces `{}` to avoid CI lint failures.

## Editor Capabilities Standardization (v0.1.0/MCP Update)
- **Model Context Protocol (MCP) Integration**: To avoid complecting the custom UDS IPC context server with infinite ad-hoc VS Code API requests (like "run terminal", "open file", "read errors"), we implemented a native MCP Server inside the extension. The CLI acts as the MCP Client. This standardizes Editor-Agent communication, ensuring the extension remains a "dumb host" while granting the CLI infinite extensible power. (See [MCP Roadmap](file:///Users/moe/Desktop/cmd/docs/mcp-roadmap.md) for long-term strategic evolution of these capabilities).

## Webview Observability (Rich Hickey Certified)
- **Streaming Chunks vs Batched Messages**: When exposing underlying tool logs (e.g. `cmd` execution stdout) to the user via a Webview, sending individual JSON-RPC messages per chunk creates an unmanageable number of DOM nodes. By separating structural message blocks (`RenderMessage`) from streaming logs (`StdoutChunk`), we decomplect terminal observation from chat history. We route stream chunks directly into a `<pre class="status-content">` block, ensuring simple and memory-efficient observability.

## Scripting and Tasks
- **Babashka (bb) over Python**: To standardize script execution and prevent environment fragmentation, all build and testing tasks are orchestrated via `bb.edn` using Babashka. Babashka leverages Clojure's simplicity and immutable data structures, perfectly aligning with the project's Rich Hickey philosophy.

## Agent Autonomy & External MCP Registries
- **Composable Registries Pivot**: We discovered that maintaining local custom scripts (e.g. Babashka file-system wrappers) inside an IDE extension couples the agent unnecessarily to the IDE repo, violating the goal of decomplecting. Instead, we pivot to generating an `mcp.json` that provisions **Official Reference MCP Servers** via `npx` (e.g., `@modelcontextprotocol/server-filesystem`). 
- **The Power of `npx -y`**: Generating configs that utilize `npx -y` allows the precompiled headless CLI to dynamically download and execute the latest external capabilities (File System, Git, Memory) strictly at runtime. This requires zero bundling, zero maintenance of generic tool logic within the extension, and leaves the extension operating purely as a lightweight configuration and UI layer.

## Agent Autonomy & State Decomplecting (Phase 2)
- **Session State Independence**: We discovered that relying on `vscode.ExtensionContext.globalState` to store the agent's session parameters (like model and permission mode) inherently complects the agent's memory with the editor's lifecycle. To support true headless CLI execution and autonomous background agents, we moved the session state to a persistent `~/.commandcode/session.json` store managed by `src/cli/store.ts`. Now, the state is a pure function of the filesystem, unentangling the UI renderer from the execution context.
- **Event-Driven Wakeups**: Synchronous polling wastes CPU cycles and creates unresponsive UIs. By introducing `NOTIFY_BACKGROUND_TASK` (aligning with MCP Triggers/Notifications) in the IPC server, background tasks can securely and asynchronously dispatch completion events to the Thin Glass Webview, alerting the user dynamically without blocking the main event loop.

## Deep Audit (SOTA 2026) & Security
- **Strict Socket Authentication**: Exposing UDS context sockets without authentication complects convenience with local privilege escalation. We implemented an `AUTH_HANDSHAKE` where the extension generates a UUID token and requires the connecting CLI to provide it.
- **CLI Version Guarding**: To prevent silent failures when the extension's JSON-RPC protocol evolves ahead of the user's global `cmd` CLI, a mandatory `checkCliVersion` check (via `cmd --version`) enforces a minimum supported baseline (e.g., v0.39.0).
- **Re-Adopting Babashka for Tooling**: We reverted the removal of Babashka specifically for ecosystem tooling scripts (like Git hook generation). We found that using JS/Node scripts (`install-hooks.js`) inside a TS/ESLint project complects tooling with application code (triggering false-positive linting errors). Babashka scripts provide instant startup, zero ecosystem friction, and adhere to Rich Hickey's "Simple Made Easy."
- **Rich Hickey Quality Checklist**:
  1. **Decomplected Boundaries**: Ensure tooling logic does not share configuration space with application build rules (e.g., using `bb` instead of Node).
  2. **Immutability & Dead Code**: Remove all unused mutable state (e.g., `activePanel`) to reduce cognitive load.
  3. **Data Verification**: Eliminate `any` casts. Always verify payloads explicitly via `unknown` narrowing or specs.

## Input Stream & Visual Progress Decoupling (v0.1.2)
- **Decoupled Autocomplete Tokenization**: Rather than complecting the LLM prompt execution logic with UI auto-completion state, we separate them at the webview level. Autocomplete triggers (`/`, `@`, `!`) are intercepted locally and filtered against read-only state payloads (like open files or static commands), presenting an autocomplete popover without notifying or blocking the extension host.
- **Direct Terminal Routing**: In matching Command Code CLI's `!` bash mode, we intercept inputs starting with `!` and route them directly to a child process spawn routine on the extension host. This allows commands to run and stream output back in real-time, bypasses the LLM pipeline, and maintains a clean boundary between natural language tasks and shell processes.
- **Visual Kanban Progression Mapping**: Instead of displaying background parallel agents linearly, we dynamically classify their task states using name and description heuristics into columns (Planning, Execution, Verification). This allows multi-agent visualization without changing the underlying JSON payload structures.

## Webview SOTA Improvements (v0.1.3)
- **Webview State Persistence**: We solved the state-loss problem where collapsing the sidebar or switching tabs destroyed the webview iframe. By serializing structural message histories, active tab selections, log status contents, and input area drafts to the native `vscode.getState()` on update, and restoring them during instantiation, the user experience becomes seamless without memory-bloated frameworks.
- **Stateful ANSI Escape sequence colorization**: Spawning CLI bash outputs (like test runs) streams escape sequences (`\u001b[32m`) which look corrupt in text blocks. Implementing a stateful regex ANSI parser translates colors and bold parameters cleanly to standard inline styled span tags referencing VS Code terminal theme color variables (e.g. `var(--vscode-terminal-ansiGreen)`).
- **Zero-Dependency Code Highlighting**: To support syntax formatting on assistant output code blocks, we implemented a custom O(N) regex tokenizer inside the webview JS, bypassing heavy prismjs or highlight.js dynamic loading and avoiding compile pipeline overhead.
- **Event-Delegated Clipboard Copying**: Hover copying is added to code containers. Using event delegation at the app level catches copy button clicks without leaking memory from individual element listeners.

## Stateful Layout-Shift Resilient Scrolling (v0.1.4)
- **Accidental Layout-Shift Race Condition**: Checking `isNearBottom` directly after modifying `innerHTML` races with browser layout reflow. Because rendering and layout calculations run asynchronously, the element's `scrollHeight` has not yet expanded to its final size at the moment of code execution, causing scroll adjustments to fail.
- **Stateful Resize/Mutation Observing**: We resolved this by decoupling DOM mutation from scroll calculation. We track whether the user is viewing the bottom via a global `wasNearBottom` boolean in the scroll listener. We attach a `MutationObserver` on the history container to automatically scroll to the bottom on layout size increases, but only if `wasNearBottom` was true. This handles streaming chunks and syntax-highlight layout shifts seamlessly while respecting user manual scroll-up.
- **Load Event Capture Listener**: Dynamically loaded elements (such as `<img>`) do not change DOM structure when they finish loading, meaning `MutationObserver` cannot detect their layout shift. We bind a capture-phase `load` event listener to `#chat-history` to catch image loading completions and trigger scroll anchoring safely.
- **Scrollbar Gutter Preservation**: Applying `scrollbar-gutter: stable;` to scroll containers preserves vertical scrollbar spacing even when content height is small. This prevents sudden horizontal layout shifts when the scrollbar appears/disappears, ensuring visual stability.

## TUI-Webview Parity and Process Interrupts (v0.1.5)
- **TUI prompt shortcut mapping**: Intercepting key down events in webviews can conflict with browser/IDE default actions. We resolved this by handling Tab, Ctrl+T, Ctrl+O, Alt+P, and Esc defensively, using `e.preventDefault()` where focus control or cancellation is required, and dispatching direct actions back to the host.
- **Hypothesizing spinner status line**: Long-running CLI tasks create UX anxiety. We introduced a client-side execution status line ticking elapsed duration and showing read token totals. Triggering a status loop timer inside `setExecutingState` updates this status line every 250ms, showing a rotating spinner frame.
- **Process cancellation via AbortSignal**: Ports Node's standard `AbortController`/`AbortSignal` from the extension host down to the spawned CLI wrapper, giving users the power to kill active queries instantly via `Esc` key interception.

## Rich Hickey Logging Decomplecting (v0.1.6)
- **Centralized LogOutputChannel**: Previously, scattered `vscode.window.createOutputChannel` calls (especially inside tool executions like `terminal.ts`) caused severe memory leaks and duplicate UI channels. We applied Rich Hickey's "Decomplecting" principle to separate business logic from UI lifecycle. We created a singleton `Logger` utilizing VS Code's native `LogOutputChannel` API (`{ log: true }`).
- **Eliminating console.error**: Raw `console.error` calls trap diagnostic data in the VS Code Developer Tools, hiding errors from users. By replacing these with `Logger.error()`, errors are safely routed to a visible, centralized Output panel.

## Browser and OS Automation (v0.1.7)
- **A11y Tree over Visual Vision Loops**: Using OS-level screen capture and keyboard/mouse coordinates (`computer-use-mcp`) complects GUI state, window layout, and coordinates, causing fragile agent behavior and high token usage. Exposing browser automation via Playwright (`@playwright/mcp`) is far simpler and cleaner: the accessibility tree snapshot (`browser_snapshot`) maps web pages as structured data instead of pixels.
- **Dynamic Capabilities Provisioning**: Rather than packaging heavy browser binaries in the extension bundle, we register `@playwright/mcp` and `@modelcontextprotocol/server-puppeteer` in `mcp.json`. The headless CLI agent resolves them using `npx -y` at runtime, keeping the extension light.
- **Adopting OS-Level Computer Use**: Under user override, we also added the `computer-use-mcp` config entry (running `npx -y computer-use-mcp` dynamically). This unlocks full GUI automation capabilities, though it incurs increased coordinate management complexity and security risks compared to pure sandboxed browser contexts.

## Rich Hickey Component Gap Analysis (v0.1.8)
- **Complected vs. Simple Permission Store**: Storing user permission preferences inside VS Code's `globalState` couples execution parameters to the IDE's runtime memory, preventing headless CLI/CI environments from sharing user authorization context. Migrating permissions to a filesystem JSON store (e.g. `~/.commandcode/permissions.json`) fully unentangles this boundary.
- **IPC Data Safety**: Implicitly casting raw incoming buffer chunks using `as IpcRequest` can cause runtime exceptions when receiving malformed JSON data. Utilizing strict TypeScript type guards and runtime narrowing ensures message data shapes are asserted before execution.
- **Reactive Validation Loops**: Decoupling configuration from process validation by subscribing to settings change events and instantly re-verifying CLI binaries/versions prevents stale error states and improves user lifecycle experience.

## Package Manager Gap Analysis (v0.1.9)
- **Decoupled Dependency Storage**: Physical place-oriented copying of dependencies inside local project `node_modules` folders complects disk usage with workspace layouts. Standardizing on `pnpm` decouples project trees from physical files by storing packages exactly once in a machine-wide content-addressable storage pool, mapping them into projects via symlinks while preserving native Node resolution algorithms.

## Accessible Webview Scrolling and Event Interception (v0.2.0)
- **Decoupled Navigational Key Interception**: Typing text and scrolling are distinct developer concerns. By intercepting keydown events (`PageUp`/`PageDown`/`Ctrl+Arrows`) inside the chat input textarea and programmatically adjusting the scroll position of the chat history, we unentangled keyboard scrolling from textarea focus.
- **Focus Dead-Zones Resolution**: Clicking neutral headers/footers/backgrounds focus the body element, which has `overflow: hidden`, breaking default keyboard scrolling. Implementing a global window keydown listener mapped to `getActiveScrollContainer()` forwards keyboard navigation keys to the active panel's scroll container.
- **Theme-Decoupled Visual Scrollbars**: Styling custom scrollbars with arbitrary colors breaks contrast in different VS Code theme settings. Moving custom scrollbar CSS rules to target VS Code's native variable tokens (`--vscode-scrollbarSlider-*`) restores perfect visual contrast dynamically.

## Webview Visual Parity and Keyboard Shortcuts (v0.3.0)
- **TUI styling projection**: Replicating CLI headers (ASCII logo and `# ` prefixes), prompt indicators (`❯`), and status loops (rotating spinner and duration timer) as pure CSS and DOM updates keeps the webview lightweight and framework-free.
- **External input editor proxy (`Ctrl+G`)**: Adding a shortcut that invokes a native VS Code Input Box allows multi-line text editing while avoiding focus lockups or textarea constraints inside the webview iframe.
- **Dynamic asynchronous metadata handshakes**: Fetching runtime context (like versions and active models) asynchronously after webview construction prevents extension startup blocks, updating the UI reactively once configuration values are resolved.
- **Local status spinner animation**: Simulating execution progression with a Braille spinner and an elapsed duration timer inside the webview via simple setInterval loops reduces CPU overhead and avoids flooding the UDS IPC with frequent progress packets.
- **Decoupled slash command routing**: Forwarding unknown slash commands directly to the CLI rather than validating them locally ensures the extension does not need updates when new commands are added to the CLI.
- **Headless visual validation capture**: Running standalone HTML webviews inside Playwright headless browsers allows automated rendering audits and side-by-side CLI parity checks during testing.

## Local CLI Auto-Update and Bootstrapping (v0.4.0)
- **Decoupled execution environments**: Storing local node CLI packages inside the extension's private `context.globalStorageUri` path unentangles execution from the user's global package manager configurations, system paths, and permission conflicts.
- **Zero-dependency registry updates**: Fetching package metadata from the public NPM registry (`https.get`) and spawning standard native `tar -xzf` commands to extract tarballs provides lightweight, dependency-free installation logic that is highly performant and secure.
- **Atomic swapping deployment**: Extracting downloaded packages into a separate temporary directory (`cli-new`), swapping folders synchronously, and recursively cleaning up the old folder ensures updates are transactional and prevents filesystem locks or data corruption if network operations fail.
- **Background update scheduling**: Querying the registry asynchronously during activation prevents UI startup blockages, showing a non-blocking toast prompt and delegating the download/swap process to the VS Code Progress API if a new compatible CLI version is resolved.
- **ES Module Node.js wrapping**: Spawning local CLI entrypoints (like ES modules ending with `.mjs` or `.js`) using `process.execPath` (embedded Node.js runner) allows consistent execution across Windows, macOS, and Linux without compiling binary files or altering global system path rules.

## Layout-Shift Resilient Scroll Anchoring and Key Routing (v0.5.0)
- **Content Resize vs User Scroll Decoupling**: Tracking content size changes is complected when layout shifts trigger browser scroll events. By monitoring both `scrollTop` and `scrollHeight`, scroll container updates that mutate height without changing the scroll offset are recognized as reflows rather than user scrolls, preserving the `wasNearBottom` auto-scroll state cleanly.
- **Nested Scroll Chain Containment**: Applying CSS `overscroll-behavior: contain;` on nested blocks (diffs, tool call logs, code blocks) isolates scrolling to the targeted element, preventing the parent chat panel from jumping when scrolling reaches boundaries.
- **Target-Aware Keyboard Navigation**: Global window-level keyboard event handlers scroll the primary chat viewport but can hijack key actions inside nested code preview windows. Traversal of the DOM event path to verify if the event originated inside an active nested scrollable allows standard browser keyboard scrolling to execute locally.

## Onboarding, Autonomous Diagnostics, and Local Registry Updates (v0.5.0)
- **Stateless Onboarding Cards**: Re-purposing the empty chat history state (`state.messages.length === 0`) to render a static, interactive onboarding card inside the webview eliminates the need for complex, heavy tour libraries and local tracking state.
- **Diagnostics Aggregation as Prompt Promoters**: Implementing the `/fix` command via the extension host rather than custom background parsing loops unentangles error fixing. The extension gathers VS Code compile errors and warnings, formats them into a structured prompt, and passes it to the agent's standard `runPrint` loop. The agent fixes the files natively using its standard filesystem tools.
- **Local Registry CLI Update Overrides**: Introducing the `"cmd-lite.localRegistryPath"` setting allows developer and offline updates. By checking if the local registry path exists, the extension reads version metadata from a local `package.json` and copies tarballs via native `fs.copyFileSync`, fully bypassing npmjs.org HTTPS requests.
- **Style Decomplecting for Webview Controls**: Storing large style declarations inline within TS/JS DOM elements complects presentation with structure, complicating changes and theme-based styling. Shifting style rules to `style.css` decoupling visual parameters enables rich CSS features like `:hover` scaling, active tap transitions, and focus rings to work seamlessly.
- **Accurate Webview Regression Assertions**: Simulating visual state behaviors of webviews during testing is simplified by verifying HTML templates, class mappings, action bindings, and CSS declarations directly from source files using regression test suites. This prevents compilation and layout regressions without loading heavy browser instances during unit testing.

## Session Reset and Resilient Scrolling (v0.5.2)
- **Direction-Aware Scroll Verification**: Viewport auto-scrolling is complected when absolute threshold checks trigger scroll pausing during async layout changes (like syntax highlighting or image loading). By verifying the scroll direction and only pausing auto-scroll when scroll position explicitly moves upward (`currentScrollTop < lastScrollTop`), reflow expansions are ignored, ensuring resilient scrolling.
- **Decomplecting Scrolling States**: Using global state variables to track auto-scroll properties complects multiple scrollable viewports. Shuffling state properties directly onto the DOM container objects (`(container as any).wasNearBottom`) isolates scrolling, enabling independent scroll behavior in both the chat panel and the streaming status logs console.
- **Background Terminal Garbage Collection**: Retaining old terminal windows when starting new interactive sessions leaks CLI process loops and UDS socket handles. Querying and disposing of existing terminals with matching names (`Command Code`) before spawning new instances ensures a clean session reset.

## CLI Executable Path Quoting & Automated Visual Verification (v0.5.3)
- **Space-Containing Executable Paths**: On systems where user directories contain space characters (such as macOS's `Application Support`), terminal executables split arguments on whitespace unless the path itself is quoted. Wrapping the resolved `cliPath` in double quotes (`"${cliPath}"`) before terminal execution prevents shell word splitting crashes (such as `zsh: no such file or directory` or `exit code 127`).
- **Automated Visual UI Verification**: Visual state checks like auto-scrolling and session resets are highly timing-sensitive. Leveraging a Clojure/Babashka script to execute `osascript` AppleScript GUI automation (focusing views, triggering command palette commands, typing queries, and capturing phase-based screen captures) enables reliable, repeatable end-to-end user experience verification.
- **Iframe Focus Handling for Webview Automation**: Standard OS-level keystroke scripts targeting webviews (like CMD Lite's custom Chat view) can fail to locate the target input area if multiple views of the same name (like native VS Code chat) are active, or if webview iframes capture focus ineffectively. Implementing a custom command `cmd-lite.focusChatInput` that calls the view's `.focus()` command and programmatically posts a `FocusInput` event to the webview textarea unentangles input targeting, guaranteeing reliable and repeatable keyboard-driven visual testing in webview panels.

## Transient LLM Terminations & Test Location Compliance (v0.5.4)
- **Transient LLM Connection Failures (Error: terminated)**: During autonomous agent execution, transient API drops or connection terminations on the model provider side (e.g. `commandcode.ai` rate limits or timeout terminations) manifest as `Error: terminated` in the client's stderr stream. These are network-level transient errors and can be safely retried directly in the workspace.
- **Strict Style Guidelines Adaptation vs. User Prompt Location**: Code generation agents in structured IDE workspaces automatically adapt to existing repository file structure patterns (such as putting tests in `src/__tests__/`) over custom prompt paths (like `src/tests/`). When enforcing strict compliance with custom user prompt locations, it is crucial to review generated file locations and manually relocate tests (`src/tests/util.test.ts`) while keeping configurations updated.

## Dynamic Polling, Multi-Display Screenshotting, and Defensive JSONL Parsing (v0.5.5)
- **Pre-flight Workspace Stashing Behavior**: CMD Lite's session start command automatically runs `git stash` to clean the workspace, reverting any uncommitted automation script modifications before they run. To persist updates to automation scripts during visual tests, they must be committed to HEAD prior to triggering the session start.
- **Multi-Monitor Screen Selection for screencapture**: By default, macOS `screencapture -x` captures only the primary monitor (at coordinate 0,0). When the target IDE window is on a secondary monitor (negative coordinates), this results in capturing background displays. Capturing all screens (supplying multiple filenames to the command) and dynamically verifying the presence of the secondary screen image allows swapping it to the primary destination.
- **Dynamic File Polling over Static Waits**: Hardcoded sleeps (e.g., `(Thread/sleep 45000)`) inside visual automation runs lead to timing brittleness and developer latency. Implementing a lightweight filesystem polling loop in Babashka that checks for the creation and non-zero size of expected output files enables immediately continuing execution on completion.
- **Defensive Type-Safe JSONLines Parsing**: When parsing JSON Lines defensively, validating both JSON syntax correctness and the parsed schema type (excluding arrays, primitives, and null) using strict TypeScript type narrowing (e.g., `typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)`) protects runtime executions from corrupted log streams or structured data feeds.

## Strict Type Safety Enforcement (v0.5.6)
- **Elimination of `any` in Mocks**: Mock class constructors (such as `RelativePattern` in `mcp-tools.test.ts`) that receive arguments from mocked external libraries should use `unknown` instead of `any` to prevent type pollution and pass strict lint checks, avoiding unnecessary import-coupling.
- **Domain-Specific Diagnostic Types**: Storing diagnostic data collections in generic arrays typed with `any` (such as `allDiagnostics` and `fileGroups` in `extension.ts`) complects types and disables compiler checks. Replacing these collections with the strict `DiagnosticEntry` domain interface from the application protocol ensures type-safety, correctness, and clean interfaces throughout.

## Flex-Layout Viewport Constraining (v0.5.7)
- **Bounded Viewport Scaling in Webviews**: Placing absolute or nested scrolling components (like `.chat-history` with `overflow-y: auto`) inside an unconstrained body sub-container (such as `#app` defaulting to automatic block layout height) causes parent boundaries to scale past the screen size (`100vh`). The body element clips the wrapper, causing bottom UI cut-offs (such as hidden footer status bars and clipped textareas) and disabling scrollbar triggers. Specifying a flex column layout on `#app` with `height: 100%`, `width: 100%`, and `overflow: hidden` constrains all nested containers directly to the parent viewport, restoring scrolling boundaries and visual alignment dynamically.

## Local Extension Packaging and Deployment (v0.5.8)
- **Extension Host Cache in Integration Audits**: In VS Code/Electron environments (like Antigravity IDE), changes made to the extension source code (`src/` files) will NOT be reflected in the running instance of the editor even if the files are compiled. To run visual tests with our latest updates (such as fixing dependency installation commands), we must rebuild the extension (`pnpm run build`), package it to VSIX (`pnpm run package`), install it locally via the IDE's CLI tool (`antigravity-ide --install-extension <file>`), and reload the window (`Developer: Reload Window`).
- **Unified Integration Orchestration**: Composing separate visual layout tests and code generation dogfooding runs into a single Babashka runner script (`run-all-dogfood.clj`) with fail-fast propagation guarantees that structural layout changes are visually verified before starting longer code generation task loops.
- **Registry-Driven Auto-Updates**: By validating that the local CLI package version matches the registry version (or copying overrides if configured) and automating the palette trigger (`Update Command Code CLI`), end-to-end auto-update capabilities can be fully validated under realistic dependency download conditions.

## Unicode-Aware Grapheme Truncation (v0.5.9)
- **Code-Unit vs Grapheme Decoupling**: Traditional Javascript string truncation using `.slice()` or `.substring()` operates on 16-bit code units, which splits surrogate pairs and Zero-Width Joiner (ZWJ) emojis, producing corrupted glyphs. Operating on grapheme clusters via `Intl.Segmenter` decouples the logical display count from physical UTF-16 code units.
- **CRLF & Multi-Line Boundary Safety**: Carriage Return + Line Feed (`\r\n`) visually represents a single newline but consists of two code points. `Intl.Segmenter` handles CRLF as a single grapheme cluster. This preserves line integrity and avoids splitting the CR and LF units when truncating near newlines.
- **Defensive Parameter Boundaries**: Enforcing negative limits validation (throwing on `maxLength < 0`) prevents out-of-bounds index slicing and maintains strict boundary execution rules.

## Cross-Platform Path Sanitization (v0.6.0)
- **Zero-Dependency Portability**: Implementing path normalization logic using pure string replacement and regular expressions instead of Node's native `path` module keeps utilities completely portable, enabling them to execute seamlessly in both Node.js and sandboxed browser/webview environments.
- **Root-Preservation Logic**: Trimming trailing slashes blindly can corrupt paths that represent directory roots (e.g. `/` or Windows drive paths like `C:/`). Using targeted checks (`sanitized === "/"` and `/^[a-zA-Z]:\/$/`) prior to trimming guarantees root boundary preservation.
- **Windows and POSIX Standardization**: Converting all backslashes (`\`) to forward slashes (`/`) standardizes path formats early, making duplicate separator collapsing (`/\/+/g`) straightforward and reliable.

## Unified Model Selector Workflow & Dynamic Environment Fallback (v0.6.1)
- **Hierarchical Model Resolution**: Establishing a resolution priority of `Session Picker State > Environment Variable Override > Workspace Configuration > CLI Defaults` ensures consistent model usage across headless runPrint, interactive terminal sessions, and the sidebar webview UI.
- **Dynamic UI Label Updates**: Webviews that display configuration metadata (like the `# models: ...` header label) can become stale if they only read from configuration files. Dispatching updated modelsLabel strings to the webview as part of the `modelChanged` event payload resolves this latency, rendering dynamic model name switches immediately.
- **Interactive Terminal Session Context Propagation**: Spawning interactive terminal sessions (`cmd-lite.start`) without forwarding the model parameter forces the terminal shell to fallback to native defaults. Passing the resolved model and permissionMode variables inside `StartSessionOptions` ensures terminal launches honor user preferences and environment overrides.

## Interactive JS CLI Invocation & ESLint Type Safety (v0.6.2)
- **Interactive JS/MJS CLI Invocation in Editor Terminals**: Spawning interactive terminal sessions (`cmd-lite.start`) or login shell sequences (`cmd-lite.login`) with a resolved `cliPath` pointing to a local ES Module/JavaScript file (`.mjs`/`.js`) fails to execute in standard shells. Prefixing the terminal command with `process.execPath` (the editor's active Node binary) ensures portable execution of local bootstrapped CLIs.
- **ESLint `any` Type Warning Mitigation**: Using dedicated narrowing types (like a `ScrollableElement` interface extending `HTMLElement`) and casting mock objects to intermediate types (like `unknown as vscode.WorkspaceConfiguration`) completely eliminates type pollution and achieves a zero-warning compiler status.

## VS Code Marketplace Publishing & CI/CD Pipeline (v0.6.3)
- **CI/CD Package Manager Alignment**: To conform to the "Never use npm" rule and prevent preinstall-hook failures in the CI pipeline, we refactored `.github/workflows/ci.yml` from `npm ci` to `pnpm install --frozen-lockfile`. We integrated `pnpm/action-setup` to download and cache dependencies.
- **Pre-flight Publishing Validation**: Rather than allowing direct local publishing without tests, we implemented a pre-flight validation runner script `scripts/publish.clj` using Babashka. It programmatically asserts git status, checks TypeScript compatibility (`pnpm run typecheck`), checks linter compliance (`pnpm run lint`), executes testing (`pnpm test`), and packages the extension.
- **Continuous Deployment Automation**: We set up `.github/workflows/release.yml` triggered on tags matching `v*`. The workflow automates publishing via `@vscode/vsce` CLI, fetching the Personal Access Token safely from `secrets.VSCE_PAT` configured in GitHub Secrets.

## Open VSX & Dual-Registry Publishing (v0.6.4)
- **VSIX Artifact Reusability**: Rather than running packaging scripts multiple times (which wastes computing overhead and risks environmental variance), we compile and package the extension *once* to a single versioned `.vsix` file. We then pass that exact file path to both `vsce publish -i <file>` and `ovsx publish -i <file>` to guarantee 100% parity across registries.
- **Dynamic Version Extraction in CI/CD**: To avoid hardcoding version strings or pulling tags via fragile shell parsing, we read the version directly from `package.json` inside GitHub Actions steps using `node -p "require('./package.json').version"`. This dynamically maps the release payload to the correct pre-packaged `.vsix` filename.
- **Tooling Version Locking**: Instead of using dynamic tools like `npx` or `pnpm dlx` that fetch latest versions at runtime, we added `ovsx` directly to `devDependencies` in `package.json`. This enforces deterministic execution of the registry publishing tool.
- **`pnpm/action-setup` Version Input Gotcha**: If your repository specifies the `"packageManager"` field in `package.json` (such as `"packageManager": "pnpm@11.7.0"`), providing a `version` configuration parameter in the `pnpm/action-setup` GitHub Action triggers a version mismatch error ("Multiple versions of pnpm specified..."). Omit the `version` configuration entirely in the actions configuration to let it automatically resolve the version from `package.json`.
- **Node.js Version Requirement for pnpm 11**: `pnpm` version 11 introduced dependencies on modern Node.js APIs (such as `node:sqlite`), which require at least Node.js version `22.13`. Running pnpm 11 in CI/CD environments configured with older Node versions (like Node 20.x) results in startup crashes (`ERR_UNKNOWN_BUILTIN_MODULE` for `node:sqlite`). All workflow Node runtimes must be aligned to `22.x` or higher to run.
- **Babashka Setup in CI/CD Runtimes**: Because our root project uses a `preinstall` hook script written in Babashka (`bb scripts/enforce-package-manager.clj`), running `pnpm install` in standard GitHub Actions runners fails with `bb: not found`. Installing Babashka via a fast, zero-dependency curl installation script (`curl -sLO https://raw.githubusercontent.com/babashka/babashka/master/install && chmod +x install && sudo ./install`) prior to running package installation solves this dependency.
- **CI/CD Test Build Dependency Order**: If unit tests assert CSS layout rules or asset mappings by opening or checking compiled assets (like `dist/webview/style.css` in `webview-regression.test.ts`), running tests on clean CI runners prior to compilation will fail with file not found errors (`ENOENT`). Always run `pnpm run build` to compile compiled assets prior to running the test suite on clean virtual environments.

