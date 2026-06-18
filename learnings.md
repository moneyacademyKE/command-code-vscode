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
   pnpm install
   pnpm build
   pnpm package
   code --install-extension command-code-0.1.0.vsix
   ```

## Development Commands
- `pnpm watch` for auto-compilation during development.
- `pnpm typecheck` to run typescript checks.

## CLI Session Management Gotchas
- **Argument Parsing Behavior**: Running `cmd -reset` or `cmd -restart` leads to errors like `No session named "eset" found.` because the parser interprets `-r` as the short flag for `--resume [name]` and consumes the remaining characters (`eset` or `estart`) as the session identifier.
- **Starting/Restarting**:
  - To start a new clean interactive session: `cmd`
  - To resume the last session: `cmd -c` or `cmd --continue`
  - To resume a specific session by ID or name: `cmd -r [name]`
  - To exit a running CLI session: type `/exit` in the terminal, or send a termination signal (e.g. `kill <pid>`).

