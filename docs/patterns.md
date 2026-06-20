# Pattern: Parallel Agents with Immutable Taste

## Problem
In agentic coding workflows, running sequential agents (e.g., one agent to implement, followed by one to test, followed by one to document) is slow. However, running parallel agents traditionally leads to race conditions, conflicting file modifications, and divergent state.

## Context (Rich Hickey Lens)
- **State vs. Identity vs. Value:** The preferences ("taste") and the initial user request are *Values* (immutable). The workspace files represent the *State* (mutable). The project itself is the *Identity*.
- **Complecting:** If multiple agents directly mutate the workspace concurrently, they complect their execution with the shared state.

## Solution
Decomplect agent execution from workspace mutation by introducing an event-sourced or merge-queue boundary.

1. **Immutable Context:** All parallel agents (`Agent-Impl`, `Agent-Test`, `Agent-Doc`) are launched with a snapshot of the current workspace and a read-only reference to the global `taste.md` (preferences).
2. **Isolated Execution:** Agents run as separate, isolated processes. They do not write directly to the primary workspace files while executing.
3. **Merge Queue:** Instead of mutating state, each agent produces a "Proposal" (a patch or a complete file update).
4. **Resolution:** A single coordinator process (or user review step) applies these proposals sequentially or merges them.

## Implementation Guidelines (Babashka/CLI)
When implementing this in `cmd` or similar CLI tools:
- Spawning an agent should be a simple OS process invocation.
- Use standard streams (stdin/stdout) or isolated temp directories for agent output.
- The coordinator should handle the `Red/Green TDD` cycle: if a proposal fails the test suite when merged, the failure is fed back to the specific agent as a new immutable event, rather than letting the agent thrash the live codebase.

## Related Learnings
See `docs/learnings.md` for the Kilo Code gap analysis that inspired the adoption of this pattern over deep editor integration.

---

# Pattern: The "Thin Glass" Webview

## Problem
When building VS Code extensions, it is tempting to use heavy frontend frameworks (React, SolidJS) and performance optimizations (Partytown) for Webview UIs. This introduces incidental complexity, build pipelines, and forces the developer to synchronize state between the Extension Host CLI and the isolated Webview iframe.

## Context (Rich Hickey Lens)
- **Complecting State:** Moving state (Signals, `useState`) into the Webview complects the UI rendering with application state.
- **Accidental Complexity:** Bringing in JSX, Vite, and Web Workers for a simple chat interface solves problems that don't exist in this context.

## Solution
Keep the Webview completely stateless and free of incidental complexity by rejecting heavy frontend frameworks unless absolutely required by the complexity of the UI.

1. **Vanilla JS Only:** Use zero-dependency Vanilla JS (`document.getElementById`) for DOM manipulation.
2. **JSON-RPC Events:** The Webview should purely render JSON-RPC payloads received from the CLI and dispatch raw events back.
3. **No Local State:** The Webview should hold no complex state. Any interaction should immediately send a message back to the CLI, and the CLI should respond with a new UI rendering event.
4. **Optimistic Updates:** Only perform targeted DOM mutations (like appending a chat message) if it provides immediate tactile feedback, but do not store the result as authoritative state.

---

# Pattern: Implicit Lock Inference

## Problem
When a frontend connects to a multi-client IPC server, enforcing a strict protocol where clients must explicitly request a "UI Lock" before sending events can lead to deadlocks. Legacy clients or scripts might fail to send the lock request, breaking their ability to interact with the UI.

## Context (Rich Hickey Lens)
- **Complecting:** Requiring an explicit handshake complects the *intent* to control the UI with the *permission* to control the UI.
- **Simplicity:** A client that actively dispatches a UI event is implicitly demonstrating its intent to control the UI.

## Solution
Use **Implicit Lock Inference**. If a client sends an event (e.g. `DISPATCH_WEBVIEW_EVENT`), the server should implicitly grant it the UI lock if the lock is currently unowned or owned by a disconnected client. This prevents deadlocks and seamlessly supports backward compatibility without requiring strict authentication or handshakes.

