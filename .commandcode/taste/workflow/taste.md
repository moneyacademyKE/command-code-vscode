# Workflow
- If no concrete task is given in the first message, read README.md then ask which module(s) to work on. Confidence: 0.95
- After identifying modules, read relevant package READMEs in parallel (packages/ai, tui, agent, coding-agent, mom, pods, web-ui). Confidence: 0.90
- NEVER commit unless user explicitly asks. Confidence: 0.95
- Never open PRs; work in feature branches until requirements are met, then merge into main and push. Confidence: 0.95
- When analyzing PRs, do not pull locally first; analyze without pulling. Confidence: 0.90
- If user approves a PR: create feature branch, pull PR, rebase on main, apply adjustments, commit, merge into main, push, close PR, leave a comment in the user's tone. Confidence: 0.90
