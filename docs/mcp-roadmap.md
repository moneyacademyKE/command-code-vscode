# Model Context Protocol (MCP) Roadmap

This document outlines the strategic roadmap for migrating the `cmd-lite` VS Code Extension and its core CLI capabilities to a fully decomplected Model Context Protocol architecture. Adhering to Rich Hickey's "Simple Made Easy", our primary goal is to isolate the user interface (the editor) from the execution logic (the tools) and the intelligence (the agent).

## Current State vs. Target State

```mermaid
graph TD
    subgraph Current State
        A[cmd-lite Extension] -->|Proprietary IPC| B[CLI Agent]
        A -->|Native API Calls| C[VS Code Git/FS]
        B -->|Direct Calls| D[Local Shell]
    end
    
    subgraph Target State (MCP)
        E[Thin Glass Webview] -->|JSON-RPC UI Events| F[IDE MCP Client]
        F -->|MCP Protocol| G[CLI Agent/Server]
        G -->|MCP Tool Calls| H[Universal Tools: FS/Git/Shell]
    end
```

## Phase 1: Uncomplecting the IDE (Short-Term)

The immediate objective is to strip business logic out of the VS Code extension host (`extension.ts`) and expose it as generic MCP tools. This ensures the extension acts solely as a dumb "Thin Glass" renderer and an MCP Client.

### Objectives
- **File System Tools**: Deprecate `vscode.workspace.fs` dependencies within the agent's logic loop. Implement `cmd-mcp-fs` tools (`readFile`, `writeFile`, `listFiles`) that operate natively via Node.js or Babashka, eliminating editor-specific URIs.
- **Git Context Tools**: Expose the current branch, uncommitted changes, and commit history via an MCP tool rather than relying on the proprietary VS Code Git API.
- **Diff Presentation**: Create an MCP tool for proposing diffs (`cmd-lite-diff`). The agent generates diff blocks independently, and the IDE merely consumes the proposed state to render the `vscode.diff` UI.
- **External Registries Pivot**: We deprecated custom Babashka file-system scripts. Instead, we use `npx` to dynamically provision official `@modelcontextprotocol/server-filesystem` and `@modelcontextprotocol/server-github` servers, fully decomplecting standard operations from the extension.

> **Note on the `cmd` Precompiled Binary**: Because `cmd` is a precompiled, globally installed binary (managed via `npm i -g command-code`), we do not compile its agent logic in this repository. The migration to standard MCP servers ensures the precompiled binary can dynamically discover these new capabilities at runtime (via standard `mcp.json` config files) without requiring a hard fork or recompilation of the core CLI engine.

## Phase 2: Agent Autonomy (Mid-Term)

Focus on decoupling the execution environment from the VS Code window entirely, allowing the agent to persist and act autonomously.

### Objectives
- **Headless MCP Client**: Enable the Command Code CLI to connect to the extension's MCP socket from a standalone headless terminal. This allows background task execution without requiring an active Webview interaction.
- **Session State Independence**: Currently, UI state (`messages`, `tokens`) is tightly coupled to the running extension process. We will move the memory and chat session states to persistent disk stores (SQLite/JSON) managed exclusively by the CLI/Server.
- **Event-Driven Wakeups**: Implement reactive background task polling via MCP Notifications so the CLI can sleep and wake automatically on background process completion.

## Phase 3: Composable Agents (Long-Term)

Evolve the system from a single interactive loop to a multi-agent orchestrated cluster, discovering tools dynamically.

### Objectives
- **Tool Registries (Completed via Config Generator)**: The `cmd-lite.generateMcpConfig` command now automatically bridges the gap by writing an `mcp.json` that provisions external Node-based MCP servers dynamically.
- **Multi-Agent Orchestration**: Implement parallel sub-agents (e.g., "Tester", "Documenter") that are provisioned with specific subsets of MCP tools based on their role, enforcing security through least-privilege tool subsets.
- **Universal Affordances**: Provide cross-editor compatibility out-of-the-box. The `cmd` CLI will be fully capable of operating inside Zed, Cursor, or Claude Desktop by standardizing its transport layer to standard stdio/SSE.

---
*Drafted: June 2026. Rich Hickey Certified Architecture.*
