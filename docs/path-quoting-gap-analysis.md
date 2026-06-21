# Rich Hickey Gap Analysis: CLI Executable Path Quoting

This analysis covers the failure mode where the Command Code CLI path contains space characters (e.g., under macOS's `Application Support`), causing terminal commands to fail due to shell word splitting.

---

## 📊 Feature Matrix Comparison

| Feature Dimension | Current/Legacy State | Target State | Rationale & Benefit |
| :--- | :--- | :--- | :--- |
| **CLI Executable Invocation** | Executable path is written unquoted (e.g. `/Users/moe/Library/Application Support/...`), resulting in `zsh: no such file or directory` errors. | Enclose the resolved executable path in double quotes (`"cliPath"`) before sending it to the terminal shell. | **Robustness**: Prevents shell word splitting on spaces in paths, ensuring reliable execution on all platforms. |
| **Command Palette & Webview Triggers** | All interactive launcher routines (start, continue, login) join paths without quote escaping. | Apply double-quotes escaping across `src/permission/interactive.ts` and `src/ui/sessionCommands.ts`. | **Consistency**: Guarantees that any terminal launched by the extension works regardless of the workspace path context. |

---

## 🧠 Technical Breakdown & Architectural Rationale

### 1. Shell Word Splitting
When a terminal shell (like `zsh`, `bash`, or `cmd.exe`) receives a command string, it splits the arguments on whitespace characters. If the binary path contains spaces (like `/Users/moe/Library/Application Support`), the shell interprets `/Users/moe/Library/Application` as the command name and `Support/...` as separate arguments.

### 2. Double-Quoted Executables
By formatting the terminal command as `"${cliPath}" ...args`, the entire path is preserved as a single shell token. This is compatible across all target Unix shells (zsh, bash, sh) and Windows shells (PowerShell, Cmd).

---

## 📊 Complexity vs. Utility Matrix

| Solution Element | Utility | Complexity | Architectural Impact | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| **Double-Quoting cliPath** | Critical | Low | Low | **Adopt.** Fixes terminal execution crashes. |

---

## 🏆 Actionable Recommendation

1. Update `launchTerminal()` in `src/permission/interactive.ts` to double-quote `cliPath`.
2. Update the `cmd-lite.login` command handler in `src/ui/sessionCommands.ts` to double-quote `cliPath`.
3. Rebuild, package, and reinstall the extension.
