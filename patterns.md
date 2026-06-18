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
