# Command Code VS Code Extension — Gap Analysis & Implementation Guide

> [!NOTE]
> This repository houses the unofficial, community-driven VS Code extension for [Command Code (`cmd`)](https://commandcode.ai).
> Below is a comprehensive Gap Analysis comparing the **Official Command Code Extension** vs. **This Unofficial Extension** under the lens of Rich Hickey's Simplicity principles.

---

## 📊 Feature Matrix: Unofficial vs. Official Extension

The unofficial extension is built as a **decoupled, feature-rich wrapper** that acts as a functional superset of the official plugin, exposing rich UI interactions while keeping state management clean.

| Capability | Official Extension | Unofficial Extension (This Repo) | Architectural Status |
| :--- | :---: | :---: | :--- |
| **IPC Context Server (UDS Socket)** | ✅ | ✅ | **Unified**: Shares real-time workspace state over Unix Domain Sockets. |
| **Active Editor Selection Sharing** | ✅ | ✅ | **Optimized**: Shares active selection, debounced to prevent IPC lag. |
| **Diagnostics / Error Sharing** | ✅ | ✅ | **Unified**: Relays IDE diagnostics (errors, warnings, hints) to the CLI. |
| **Git Context Relay** | ❌ | ✅ | **Extended**: Shares branch name, HEAD commit hash, and list of modified files. |
| **UDS Socket Authentication** | ❌ | ✅ | **Secured**: Implements UUID token handshakes and process-isolated socket permissions (`0o600`). |
| **Chat Participant (`@cmd`)** | ❌ | ✅ | **Feature**: Native chat UI routing queries to `cmd -p` with cancellation. |
| **Language Model Tools (6 Tools)** | ❌ | ✅ | **Feature**: Exposes IDE capabilities (`runPrint`, `getTaste`, etc.) to Copilot/Agents. |
| **Parallel Agent Orchestration** | ❌ | ✅ | **Feature**: Coordinates concurrent `cmd --headless` tasks (impl, tests, docs). |
| **Inline Diff Previews** | ❌ | ✅ | **Feature**: Intercepts code modifications and presents them via `vscode.diff()`. |
| **Taste Sidebar TreeView** | ❌ | ✅ | **Feature**: Employs `FileSystemWatcher` for reactive reload of `.commandcode/taste/`. |
| **Status Bar Controller** | ❌ | ✅ | **Feature**: Quick settings selector for active model, permission modes, and status. |
| **Session History Log** | ❌ | ✅ | **Feature**: Reads active sessions and metadata straight from `~/.commandcode/projects/`. |
| **Reactive Configuration** | ❌ | ✅ | **Robust**: Instantly updates CLI path validation and status bars on setting changes. |
| **Test Coverage** | ❌ | ✅ | **Quality**: 33 unit tests configured with Vitest. |
| **CLI Auto-Bundle** | ✅ | ❌ | **Trade-off**: Requires manual CLI installation (`npm i -g command-code`). |

---

## 🧠 Rich Hickey Analysis: Simplicity vs. Easiness

In analyzing editor integrations (such as comparing Command Code with competitors like Kilo Code), we apply Rich Hickey’s principles of **decomplecting** state and prioritizing **simplicity** (untangling concerns) over **easiness** (immediate convenience that complects systems).

### 1. Decomplecting Editor & Agent State
* **Accidental Complexity (The Fork/Heavy Extension Path):** Deeply hooking into the editor's token stream or webviews to manage agent sessions (e.g. Cursor forks or Kilo Code's heavy client logic). This complects the editor lifecycle with the AI inference state.
* **Essential Simplicity (Our Extension Wrapper Path):** Treating the editor purely as a "dumb UI frontend" and a read-only context provider. All agent state, decision loops, and `taste-1` learning reside exclusively inside the `cmd` CLI. The UDS socket separates these domains cleanly.

### 2. Concurrency (Parallel Agent Orchestration)
Running multiple agents concurrently (e.g., implementing, testing, and documenting at once) is high-utility but traditionally complects state.
* **Simple Implementation:** We treat the project's instructions and "taste" preferences as immutable values. Our parallel agent module spawns concurrent `cmd --headless` subprocesses. Each process operates independently without mutating live code, outputting proposal events that are merged or reviewed sequentially.

### 3. Complexity vs. Utility Matrix

| Capability | Utility | Technical Complexity | Architectural Type | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| **IPC Context Server** | High | Medium | Essential | **Adopted.** Essential for feeding editor state without CLI polling. |
| **UDS Token Handshake** | High | Low | Security | **Adopted.** Ensures only the authenticated VS Code editor can connect to the UDS socket. |
| **Parallel Orchestration** | High | Medium | Concurrency | **Adopted.** Spawns concurrent subprocesses and aggregates results without locking the editor. |
| **Inline Autocomplete (LSP)**| Medium | High | Accidental | **Rejected.** Bypasses the unified `taste-1` CLI loop and complects the LSP with the editor. |

---

## 🛠️ Installation & Quick Start

### 1. Prerequisites (CLI Installation)
Since we do not bundle the proprietary binary, you must install the `command-code` CLI globally:

```bash
npm i -g command-code
```

> [!TIP]
> In environments with both npm and yarn configured globally, updating the CLI using standard `cmd update` might modify the NPM prefix while leaving the active Homebrew system binary pointing to the legacy Yarn path. If your CLI version is mismatched, update via:
> ```bash
> yarn global add command-code@latest
> ```

### 2. Install the Extension VSIX
You can download the packaged extension from our [GitHub Releases](https://github.com/moneyacademyKE/command-code-vscode/releases) page. Install it directly via your terminal:

```bash
code --install-extension command-code-0.1.0.vsix
```

---

## 💻 Developer Guide

If you are contributing to this extension:

```bash
# Install dependencies
npm install

# Run build compilation
npm run build

# Run lint checks
npm run lint

# Run unit tests
npm test

# Build packaged .vsix extension
npm run package
```

### Key Configurations (`settings.json`)

* `commandcode.cliPath`: Custom path to your `cmd` executable (defaults to `cmd`).
* `commandcode.defaultModel`: Default model override (e.g. `claude-opus-4.8`).
* `commandcode.defaultPermissionMode`: Default permission mode (`standard`, `plan`, `auto-accept`).
* `commandcode.showStatusBar`: Toggle the status bar session indicator.
* `commandcode.context.maxSelectionLength`: Caps the text selection context shared over IPC.

---

## ⚖️ License
MIT License for the extension frontend. The `cmd` CLI is proprietary (© Command Code, Inc.).