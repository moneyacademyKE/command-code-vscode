# Rich Hickey Gap Analysis: Visual Test Automation using AppleScript

This document presents a comprehensive Gap Analysis for visual GUI testing and session verification in Antigravity IDE using AppleScript (`osascript`) and macOS native screen capture tools.

---

## 📊 Feature Matrix Comparison

| Feature Dimension | Legacy/Typical Manual Verification | Automated AppleScript Verification | Rationale & Benefit | Trade-offs & Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **Execution Trigger** | Manual clicking, typing, and visual verification inside the IDE by the developer. | Structured Clojure-based Babashka script executing sequence of `osascript` calls. | **Decomplecting Human Error**: Prevents test omissions, speeds up verification, and creates repeatable visual artifacts. | Requires system-level OS Accessibility permissions on macOS; execution is environment-sensitive. |
| **IDE Focus & Setup** | Manual window switching, triggering command palette via hotkeys. | Native AppleScript window activation (`activate`) and menu keyboard simulation (`keystroke "p" using {command down, shift down}`). | **Repeatable State**: Ensures the IDE is active and clean before key presses are directed to it. | Delay times must be tuned (e.g. `delay 1`) to allow macOS window server to register active window. |
| **Viewport Auto-Scroll Testing** | Manual typing of long queries and watching if the scrollbar moves. | Programmatic prompt submission of a long-form query followed by PageUp keyboard code injection (`key code 116`). | **Boundary Testing**: Validates layout-shift resilient scrolling by explicitly forcing scrolling out of and back into the bottom zone. | Reliant on external LLM server latency or mock CLI streaming timing. |
| **Visual Evidence Logging** | None, or manual screenshot capturing. | Programmatic phase-based `screencapture -x -o` executions creating comparison images. | **Rich Evidence**: Generates visual status records (`visual-1-start.png` to `visual-4-reset-complete.png`) to prove UI cleanliness. | Increases repository image binary footprints if not cleaned up or gitignored. |

---

## 🧠 Failure Modes Analysis

### 1. Fragile Target Selection
* **Failure Mode**: AppleScript targeting can fail if the app process name or window title is slightly different, causing `System Events` errors or keystrokes leaking to other applications.
* **Solution**: Activate the application explicitly by name (`tell application "Antigravity IDE" to activate`) before keyboard dispatch, and use standardized command palette search filters rather than coordinate clicks.

### 2. Time-Race Conditions
* **Failure Mode**: The automation script types inputs too fast before the extension webview responds or streams output.
* **Solution**: Insert calibrated wait periods (`delay` commands) that account for rendering and streaming latencies.

### 3. Space-Containing Directory Invocations
* **Failure Mode**: Invoking CLI tools from automated test shells without quotes (like `/Users/.../Application Support/...`) splits paths, causing `exit code 127` errors.
* **Solution**: Wrap executable binaries in double quotes (`"cliPath"`) across all execution hooks in the script.

---

## 📊 Complexity vs. Utility Matrix

| Solution Element | Utility | Complexity | Architectural Impact | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| **AppleScript Activation** | High | Low | Low | **Adopt.** Brings target IDE to front safely. |
| **Calibrated Delay Injection** | Critical | Low | Low | **Adopt.** Prevents race conditions. |
| **Phase-Based Screen Captures** | High | Low | Low | **Adopt.** Provides audit trails for layouts. |
| **Keyboard Scrolling Codes** | High | Medium | Low | **Adopt.** Synthetically tests direction checks. |

---

## 🏆 Actionable Recommendation & Actions

1. **Verify AppleScript Syntax**: Ensure correct application names and keyboard keycodes are used (e.g. keycode `116` for PageUp, keycode `36` for Enter).
2. **Execute Automation Suite**: Run `bb scripts/visual-test.clj` on the host system to capture all four testing phases.
3. **Inspect Output Artifacts**: Verify that the generated images match expectations:
   - `visual-1-start.png`: Onboarding cards and clean empty webview.
   - `visual-2-streaming.png`: Active logs streaming down in real-time.
   - `visual-3-scrolled-up.png`: User scrolled up, auto-scrolling paused.
   - `visual-4-reset-complete.png`: Welcome screens returned after reset.
4. **Git Versioning**: Stage code modifications, compile/typecheck, package, and release version `0.5.3`.
