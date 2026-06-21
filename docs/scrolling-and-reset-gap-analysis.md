# Rich Hickey Gap Analysis: Session Reset and Layout-Shift Resilient Scrolling

This document presents a comprehensive Gap Analysis evaluating the failure modes of session resetting and webview auto-scrolling, with proposed optimal solutions.

---

## 📊 Feature Matrix Comparison

| Feature Dimension | Legacy/Current State | Target State | Rationale & Benefit |
| :--- | :--- | :--- | :--- |
| **Terminal Instance Lifetime** | Starting a new session leaves the previous `"Command Code"` terminal running, creating duplicate background CLI shells. | Automatically query and `.dispose()` any existing `"Command Code"` terminals before spawning a new one. | **Resource Safety & Decomplecting**: Prevents port conflicts, socket leaks, and background process noise. |
| **Webview Chat Cleansing** | Starting a new session leaves previous messages and logs visible in the webview sidebar. | Send a `'ResetSession'` event to clear messages, status logs, active agents, and reload the onboarding cards. | **State Synchrony**: Ensures the user interface visual state matches the backend process execution state. |
| **Scroll Pause Trigger** | Triggers pause (`wasNearBottom = false`) if the viewport is more than 150px away from bottom, even if caused by async reflow. | Only pause auto-scrolling if the scroll position moves *upward* (`currentScrollTop < lastScrollTop`), and resume if near bottom. | **Reflow Resilience**: Prevents layout shifts (like syntax highlighting or loaded images) from disabling auto-scroll. |
| **Scroll State Location** | Shared global `wasNearBottom` variable, which complects `chatHistory` scroll state with the `status-content` console. | Store `wasNearBottom` state locally on each HTMLElement DOM object (e.g. `(container as any).wasNearBottom`). | **Decomplecting State**: Allows multiple views (chat panel, streaming status console) to scroll independently without interference. |
| **Status Console Auto-Scroll** | No manual scroll bottom button or user scroll detection on the streaming status logs console. | Wrap `#status-content` with `setupScrollButton()` and configure a custom bottom offset (`bottom: 20px`). | **Consistent Polish**: Extends visual parity and smart scrolling features to the developer logs console. |

---

## 🧠 Failure Modes Analysis

### 1. Terminal Accumulation
* **Failure Mode**: When the user clicks the "Start New Session" onboarding card button or header button, `vscode.window.createTerminal` spawns a new shell process. The old shell process remains running. This leads to terminal accumulation, high CPU usage, and potential UDS socket bind collisions.
* **Solution**: Search the `vscode.window.terminals` collection. If any terminal named `"Command Code"` is active, dispose of it before creating the new one. This synchronously terminates the old process and releases its UDS handle.

### 2. Stale Webview Visuals
* **Failure Mode**: Starting a session via the command palette or buttons does not clear the chat history array in the webview. The user sees a newly spawned terminal but is presented with a long log of previous conversations, confusing the onboarding state.
* **Solution**: Dispatch a custom `'ResetSession'` message to the webview. Upon reception, the webview clears all chat history, status console text, and parallel agents, then reinstates the onboarding welcome template.

### 3. Layout Shift Scrolling Breaks
* **Failure Mode**: When new chunks stream, they are formatted asynchronously (marked parsing, code rendering). A scroll position check (`isNearBottom`) runs. If an image finishes loading or text formatting expands the height *after* the scroll adjustment, `scrollTop` is left further from the bottom than 150px. The next scroll event evaluates this distance, sees it exceeds the threshold, and sets `wasNearBottom` to `false`. Auto-scrolling is now permanently disabled.
* **Solution**: Check scroll direction. If the scroll position is closer to the bottom than the threshold, always set `wasNearBottom = true`. Otherwise, only set it to `false` if `scrollTop` decreases (`currentScrollTop < lastScrollTop`). If `currentScrollTop` is unchanged, it is a reflow expansion, so we do *not* toggle the auto-scroll flag.

---

## 📊 Complexity vs. Utility Matrix

| Solution Element | Utility | Complexity | Architectural Impact | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| **Terminal Disposal** | High | Low | Low | **Adopt.** Eliminates duplicate shell processes. |
| **ResetSession Webview Event** | High | Low | Low | **Adopt.** Synchronizes visual view state. |
| **Directional Scroll-Up Detection** | Critical | Medium | Low | **Adopt.** Prevents layout shifts from breaking auto-scroll. |
| **Local DOM Object State Store** | High | Low | Low | **Adopt.** Unentangles multi-viewport scroll settings. |
| **Status Console Smart Scroll** | Medium-High | Low | Low | **Adopt.** Polishes the status stream panel. |

---

## 🏆 Actionable Recommendation

1. **Modify `setupScrollButton` in `main.ts`** to store `wasNearBottom` on the container DOM element, use direction-aware scroll-up check (`currentScrollTop < lastScrollTop`), and handle `status-content` panel wrapping.
2. **Call `setupScrollButton` on `#status-content`** at startup with appropriate styling override.
3. **Register `ResetSession` event listener** case in `main.ts` to clear and hydrate the UI.
4. **Update command handlers in `sessionCommands.ts` & `extension.ts`** to dispose existing "Command Code" terminals on start/clear, abort running tasks, and dispatch the reset event.
