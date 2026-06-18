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
