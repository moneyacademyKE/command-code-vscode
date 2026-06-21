# Design Patterns — Command Code VS Code Extension

## Extension-CLI Wrapper Pattern
- Rather than forking VS Code or embedding heavy local model inference runtimes, the extension functions as a lightweight wrapper over the `cmd` command-line tool.
- Inter-Process Communication (IPC) is handled by spawning the CLI binary via `child_process.spawn`.
- Keeps codebase small, fast, and robust to updates in the core CLI.

## Taste File Watching Pattern
- The meta neuro-symbolic learning data is updated constantly by the CLI at `.commandcode/taste/`.
- The extension employs a `FileSystemWatcher` on `**/.commandcode/taste/**` to trigger live reload in the Taste TreeView without user intervention.

## Command Routing Pattern
- Menu context items and custom commands in VS Code route directly to CLI execution via specialized tasks, maintaining a single source of truth for execution logic.

## External Process Environment Isolation Pattern
- When wrapping global command-line utilities, resolve binary paths dynamically using standard shell lookups (`which` / `$PATH`), but log warnings or errors if multiple package manager prefixes (e.g. yarn global vs npm global) register the binary on different paths with mismatching versions.

## Bi-directional IPC Context Decoupling Pattern
- Decouples workspace data gathering from core agent logic.
- Instead of the agent querying the editor via high-overhead extension commands, the extension exposes a lightweight UDS context server. The CLI connects to this socket to retrieve filesystem, diagnostics, and VCS state, minimizing IPC overhead.

## Composed Agent Tools Pattern
- Registers core agent execution functions as native VS Code Language Model Tools (`languageModelTools`).
- Allows parent agents/participants (e.g., Copilot Chat) to discover and compose the Command Code agent (`cmd`) as a sub-agent without needing direct implementation coupling.

## CI Lockfile Platform Alignment Pattern
- When utilizing build tools or bundlers (e.g. `esbuild`) that require platform-specific native binaries (e.g., `@esbuild/linux-x64` for Linux runners, and `@esbuild/darwin-arm64` for macOS local development), align the top-level package version of the tool in `devDependencies` with transitive dependencies brought in by test runners or bundlers (e.g., `vitest` / `vite`).
- This alignment ensures that `npm install` records the matching versions and files for all possible platforms in `package-lock.json`, preventing `npm ci` failures due to missing platform-specific packages on CI runners.

## Thin Glass UI Pattern
- When adding complex frontend UIs (like Kilo Code-style chat panels) to a CLI wrapper extension, avoid state entanglement.
- The Webview acts merely as a "dumb renderer" (Thin Glass) that listens to JSON-RPC UI payloads from the central CLI source of truth.
- The UI handles no local state mutation, strictly passing user interactions back as events to the context server.
- This adheres to Rich Hickey's "Simple Made Easy" philosophy, reducing UI bugs and eliminating state desynchronization.

## 1:1 Session Affinity (UI Lock) Pattern
- When using UDS (Unix Domain Sockets) or shared IPC mechanisms to connect an Editor UI to external CLI agents, avoid blindly broadcasting UI events to all connected process sockets.
- Implement an explicit "Lock Stealing" handshake where a new interactive CLI session claims ownership of the UI context via a `CLAIM_UI_LOCK` payload.
- This ensures only one process identity communicates with the UI at a time, protecting background/parallel agents from accidentally receiving UI interactions and breaking multi-agent parallelism safely.

### Targeted DOM Mutations for "Thin Glass" Webviews
- **Context**: When rendering webviews inside VS Code using Vanilla JS, updating the entire DOM via `innerHTML` on every state tick destroys user inputs (like textareas).
- **Solution**: Decouple the structural identity of the UI from temporal state updates. Use targeted `document.getElementById` to modify specific elements (`updateTokens`, `appendMessage`). Never replace the entire DOM tree if it contains user-editable inputs.

### Implicit Lock Inference
- **Context**: Enforcing strict IPC handshakes (e.g., `CLAIM_UI_LOCK`) can break older client binaries that don't know the new protocol.
- **Solution**: If a client actively dispatches a highly specific event (like `DISPATCH_WEBVIEW_EVENT`), logically it *must* be the interactive session. Implicitly grant the lock to that client to ensure backwards compatibility while maintaining strict 1:1 affinity.

