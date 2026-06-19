# Rich Hickey Gap Analysis: MCP vs Direct Extension API

In the spirit of Rich Hickey's "Simple Made Easy," this analysis evaluates the architecture of using the **Model Context Protocol (MCP)** versus **Direct VS Code API Extension Integration** for building AI coding assistants.

## 1. Core Philosophies

- **MCP (Model Context Protocol)**: Focuses on **decomplecting** the AI model from the IDE. The IDE acts as an MCP Client, and the assistant (or its tools) acts as an MCP Server. This creates a standard, universal transport layer (JSON-RPC over stdio/SSE) that works across Claude Desktop, Cursor, VS Code, etc.
- **Direct VS Code API**: Compresses the IDE capabilities directly into the extension host using proprietary objects (`vscode.window`, `vscode.workspace`). High affinity, but tightly coupled to a single editor ecosystem.

## 2. Feature Set Differences

| Feature | MCP | Direct VS Code API | Difference Explanation |
|---------|-----|-------------------|------------------------|
| **Cross-Editor Support** | High | Low | MCP tools write once, run anywhere (Claude Desktop, Zed, Cursor, VS Code MCP extensions). Direct API limits you to VS Code only. |
| **Tool Registry** | Dynamic (`tools/list`) | Static (Hardcoded) | MCP servers expose capabilities dynamically at runtime. Direct API requires manual wiring of `vscode.commands.registerCommand`. |
| **Resource Read/Write** | Standardized URIs | Proprietary (`vscode.Uri`) | MCP reads `file://` or `git://` universally. Direct API uses VFS which doesn't translate to other editors. |
| **Agent Autonomy** | High (Server-side) | Low (Client-side bound) | MCP allows agents to run headlessly as long as they connect to the socket. Direct API agents must run in the Extension Host context. |

## 3. Complexity vs Utility

| Approach | Setup Complexity | Maintenance Complexity | Extensibility Utility | Reusability Utility |
|----------|-----------------|-----------------------|-----------------------|---------------------|
| **MCP** | Medium (Requires IPC/socket management) | Low (Decoupled boundaries) | Very High (Add any tool as an MCP server) | Very High (Use same tools in other agents) |
| **Direct API**| Low (Built-in Typescript definitions) | High (Coupled to VS Code updates) | Medium (Must write VS Code specific wrappers) | Low (Tied to VS Code runtime) |

## 4. Benefits and Trade-offs

### MCP
- **Benefits**:
  - Unwinds the hairball: separates the UI rendering (IDE) from the tool execution (Server).
  - True composability: you can chain multiple MCP servers.
- **Trade-offs**:
  - Introduces IPC latency.
  - Requires managing subprocesses and sockets (e.g., `EADDRINUSE` handling).

### Direct Extension API
- **Benefits**:
  - Zero IPC overhead.
  - Full access to rich UI elements (Webviews, QuickPicks) synchronously.
- **Trade-offs**:
  - High incidental complexity as business logic becomes entangled with `vscode.*` namespaces.
  - Cannot easily run headless or CLI-only tasks.

## 5. Actionable Recommendation

**Winner: Model Context Protocol (MCP)**

Based on a weighted analysis:
- **Power / Capabilities**: MCP enables universal tooling and multi-agent orchestration.
- **Complexity**: While setup has medium complexity (socket IPC), the long-term maintenance complexity is extremely low because the domain logic is decomplected from the UI layer.
- **Speed**: The IPC overhead is negligible for LLM-driven actions (where the network latency to the LLM vastly outweighs local IPC).

### Next Actions for Implementation
1. Maintain the current `cmd` core as a standalone MCP server (already in `src/mcp/server.ts`).
2. Treat the VS Code Extension (`cmd-lite`) purely as a **thin glass renderer** and **MCP Client**.
3. Continue migrating bespoke tool logic out of `extension.ts` into generic MCP tools.
