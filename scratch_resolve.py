import sys

def resolve(file_path, choice):
    with open(file_path, 'r') as f: lines = f.readlines()
    out = []
    state = 0
    head_lines = []
    stash_lines = []
    for line in lines:
        if line.startswith('<<<<<<<'): state = 1; head_lines = []; continue
        if line.startswith('======='): state = 2; stash_lines = []; continue
        if line.startswith('>>>>>>>'):
            if choice == 'HEAD': out.extend(head_lines)
            elif choice == 'STASH': out.extend(stash_lines)
            elif choice == 'BOTH': out.extend(head_lines); out.extend(stash_lines)
            state = 0; continue
        if state == 0: out.append(line)
        elif state == 1: head_lines.append(line)
        elif state == 2: stash_lines.append(line)
    with open(file_path, 'w') as f: f.writelines(out)

resolve('docs/updated-gap-analysis.md', 'HEAD')
resolve('learnings.md', 'BOTH')
resolve('patterns.md', 'BOTH')
resolve('src/cli/commands.ts', 'BOTH')
resolve('src/context/ipc-server.ts', 'BOTH')
resolve('src/extension.ts', 'BOTH')
resolve('src/webview/style.css', 'STASH')
