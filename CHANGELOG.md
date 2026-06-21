# Changelog

## 0.5.0

- **Interactive Onboarding UI**: Replaced empty state with a glassmorphic onboarding welcome card inside chat histories, showing ASCII logos, quick action commands, and keyboard shortcut maps.
- **Autonomous Diagnostics Fixing (`/fix`)**: Intercepts `/fix` prompts, aggregates active workspace diagnostics (ignoring build/dependency directories like `node_modules` or `dist`), prioritizes Errors over Warnings, caps to 30 issues to prevent token bloat, and feeds them into the standard CLI execution loop. Adds a `🔧 FIX` sidebar button.
- **Workspace Path Setting Interpolation**: Automatically expands `${workspaceFolder}` and resolves relative paths inside the local registry path configurations.
- **Optimized Local Auto-Updates**: Downloads and copies CLI packages locally using offline filesystem streams under `"cmd-lite.localRegistryPath"`, and skips production dependency setup if the target package has no dependencies.

## 0.4.0

- **Local CLI Dependency Isolation**: Configured CMD Lite to download and run the CLI package inside a private `globalStorageUri` cache directory (`~/.commandcode/cli/`) by default, preventing EACCES write errors and shell PATH configuration conflicts with global package installs.
- **Node-Based ES Module Wrapper**: Spawns local `.mjs` entrypoint files via `process.execPath` (the embedded Node.js executable), ensuring cross-platform execution consistency across Windows, macOS, and Linux without native binaries.
- **First-Run CLI Bootstrapping**: Implemented dynamic background dependency installers that fetch the CLI tarball from the NPM registry and unpack it on first launch if no local version is detected.
- **Transactional Atomic Swapping Updates**: Extracts downloaded packages into a separate temporary directory and performs an atomic directory swap, preventing code execution locks or file corruption if updates are interrupted.
- **Asynchronous Registry Version Checks**: Activation scheduler queries NPM registry versions in the background, prompting the user with a Progress notification only if a newer compatible CLI version is available.

## 0.3.0

- **Webview Visual TUI Parity**: Implemented pixel-perfect visual styling to match the Command Code CLI TUI. Added the 5-line ASCII art CMD logo in the header, `# `-prefixed metadata fields for version, active models, and current working directory, custom dashed-line CLI separators, and the prompt character `❯` to style input elements.
- **Braille Spinner & Execution Status**: Added a rotating Braille frame spinner (`[o, O, o, .]`) and live execution duration timer to provide real-time status feedback during query processing.
- **Response Bullet & Thought Formatting**: Prepended the `⠶` bullet character to system/agent messages and the `✻` prefix to thought accordions, which also display the duration of the reasoning step.
- **Keyboard Shortcuts & Native Input Box Proxy**: Added the `Ctrl+G` (or `Cmd+G` on macOS) shortcut to open the active prompt in a native VS Code input box. This serves as an external editor proxy to easily input multi-line or detailed text without focus constraints. Added `Ctrl+O` to toggle thought accordion blocks.
- **Asynchronous CLI Handshake**: Decomplected startup latency by fetching CLI version and model configuration asynchronously, allowing the webview to initialize instantly and populate metadata header spans reactively when ready.
- **Direct CLI Slash Command Routing**: Decoupled command validation from the webview. All unknown slash commands are now forwarded directly to the CLI for handling rather than being rejected locally.
- **Visual Regression Test Harness**: Introduced a standalone HTML testing suite coupled with Playwright headless capture (`scripts/final-capture.mjs`) to visually compare webview renders against CLI tmux logs.
- **Comprehensive Vitest Coverage**: Added 65 target tests to `src/__tests__/webview-regression.test.ts` to prevent UI class, keybinding, and style regressions, bringing the total suite to 138 passing tests.
- **TypeScript Type Safety Hardening**: Eliminated explicit `any` casting across webview state handlers, relative pattern mocks, and test suites, enforcing strict runtime narrowing and guard assertions.

## 0.2.0

- **Accessible Webview Scrolling**: Native VS Code theme variable mappings for high-contrast scrollbars and global keyboard scroll routers (arrows, page keys, space) resolving focus dead-zones.
- **Stateless Input Navigation**: Textarea keyboard forwarding supporting page scrolling and line scrolling from the chat input without losing cursor focus.
- **Decoupled Permission Store**: Migrated interactive permissions from IDE `globalState` (Memento) to a shared filesystem database (`~/.commandcode/permissions.json`) supporting both headless CLI and extensions.
- **Strict Runtime Data Guards**: Explicit type guard assertions at socket and IPC communication boundary layers to narrow `unknown` payloads.
- **Reactive Configuration Loops**: Immediate binary path and version validation on setting changes without requiring host reloads.
- **Package Manager Standardization**: Standardized project infrastructure on `pnpm` workspace links, reducing duplicate local dependency files.

## 0.1.0

- Initial release
- `@cmd` chat participant with plan / review / taste / learn commands
- Taste sidebar with live reload
- Status bar indicator (mode + model)
- Session commands: start / continue / resume / headless / plan / review
- Taste commands: push / pull / list / lint / learn / open
- Auth: login / logout / status / info / update
- Headless task provider (`Terminal → Run Task`)
- Configuration: cliPath, defaultModel, defaultPermissionMode, maxTurns, showStatusBar