# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# cli
See [cli/taste.md](cli/taste.md)

# Github
- When reading issues, always read all comments; use `gh issue view <number> --json title,body,comments,labels,state`. Confidence: 0.95
- When creating issues, add `pkg:*` labels (pkg:agent, pkg:ai, pkg:coding-agent, pkg:mom, pkg:pods, pkg:tui, pkg:web-ui) to indicate affected packages. Confidence: 0.90
- If an issue spans multiple packages, add all relevant pkg labels. Confidence: 0.90
- When closing issues via commit, include `fixes #<number>` or `closes #<number>` in the commit message. Confidence: 0.95
- Use GitHub CLI for issues and PRs. Confidence: 0.90

# Style
- Keep answers short and concise. Confidence: 0.95
- No emojis in commits, issues, PR comments, or code. Confidence: 0.95
- No fluff or cheerful filler text; technical prose only, be kind but direct (e.g., "Thanks @user" not "Thanks so much @user!"). Confidence: 0.95

# File Reading
- NEVER use sed/cat to read a file or range; always use the read tool (use offset + limit for ranged reads). Confidence: 0.95
- Read every file you intend to modify in full before editing. Confidence: 0.95

# Testing Tui
- To test a TUI app, use tmux: create a session with `tmux new-session -d -s <name> -x 80 -y 24`, start the app, capture output with `tmux capture-pane -t <name> -p`, send keys with `tmux send-keys`. Confidence: 0.85

# Versioning
- All packages share lockstep versioning; every release updates all packages together. Confidence: 0.90
- `patch` for bug fixes and new features; `minor` for API breaking changes; no major releases. Confidence: 0.90
- Use `npm run release:patch` or `npm run release:minor` to release. Confidence: 0.90

# changelog
See [changelog/taste.md](changelog/taste.md)

# code-quality
See [code-quality/taste.md](code-quality/taste.md)

# commands
See [commands/taste.md](commands/taste.md)

# git
See [git/taste.md](git/taste.md)

# workflow
See [workflow/taste.md](workflow/taste.md)
