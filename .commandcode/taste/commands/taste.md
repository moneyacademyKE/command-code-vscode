# Commands
- After code changes (not documentation changes), run `npm run check` and get full output (no tail); fix all errors, warnings, and infos before committing. Confidence: 0.95
- `npm run check` does not run tests. Confidence: 0.90
- NEVER run: `npm run dev`, `npm run build`, `npm test`. Confidence: 0.95
- Only run specific tests if user instructs, using: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`. Confidence: 0.90
- Run tests from the package root, not the repo root. Confidence: 0.90
- When writing tests, run them, identify issues in test or implementation, and iterate until fixed. Confidence: 0.90
