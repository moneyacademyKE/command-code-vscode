# Memory

## Project Overview
See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes
Add important architectural decisions and patterns here.

## Common Workflows
Document frequently used workflows and commands here.
- **Visual UI Verification**: Whenever making significant changes to UI layouts, scrolling, or state resets, run the AppleScript visual UI automation suite using Babashka:
  ```bash
  bb scripts/visual-test.clj
  ```
  Verify and validate the generated screenshots (`scripts/visual-1-start.png` through `scripts/visual-4-reset-complete.png`) to ensure visual stability and regression prevention.
