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
- **Model Context Protocol (MCP) Integration**: To avoid complecting the custom UDS IPC context server with infinite ad-hoc VS Code API requests (like "run terminal", "open file", "read errors"), we implemented a native MCP Server inside the extension. The CLI acts as the MCP Client. This standardizes Editor-Agent communication, ensuring the extension remains a "dumb host" while granting the CLI infinite extensible power.

## Webview Observability (Rich Hickey Certified)
- **Streaming Chunks vs Batched Messages**: When exposing underlying tool logs (e.g. `cmd` execution stdout) to the user via a Webview, sending individual JSON-RPC messages per chunk creates an unmanageable number of DOM nodes. By separating structural message blocks (`RenderMessage`) from streaming logs (`StdoutChunk`), we decomplect terminal observation from chat history. We route stream chunks directly into a `<pre class="status-content">` block, ensuring simple and memory-efficient observability.

## Scripting and Tasks
- **Babashka (bb) over Python**: To standardize script execution and prevent environment fragmentation, all build and testing tasks are orchestrated via `bb.edn` using Babashka. Babashka leverages Clojure's simplicity and immutable data structures, perfectly aligning with the project's Rich Hickey philosophy.
