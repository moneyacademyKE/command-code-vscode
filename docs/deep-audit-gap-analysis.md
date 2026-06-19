# Deep Audit: Rich Hickey Gap Analysis (2026 SOTA)

This document outlines the findings of the 2026 Deep Audit comparing the current `cmd-lite` architecture against State-of-the-Art (SOTA) 2026 AI Agent capabilities, evaluated through the lens of Rich Hickey's Simplicity principles.

## Feature Set Differences: CMD Lite vs. 2026 SOTA

| Capability | SOTA 2026 Agent IDEs | `cmd-lite` (Current) | Gap Explanation |
| :--- | :--- | :--- | :--- |
| **Agent Evaluation as Tests** | Native `pytest` integration for agent behavior | None | SOTA allows defining agent quality checks as unit tests. `cmd-lite` lacked integration tests for the CLI-to-Extension IPC bridge until this audit. |
| **The Agents Window** | Multi-agent orchestration dashboard | Legacy sessions view | SOTA uses dedicated mission control for parallel autonomous tasks. `cmd-lite` uses a simple static JSONL session list. |
| **Secure Process Boundaries** | Strict auth on local agent sockets | Open Unix Sockets | Modern agents enforce strict boundaries. `cmd-lite` UDS context sockets lacked an auth handshake, allowing local privilege escalation. |
| **Agent Context Compaction** | Automated/manual `/compact` for token limits | Unmanaged | SOTA manages conversation history to avoid context death. `cmd-lite` history is completely unmanaged. |
| **Version Compatibility Guard** | Strict client/server version alignment | Silent failure | Extension and CLI updates are decoupled. `cmd-lite` did not verify if the CLI binary version met the extension's minimum requirements. |

## Complexity vs. Utility Analysis (Rich Hickey Verdicts)

1. **Socket Authentication (Token Handshake)** 
   - *Utility: High, Complexity: Medium*
   - *Verdict:* **Adopted**. Leaving local sockets open complects development convenience with fatal security flaws.
2. **CLI Version Guard**
   - *Utility: High, Complexity: Low*
   - *Verdict:* **Adopted**. Simple, isolated data check that prevents massive downstream errors.
3. **UDS Integration Tests (via Babashka/Vitest)**
   - *Utility: High, Complexity: High*
   - *Verdict:* **Adopted**. A system without tests complects "hope" with "correctness." Babashka is used for pre-commit hooks to ensure TDD.
4. **Agent Context Compaction**
   - *Utility: Medium, Complexity: High*
   - *Verdict:* **Rejected**. Complex state management should reside in the `cmd` CLI, not the IDE wrapper.

## Actionable Recommendations & Implementation

Following the Gap Analysis, the following steps were taken utilizing Red/Green TDD:
- A `checkCliVersion` guard was implemented, forcing `MINIMUM_CLI_VERSION = "0.39.0"`.
- The UDS Server in `ipc-server.ts` was updated to require a secure `AUTH_HANDSHAKE` token.
- `bb.edn` and `install_hooks.clj` were created to serve as the unified pipeline for linting, testing, and pre-commit checks.
