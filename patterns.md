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