---

# Pattern: CSS-Driven Stateless Webview Panels

## Problem
Adding multiple views (Chat, Sessions, Status) to a Webview often tempts developers into using Javascript routers or state management to track the "active tab" and re-render the DOM, complecting UI structure with application state.

## Solution
Keep the Webview completely stateless by using a CSS-driven panel system.
1. Structure each view as a separate DOM container (`<div class="panel" id="chat-panel">`).
2. Use CSS to hide all panels by default (`display: none;`).
3. Define an active class (`.panel-active { display: flex; }`).
4. Switch views by simply toggling the `panel-active` class via Vanilla JS. The DOM itself acts as the single source of truth for visibility, removing the need for local state variables.

---

### Decoupled Webview Input Router
- **Problem**: Intercepting `/` commands, `!` bash commands, and `@` file mentions usually complects text input parsing with execution dispatch logic.
- **Solution**: Decouple parsing from execution at the webview input boundary. A lightweight input analyzer isolates local visual feedback (popovers/comboboxes) and dynamically routes prompt sub-types (`isBash`, `plan`) to different IPC commands, rather than compiling them together inside a single generic chat packet.

---

### Visual Kanban Task Board Mapping
- **Problem**: Parallel multi-agent setups emit linear lists of status items, but presenting these raw items to the user obscures the overall workflow.
- **Solution**: Group linear agents dynamically based on lexical heuristics in name/task descriptions to map them to functional pipeline columns (Planning, Execution, Verification). This allows visual progress boards without introducing new state layers on the host backend.

---

### Direct Webview Bash Terminal
- **Problem**: A user wishes to run standard terminal scripts (`npm test`) directly from the webview, but routing it through the LLM pipeline creates massive latency and security vulnerabilities.
- **Solution**: Route `!` prefixes to direct process spawning on the extension host, letting child processes execute natively in the active workspace and streaming stdout/stderr back in real-time. This provides shell parity securely.

---

### Webview State Persistence (DOM Lifecycle Recovery)
- **Problem**: Webview panels are frequently destroyed and recreated by the IDE lifecycle (tab switching, panel collapsing), wiping temporal state (message history, text drafts, active panel, logs).
- **Solution**: Decouple state persistence from DOM lifecycle. Cache the state object as a pure JSON data structure using VS Code's native `getState`/`setState` API, and restore/rehydrate the UI elements and scroll positions during initialization.

---

### Stateful ANSI Escape sequence colorization
- **Problem**: Continuous logs from bash runs (e.g. `StdoutChunk`) stream color sequences (`\u001b[32m`), which render as unreadable characters in normal pre tags.
- **Solution**: Maintain a stateful ANSI SGR parser that converts ANSI escape patterns into HTML spans using standard VS Code terminal color theme variables (e.g. `var(--vscode-terminal-ansiRed)`).

---

### Zero-Dependency Regex Tokenization (Syntax Highlighting)
- **Problem**: Text code blocks inside assistant markdown outputs require syntax highlighting for readability, but importing heavy client-side libraries (like standard PrismJS packages) complects bundlers and slows load times.
- **Solution**: Implement a lightweight, O(N) regex tokenization function that parses code inputs into standard token scopes (comments, keywords, strings, numbers) and styles them using VS Code theme tokens.

---

### Copy-to-Clipboard Button Delegation
- **Problem**: Adding click handlers to every code block in chat logs creates high DOM listener count and memory leaks.
- **Solution**: Use event delegation on a single top-level container to catch clicks on copy buttons, using `encodeURIComponent`/`decodeURIComponent` to safely bridge raw code data in attributes.

---

### Visual TUI Prompts & Keyboard Shortcut Delegation
- **Problem**: Porting CLI keybindings (Shift+Tab, Ctrl+T, Ctrl+O, Alt+P, Esc) to webview inputs requires maintaining custom state wrappers and conflicts with browser focus trees.
- **Solution**: Intercept specific key chords directly in the text area's keydown listener. Map visual states (like TASTE checkbox) to simple CSS active selectors, and dispatch direct action payloads (like `set-permission-mode`) to let the extension host maintain authoritative configurations.

