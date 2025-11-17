# ccws

Quick multi-repo workspace generator for Claude Code.

## Features

- 🚀 Create workspaces in <60 seconds
- 🌳 Git worktrees for minimal disk usage  
- 📦 Automatic dependency priming
- 🤖 Claude Code integration
- 🎯 Zero manual setup after generation

## Requirements

- macOS 10.13+ (uses APFS clones via cp -c, rsync fallback)
- Git 2.20+ (worktree support)
- Node.js 18+ (ES modules)
- Claude CLI installed and configured

## Install

```bash
npm install -g ccws
```

## Usage

```bash
ccws
```

Follow the interactive prompts to:
1. Choose base directory for repo discovery
2. Select repositories to include
3. Set aliases and branches
4. Get workspace path

Then:
```bash
cd ccws-abc123
npm install
npm run dev
```

## Commands

From workspace root:
- `npm run dev` - Start all repos in dev mode
- `npm run <alias>:dev` - Start specific repo
- `npm run <alias>:build` - Build specific repo
- `npm run <alias>:test` - Test specific repo
- `npm run <alias>:lint` - Lint specific repo

## Configuration

Set `CLAUDE_CLI_ARGS` environment variable to customize Claude CLI flags:
```bash
export CLAUDE_CLI_ARGS="--model claude-3-opus"
ccws
```

## How It Works

1. **Discovery**: Finds git repositories in your chosen directory
2. **Selection**: Interactive prompts for repos, aliases, and branches
3. **Worktrees**: Creates git worktrees (shared objects, isolated working trees)
4. **Priming**: Uses APFS clones (copy-on-write) for instant dependency access
5. **Environment**: Copies .env* files to each worktree
6. **Integration**: Generates unified package.json and CLAUDE.md

## Performance

- **APFS Clones**: node_modules cloned in <1s vs 10s+ regular copy (copy-on-write)
- **Worktrees**: 90% less disk usage vs full clones
- **Parallel**: All repos start with single `npm run dev`

## Workspace Structure

```
ccws-abc123/
├── .gitignore          # Excludes repos/* and secrets
├── package.json        # Unified command interface
├── CLAUDE.md          # Auto-generated workspace guide
└── repos/
    ├── frontend/      # Git worktree
    ├── backend/       # Git worktree  
    └── shared/        # Git worktree
```

## Troubleshooting

**Error: "Worktree already exists"**
```bash
# Remove existing worktree
git worktree remove /path/to/worktree
```

**Error: "Operation not permitted" (APFS clone fails)**
- Ensures source and destination are on same APFS filesystem
- Tool automatically falls back to rsync

**Error: "Claude CLI not found"**
- Install Claude CLI: Follow official installation guide
- Verify: `claude --version`

**Warning: "Failed to prime node_modules"**
- Source repository may not have node_modules
- Run `npm install` in source repo first

**Performance: Slow workspace creation**
- Use SSD storage for best performance
- Ensure repos are on same filesystem as workspace

## FAQ

**Q: Can I use this with private repositories?**
A: Yes, works with any local git repository regardless of remote origin.

**Q: What happens to uncommitted changes?**
A: Worktrees are isolated - changes in source repos don't affect workspace.

**Q: Can I modify files in the workspace?**
A: Yes, worktrees are full working directories with independent git status.

**Q: How do I update dependencies in workspace?**
A: Run package manager commands in specific repo: `cd repos/frontend && npm install`

**Q: Can I push changes from workspace?**
A: Yes, each worktree can commit and push independently.

## License

MIT

## Contributing

Issues and PRs welcome! This tool is designed to be simple and focused.