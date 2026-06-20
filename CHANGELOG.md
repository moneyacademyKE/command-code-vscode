# Changelog

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