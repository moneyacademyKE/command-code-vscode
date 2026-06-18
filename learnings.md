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
