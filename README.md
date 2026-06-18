# Command Code — VS Code Extension

A coding agent with taste, in your editor. This extension wraps the [`cmd` CLI](https://commandcode.ai) and surfaces it as a native VS Code experience — chat panel, taste sidebar, status bar indicator, plan mode, and team taste workflows.

It does **not** fork VS Code. It does **not** re-implement taste learning. It shells out to `cmd` (which you install with `npm i -g command-code`) and gives you first-class IDE surfaces for it.

## Install

### 1. Prerequisites (Install the CLI)
The extension shells out to the `cmd` CLI. First, install the CLI globally:

```bash
npm i -g command-code
```

### 2. Install the Extension

#### Option A: Install Pre-built Extension (Recommended)
If you have the pre-built `.vsix` file (`command-code-0.1.0.vsix`) in your workspace, install it directly:

```bash
code --install-extension command-code-0.1.0.vsix
```

#### Option B: Build and Install from Source (For Development)
If you are developing the extension, you can install dependencies, build, and package it yourself:

```bash
pnpm install       # Install dependencies (or npm install)
pnpm build         # Build (or npm run build)
pnpm package       # Packages into command-code-0.1.0.vsix
code --install-extension command-code-0.1.0.vsix
```

## Features

### Chat participant (`@cmd`)
- Streaming responses through `cmd -p` with progress indicators
- Slash-style commands: `plan`, `review`, `taste`, `learn`
- Multi-model support (Claude, GPT, Kimi, DeepSeek, GLM, Qwen, etc.)
- Plan mode built-in

### Taste sidebar
- TreeView of `.commandcode/taste/taste.md` and category files
- Live reload via `FileSystemWatcher`
- Inline preview of the first line of each file

### Commands
- `Command Code: Start Session` — open an interactive `cmd` session (in your terminal)
- `Command Code: Continue Last` — `cmd -c`
- `Command Code: Resume Past…` — `cmd -r <name>`
- `Command Code: Run Headless…` — `cmd -p <prompt>` into an output channel
- `Command Code: Plan…` — opens a Markdown scratchpad with the plan
- `Command Code: Review PR…` — review current branch or a PR number
- `Command Code: Pick Model` — switches the active model
- `Command Code: Pick Permission` — standard / plan / auto-accept
- `Command Code: Push Taste` / `Pull Taste` / `List Taste` / `Lint Taste` — share taste with your team
- `Command Code: Learn Taste From Current Folder`
- `Command Code: Open Taste Profile on commandcode.ai`
- `Command Code: Show Status` / `Show System Info` / `Login` / `Logout` / `Update`

### Status bar
- `cmd · standard · claude-opus-4.8` — click to switch permission mode.

### Tasks
- `Command Code (headless)` task runs `cmd -p` in a pseudo-terminal. Open with `Terminal → Run Task`.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `commandcode.cliPath` | `cmd` | Override if you installed the CLI to a non-standard path |
| `commandcode.defaultModel` | _(empty)_ | e.g. `claude-opus-4.8`, `deepseek-v4-pro` |
| `commandcode.defaultPermissionMode` | `standard` | `standard` / `plan` / `auto-accept` |
| `commandcode.maxTurns` | `10` | Cap on turns for headless / print mode |
| `commandcode.showStatusBar` | `true` | Hide if you don't want the indicator |

## Architecture

```
VS Code Chat API ─┐
Taste Sidebar    ─┼──► src/extension.ts ──► src/cli/spawn.ts ──► cmd binary
Status Bar       ─┘                                  │
                                                      ▼
                                          .commandcode/taste/**
```

`src/cli/commands.ts` is the only thing that knows about `cmd` flags. Everything else talks through that.

## Why not a fork?

See `~/.commandcode/plans/vscode-plugin-or-fork-gap-analysis.md` for the full analysis. Short version: even Anthropic ships a wrapper extension, not a fork, for Claude Code. The CLI is the product. The editor is a frontend.

## Development

```bash
pnpm install
pnpm watch         # esbuild watch
pnpm typecheck
pnpm package       # produces .vsix
```

## License

MIT for the extension code. The `cmd` CLI is proprietary (© Command Code, Inc.).