---

### Decoupled Scroll Anchoring Pattern (Stateful Resize/Mutation Observing)
- **Problem**: In dynamic webviews (e.g., chat interfaces, live-streaming terminals), content is dynamically formatted (markdown parsed, syntax highlighted, dynamic images loaded), causing async layout shifts and height changes that run after standard DOM mutation handlers finish execution. Checking scroll heights immediately after innerHTML mutations fails due to async layout reflow timing.
- **Solution**: Decouple scroll adjustments from rendering updates. Maintain a single boolean state flag (`wasNearBottom`) that updates on user scroll events. Establish a `MutationObserver` on the dynamic container to intercept DOM changes, checking `wasNearBottom` to automatically adjust the `scrollTop` to the bottom post-reflow.
- **Capture-Phase Load Event Monitoring**: Register a capturing `load` event listener on parent containers to catch async resource resolutions (such as image resource loading) that modify element bounds without changing DOM structures, executing scroll adjustments on load completion.
- **Layout Shift Prevention (Stable Scroll Gutter)**: Reserve space for vertical scrollbars natively by specifying `scrollbar-gutter: stable;` on scrollable wrappers, preventing horizontal shifts on scrollbar initialization.

---

### Decoupled Filesystem Permission Store Pattern
- **Problem**: Storing interactive user permissions (like `allow-always` for directories/files) in the IDE's local configuration storage (e.g. `globalState`) makes the data inaccessible to headless runs or CLI subprocesses running outside the editor workspace context. This complects execution authorization with the editor application's memory workspace.
- **Solution**: Decouple authorization settings by writing permission preferences to a shared filesystem location (e.g., `~/.commandcode/permissions.json`) in a serialized format. Both the CLI agent and the IDE extension access this file, allowing headless CI runs to run with the exact same permission boundaries approved in the editor.

---

### Strict Runtime Data Guard Pattern
- **Problem**: Relying on TypeScript type assertions (`as IpcRequest`, `as any`) at socket or process boundary layers creates a false sense of security. If a client transmits malformed JSON-RPC message payloads, it will lead to runtime crashes or unhandled exceptions in the handler functions.
- **Solution**: Avoid type casting at communication boundaries. Narrow down incoming `unknown` objects using strict schema or runtime type guard assertions (e.g., `isIpcRequest(obj)`) that check the presence and types of all required fields before delegating the payload to the handler functions.

---

### Decoupled Dependency Storage Pattern (pnpm)
- **Problem**: Storing project dependencies physically inside every local project folder (`node_modules`) duplication (npm/bun) or using complex runtime zip loaders (Yarn PnP) complects workspace structure with file storage location. This wastes disk space and makes builds unpredictable.
- **Solution**: Standardize on `pnpm` to decouple dependency storage from project layouts. Store dependencies in a shared content-addressable global pool and link them into project workspaces using read-only symlinks, preserving native Node resolution compatibility.

---

### Decoupled Keyboard Scroll Forwarding Pattern
- **Problem**: When using rich webviews containing text inputs (like chat textareas), typing and scrolling are distinct developer concerns. Allowing the input element to consume all scroll keys traps focus and requires mouse interaction to scroll. Furthermore, clicking neutral areas focuses the `body` element which is styled with `overflow: hidden`, breaking standard browser keyboard scrolling.
- **Solution**: Intercept navigation keys (`PageUp`, `PageDown`, `Ctrl+Arrows`) inside the input element keydown listener and programmatically scroll the target container. Add a global window keydown listener mapped to `getActiveScrollContainer()` to forward key scrolling events to the active container when focus is on non-input elements (e.g. `BODY`). Ensure visual scrollbars reference native VS Code CSS variable tokens to automatically adapt color contrast.


