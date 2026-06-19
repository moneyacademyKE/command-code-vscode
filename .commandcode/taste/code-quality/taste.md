# Code Quality
- No `any` types unless absolutely necessary. Confidence: 0.95
- Check node_modules for external API type definitions instead of guessing. Confidence: 0.90
- NEVER use inline/dynamic imports (no `await import("./foo.js")`, no `import("pkg").Type`); always use standard top-level imports. Confidence: 0.95
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead. Confidence: 0.95
- Always ask before removing functionality or code that appears intentional. Confidence: 0.95
- Never hardcode key checks (e.g., `matchesKey(keyData, "ctrl+x")`); all keybindings must be configurable with defaults in `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS`. Confidence: 0.90
