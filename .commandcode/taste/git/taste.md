# Git
- ONLY commit files changed in the current session; never use `git add -A` or `git add .`. Confidence: 0.95
- Always use `git add <specific-file-paths>` listing only files you modified. Confidence: 0.95
- Before committing, run `git status` and verify only your files are staged. Confidence: 0.90
- Always include `fixes #<number>` or `closes #<number>` in commit messages when there is a related issue or PR. Confidence: 0.95
- Forbidden git operations: `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git add .`, `git commit --no-verify`. Confidence: 0.95
- If rebase conflicts occur in a file you didn't modify, abort and ask the user. Confidence: 0.90
- NEVER force push. Confidence: 0.95