### Defensive Architecture: Framework Rejection Pattern
- **Context**: When building stateless, targeted Webview UIs (like "Thin Glass" patterns), developers often propose migrating to complex frontend frameworks (e.g., SolidJS, React) or Web Worker proxies (e.g., Partytown) preemptively.
- **Solution**: Subject all adoptions to a Rich Hickey Gap Analysis. If the architecture adds massive incidental complexity (e.g., JSX compilation, CSP proxying) to solve problems that don't exist in the current domain (e.g., 3rd-party script blocking, vast local UI state), decisively reject the adoption. Protect the zero-dependency baseline.

### Switch Case Block Scoping Pattern
- **Context**: When building Redux-style reducers or handling JSON-RPC dispatch events in `switch` statements, developers often need to declare variables (`const`, `let`) local to a specific `case`.
- **Solution**: Always wrap `case` clauses containing lexical declarations in block scopes `{}`. This satisfies `no-case-declarations` lint rules, prevents variable hoisting bugs across cases, and keeps the code clean without disabling linting.
## Standardized Editor Protocol Pattern (MCP)
- **Context**: Extension wrappers often need to expose IDE capabilities (Terminal execution, Window prompts, File Search) to the CLI agent. Building custom JSON-RPC events for every IDE capability quickly complects the Context IPC server.
- **Solution**: Run a native Model Context Protocol (MCP) Server inside the extension. Standardizing the interface means the `cmd` CLI can discover and execute IDE tools dynamically without requiring custom, tightly-coupled event handlers on both ends. *(Reference: [MCP Roadmap](file:///Users/moe/Desktop/cmd/docs/mcp-roadmap.md))*

### Decomplecting Stream Observation Pattern
- **Context**: Tailing a continuous stdout stream into a chat interface creates massive UI churn and pollutes semantic messaging history.
- **Solution**: Treat structural UI events (`RenderMessage`) and continuous streaming data (`StdoutChunk`) as completely separate pipelines. Route continuous streams to dedicated log buffers (like a `<pre>` status pane), ensuring observability without tangling with primary business state logic.

### Universal Scripting Pattern
- **Context**: Using heterogeneous languages (Python, Bash, JS) for simple build tasks creates environment entropy and runtime dependency hell.
- **Solution**: Adopt Babashka (`bb.edn`) for all repository scripting. This enforces a fast, unified, and dependency-free Clojure runtime that embraces "Simple Made Easy."

### Composable Registries Pattern (Agent Autonomy)
- **Context**: Writing custom wrapper scripts (even in Babashka) inside an IDE extension to grant the CLI OS-level capabilities tightly couples the execution environment to the IDE repository.
- **Solution**: Pivot entirely to composing external registries. Generate dynamic configuration files (`mcp.json`) that command the headless CLI to provision **Official Reference MCP Servers** via `npx -y` at runtime. This removes maintenance burden from the extension layer and ensures the agent always operates on standard, open-source capability sets.

### State Decomplecting Pattern (UI vs Execution)
- **Context**: Storing agent session preferences (like model selection, permission mode) inside the IDE's built-in global state API traps that data within the IDE process, blocking headless CLI tasks from resuming the exact same session context.
- **Solution**: Move shared execution state out of the IDE's proprietary data stores and into a persistent, simple format (e.g., a `.json` file in the user's home directory). The IDE should read from and write to this file exactly as the CLI does, ensuring total decoupling and "Simple Made Easy" architecture.

### Event-Driven Wakeups Pattern (MCP Triggers)
- **Context**: When delegating work to autonomous background agents, forcing the IDE or the main CLI process to synchronously wait or poll for completion leads to high resource utilization and poor user experience.
- **Solution**: Leverage MCP Notifications or custom IPC events (like `NOTIFY_BACKGROUND_TASK`) to asynchronously dispatch completion payloads. The UI listens for these specific notification events and renders updates dynamically, allowing background tasks to sleep/wake efficiently.

### Base64 DataURI Context Bridge Pattern
- **Context**: Sandboxed IDE Webviews cannot reliably access OS absolute file paths, preventing users from dragging-and-dropping context (like images or logs) directly to an external CLI process.
- **Solution**: Intercept the HTML5 `drop` event within the Webview, convert the file to a Base64 DataURI using `FileReader`, and pass the serialized payload over JSON-RPC to the extension host. The extension can then securely cache the file in the workspace or forward the URI to the CLI's MCP File System tool.

### Socket Authentication Pattern
- **Context**: Relying on Unix file permissions (`0o600`) alone does not fully protect shared or containerized environments from unauthorized local processes accessing IDE context.
- **Solution**: Enforce an `AUTH_HANDSHAKE` as the first message on any incoming UDS connection. Generate a secure UUID token in the extension, store it in a secured `0o700` session file, and require the connecting CLI agent to read and pass this token before processing any requests.

### External CLI Version Guard Pattern
- **Context**: When wrapping a globally installed CLI, extension updates might introduce new JSON-RPC actions that older CLI binaries do not understand, causing silent protocol failures.
- **Solution**: On extension activation, synchronously call the CLI with `--version` and assert against a `MINIMUM_CLI_VERSION` constant. Block initialization and prompt the user to update their CLI rather than allowing corrupt or silent execution errors.

### Strict Type Verification Pattern
- **Context**: Bypassing the type system in tests using `as any` allows silent regressions when payload shapes change, destroying the value of a static type checker.
- **Solution**: Avoid `any`. Treat unverified inputs as `unknown` and perform explicit type narrowing or structural typing (e.g., `Record<string, unknown>`). This adheres to data-driven correctness, ensuring assumptions about shape are explicitly documented.

### Rich Hickey Quality Checklist Pattern
- **Context**: Features are often added using the "easiest" tool available (Node.js scripts for TS projects, `any` for fast test writing), which leads to long-term accidental complexity.
- **Solution**: Before merging, evaluate code against the Rich Hickey Checklist:
  1. **Simplicity over Easiness**: Does the tool decomplect domains? (e.g. `bb` separates scripts from TS compilation configs).
  2. **Immutability over Mutation**: Is state explicitly managed and minimal? Eliminate dead code and dead state immediately.
  3. **Data Verification**: Is the data shape guaranteed or casually assumed? (Reject `any`).

---

## Decoupled Webview Input Router Pattern
- **Context**: Intercepting `/` commands, `!` bash commands, and `@` file mentions usually complects text input parsing with execution dispatch logic.
- **Solution**: Decouple parsing from execution at the webview input boundary. A lightweight input analyzer isolates local visual feedback (popovers/comboboxes) and dynamically routes prompt sub-types (`isBash`, `plan`) to different IPC commands, rather than compiling them together inside a single generic chat packet.

---

## Visual Kanban Task Board Mapping Pattern
- **Context**: Parallel multi-agent setups emit linear lists of status items, but presenting these raw items to the user obscures the overall workflow.
- **Solution**: Group linear agents dynamically based on lexical heuristics in name/task descriptions to map them to functional pipeline columns (Planning, Execution, Verification). This allows visual progress boards without introducing new state layers on the host backend.

---

## Direct Webview Bash Terminal Pattern
- **Context**: A user wishes to run standard terminal scripts (`npm test`) directly from the webview, but routing it through the LLM pipeline creates massive latency and security vulnerabilities.
- **Solution**: Route `!` prefixes to direct process spawning on the extension host, letting child processes execute natively in the active workspace and streaming stdout/stderr back in real-time. This provides shell parity securely.

---

## Webview State Persistence (DOM Lifecycle Recovery) Pattern
- **Context**: Webview panels are frequently destroyed and recreated by the IDE lifecycle (tab switching, panel collapsing), wiping temporal state (message history, text drafts, active panel, logs).
- **Solution**: Decouple state persistence from DOM lifecycle. Cache the state object as a pure JSON data structure using VS Code's native `getState`/`setState` API, and restore/rehydrate the UI elements and scroll positions during initialization.

---

## Stateful ANSI Escape sequence colorization Pattern
- **Context**: Continuous logs from bash runs (e.g. `StdoutChunk`) stream color sequences (`\u001b[32m`), which render as unreadable characters in normal pre tags.
- **Solution**: Maintain a stateful ANSI SGR parser that converts ANSI escape patterns into HTML spans using standard VS Code terminal color theme variables (e.g. `var(--vscode-terminal-ansiRed)`).

---

## Zero-Dependency Regex Tokenization Pattern (Syntax Highlighting)
- **Context**: Text code blocks inside assistant markdown outputs require syntax highlighting for readability, but importing heavy client-side libraries (like standard PrismJS packages) complects bundlers and slows load times.
- **Solution**: Implement a lightweight, O(N) regex tokenization function that parses code inputs into standard token scopes (comments, keywords, strings, numbers) and styles them using VS Code theme tokens.

---

## Copy-to-Clipboard Button Delegation Pattern
- **Context**: Adding click handlers to every code block in chat logs creates high DOM listener count and memory leaks.
- **Solution**: Use event delegation on a single top-level container to catch clicks on copy buttons, using `encodeURIComponent`/`decodeURIComponent` to safely bridge raw code data in attributes.

---

### Visual TUI Prompts & Keyboard Shortcut Delegation
- **Problem**: Porting CLI keybindings (Shift+Tab, Ctrl+T, Ctrl+O, Alt+P, Esc) to webview inputs requires maintaining custom state wrappers and conflicts with browser focus trees.
- **Solution**: Intercept specific key chords directly in the text area's keydown listener. Map visual states (like TASTE checkbox) to simple CSS active selectors, and dispatch direct action payloads (like `set-permission-mode`) to let the extension host maintain authoritative configurations.


---

## Decoupled Scroll Anchoring Pattern (Stateful Resize/Mutation Observing)
- **Context**: In dynamic webviews (e.g., chat interfaces, live-streaming terminals), content is dynamically formatted (markdown parsed, syntax highlighted, dynamic images loaded), causing async layout shifts and height changes that run after standard DOM mutation handlers finish execution. Checking scroll heights immediately after innerHTML mutations fails due to async layout reflow timing.
- **Solution**: Decouple scroll adjustments from rendering updates. Maintain a single boolean state flag (`wasNearBottom`) that updates on user scroll events. Establish a `MutationObserver` on the dynamic container to intercept DOM changes, checking `wasNearBottom` to automatically adjust the `scrollTop` to the bottom post-reflow.
- **Capture-Phase Load Event Monitoring**: Register a capturing `load` event listener on parent containers to catch async resource resolutions (such as image resource loading) that modify element bounds without changing DOM structures, executing scroll adjustments on load completion.
- **Layout Shift Prevention (Stable Scroll Gutter)**: Reserve space for vertical scrollbars natively by specifying `scrollbar-gutter: stable;` on scrollable wrappers, preventing horizontal shifts on scrollbar initialization.

## Pure Data Logging Stream Pattern (Decomplecting UI)
- **Context**: Instantiating UI elements (like VS Code `OutputChannel`) directly inside business logic or tool executors (e.g. MCP terminal executions) complects domain logic with the editor's UI lifecycle, causing memory leaks and fragmented output panes. Furthermore, relying on `console.error` hides critical state failures from users.
- **Solution**: Decomplect the logging mechanism. Establish a single, lazily-initialized singleton `Logger` utilizing modern structured logging (`vscode.LogOutputChannel`). Pass this logger down or import it globally, treating logging as a pure data stream. This ensures business logic remains ignorant of UI rendering while maintaining robust, user-visible diagnostics across the entire extension.

---

## Sandboxed Browser Verification Pattern
- **Context**: To verify web applications, run E2E tests, or browse documentation, agents need browser control. Packaging heavy Chromium/Playwright binaries inside the IDE extension couples the runtime context to the editor, violating decomplecting. Moreover, simulating coordinates on a physical GUI screen (`computer-use-mcp`) complects OS windows, resolutions, and system permissions with tool execution.
- **Solution**: Dynamically provision browser automation via `@playwright/mcp` defined in `mcp.json` running over standard stdio using `npx -y`. Instruct the agent to prefer Playwright's locator queries and accessibility trees (`browser_snapshot`) over pixel coordinates or screenshot-only verification. This isolates web interaction inside a headless sandboxed browser process, preserving host OS simplicity.

---

## Decoupled Filesystem Permission Store Pattern
- **Context**: Storing interactive user permissions (like `allow-always` for directories/files) in the IDE's local configuration storage (e.g. `globalState`) makes the data inaccessible to headless runs or CLI subprocesses running outside the editor workspace context. This complects execution authorization with the editor application's memory workspace.
- **Solution**: Decouple authorization settings by writing permission preferences to a shared filesystem location (e.g., `~/.commandcode/permissions.json`) in a serialized format. Both the CLI agent and the IDE extension access this file, allowing headless CI runs to run with the exact same permission boundaries approved in the editor.

---

## Strict Runtime Data Guard Pattern
- **Context**: Relying on TypeScript type assertions (`as IpcRequest`, `as any`) at socket or process boundary layers creates a false sense of security. If a client transmits malformed JSON-RPC message payloads, it will lead to runtime crashes or unhandled exceptions in the handler functions.
- **Solution**: Avoid type casting at communication boundaries. Narrow down incoming `unknown` objects using strict schema or runtime type guard assertions (e.g., `isIpcRequest(obj)`) that check the presence and types of all required fields before delegating the payload to the handler functions.

---

## Decoupled Dependency Storage Pattern (pnpm)
- **Context**: Storing project dependencies physically inside every local project folder (`node_modules`) duplication (npm/bun) or using complex runtime zip loaders (Yarn PnP) complects workspace structure with file storage location. This wastes disk space and makes builds unpredictable.
- **Solution**: Standardize on `pnpm` to decouple dependency storage from project layouts. Store dependencies in a shared content-addressable global pool and link them into project workspaces using read-only symlinks, preserving native Node resolution compatibility.

---

## Decoupled Keyboard Scroll Forwarding Pattern
- **Context**: In rich webviews containing text inputs (like chat textareas), typing and scrolling are distinct user concerns. Allowing the input element to consume all scroll keys traps focus and requires mouse interaction to scroll. Furthermore, clicking neutral areas focuses the `body` element which is styled with `overflow: hidden`, breaking standard browser keyboard scrolling.
- **Solution**: Intercept navigation keys (`PageUp`, `PageDown`, `Ctrl+Arrows`) inside the input element keydown listener and programmatically scroll the target container. Add a global window keydown listener mapped to `getActiveScrollContainer()` to forward key scrolling events to the active container when focus is on non-input elements (e.g. `BODY`). Ensure visual scrollbars reference native VS Code CSS variable tokens to automatically adapt color contrast.

---

## Atomic Local CLI Swapping Pattern
- **Context**: Unpacking CLI updates directly into the active executable folder complects files in active use with network/download operations, resulting in file locks, write collisions, or corrupted runtimes if download operations fail mid-flight.
- **Solution**: Decouple the deployment from active execution. Download and extract the package to a separate directory (`cli-new`), verify that all core entrypoint files (e.g. `dist/index.mjs`) are present, swap the folder names synchronously to complete the transaction, and clean up the old directory (`cli-old`) in the background.

---

## Node ES-Module Executable Wrapping Pattern
- **Context**: Executing local Node.js binaries across diverse operating systems (Windows, macOS, Linux) traditionally requires packaging compiled platform binaries or writing fragile shell execution wrappers, which introduces accidental build complexity.
- **Solution**: Wrap execution around the active extension host environment. If the resolved path points to a javascript script (e.g., ending with `.mjs` or `.js`), intercept the spawn routine, use `process.execPath` (the embedded Node binary) as the executable, and prepend the script path to the CLI command arguments. This guarantees cross-platform execution parity without shell dependency.

---

## Layout-Shift Resilient Scroll Anchoring Pattern
- **Context**: In dynamic webviews, content size changes (markdown rendering, image loading) trigger scroll events where the layout grows but `scrollTop` does not catch up immediately, complecting height reflows with manual user scroll up. This results in the auto-scroll state `wasNearBottom` being set to false falsely.
- **Solution**: Decouple layout reflow scroll events from user scroll events. By checking if `container.scrollHeight` has changed while `container.scrollTop` remained equal to its previous value, we recognize height reflows and skip updates to the auto-scroll state variable.

---

## Target-Aware Keyboard Navigation Pattern
- **Context**: Forwarding all keyboard scroll commands (`PageUp`, `PageDown`, `ArrowUp`, `ArrowDown`) globally to the active panel's main scroll viewport prevents keyboard interactions inside focused or hovered nested scrollable components (like code blocks or diff contents).
- **Solution**: Traverse the DOM hierarchy from the event target (`e.target`) up to the active container. If any nested element is scrollable (has vertical/horizontal overflow) and is not the main active scroll container, do not intercept or prevent default, allowing local native browser scrolling.

---

## Nested Scroll Isolation Pattern
- **Context**: Navigating or scrolling nested elements causes the gesture or scroll boundary to propagate to the parent page, causing the main chat panel layout to shift or jump when boundaries are hit.
- **Solution**: Style nested scrollable components (diff wrappers, tool execution outputs, logs) with CSS `overscroll-behavior: contain;`. This isolates the scroll boundaries strictly to the target viewport.

---

## Stateless Onboarding Empty State Pattern
- **Context**: Welcome tours and wizard overlays inside sidebar panels require importing complex UI libraries, creating vast local states, and blocking user workspace windows.
- **Solution**: Re-purpose the empty state of the chat history panel (`messages.length === 0`) to render a stateless HTML onboarding view showing ASCII logos, quick action commands, and keyboard shortcut maps. Clicking quick action items populates the chat input container, and the onboarding view is automatically removed when the first message is appended to the view.

---

## Host-Aggregated Diagnostic Fixing Pattern
- **Context**: Intercepting and fixing compile errors requires complex background monitoring filesystems or compilers, which couples agent logic to the IDE host environment.
- **Solution**: Intercept `/fix` commands inside the extension host. Gather errors and warnings via VS Code's diagnostic APIs, format them into a unified diagnostic prompt showing exact lines and error messages, and feed it into the agent's standard headless execution loop. This isolates compiler details to the host while keeping agent code clean.

---

## Local Registry Update Override Pattern
- **Context**: Forcing local updates to fetch from registry.npmjs.org limits developers from testing CLI changes locally and prevents offline extension upgrades.
- **Solution**: Check if a local registry filesystem path setting is active. If set, read metadata versioning from `package.json` in that directory and copy package `.tgz` files using native filesystem APIs, fully bypassing HTTPS calls.

---

## Style Decomplecting for Webview Elements Pattern
- **Context**: Mixing inline CSS styling in dynamic webview JavaScript/TypeScript templates complects layout layout/structure with presentation rules. This complicates matching host editor theme variables, adjusting layout offsets, and defining interactive visual feedback like scaling or glow shadows.
- **Solution**: Decomplect presentation from structure by removing inline styles and organizing all components into styled classes in a standalone CSS sheet (`style.css`). This enables full utilization of standard CSS features like `:hover` scaling, active tap transitions, and focus visible outlines mapped to native VS Code variable tokens (such as `--vscode-focusBorder`).

---

## Direction-Aware Scroll Anchoring Pattern
- **Context**: Auto-scrolling in streaming webviews is complected when absolute distance checks are used to toggle scroll pausing. When asynchronous layout reflows (like syntax highlighting or image loading) occur, the scroll viewport height changes. If checked immediately, the scroll position is far from the bottom, causing the system to mistakenly assume the user scrolled up, which permanently disables auto-scroll.
- **Solution**: Decomplect user scrolling from content reflowing by analyzing scroll direction. Only pause auto-scrolling if the scroll position explicitly moves upward (`currentScrollTop < lastScrollTop`). If the user scrolls down near the bottom (`isNearBottom`), auto-scrolling is re-enabled. If the scroll position is unchanged, it is treated as a content reflow, preserving the current auto-scroll state.

---

## Decomplected Scrolling State Pattern
- **Context**: Tracking auto-scroll properties via shared global variables complects different scroll viewports (like chat history vs. streaming terminal logs), causing scroll events in one view to corrupt the auto-scroll settings of other viewports.
- **Solution**: Store state properties directly on the HTMLElement DOM objects (e.g. `(container as any).wasNearBottom`). This fully unentangles the viewport state, allowing the chat panel and the streaming logs console to scroll independently without interference.

---

## Process Disposal Session Reset Pattern
- **Context**: Resetting active interactive sessions in IDE extensions without terminating the old terminal shells leaks background processes, CLI event loops, and locks local UDS socket handles.
- **Solution**: Prior to launching a new interactive terminal, query the workspace terminals list, filter by name, and call `.dispose()` on matching terminals to terminate background shells. Simultaneously, dispatch clean state reset events to the webview to reset local data layers cleanly.

---

## Double-Quoted Executable Launching Pattern
- **Context**: When launching commands or sub-processes in a system terminal shell (such as Zsh, Bash, or Command Prompt), paths with spaces are split into multiple arguments, resulting in shell crashes (e.g. `zsh: no such file or directory` or command not found) and execution failures.
- **Solution**: Wrap the resolved executable path in double quotes (`"${cliPath}"`) before constructing the command string to send to the terminal interface. This ensures the command shell treats the path as a single executable token.

---

## Automated AppleScript Visual Testing Pattern
- **Context**: Visual and keyboard-interactive features in IDE extensions (like auto-scrolling and session refresh) are difficult to test with conventional headless unit/integration test suites.
- **Solution**: Create a Babashka script that activates the target IDE via AppleScript (`tell application ... to activate`), simulates keypresses to focus views and trigger commands, types text prompts, waits for rendering/streaming, simulates scrolling keys, and takes phase-based screenshots using `screencapture` to verify states visually.





