# ccws - Claude Code Workspace CLI Specification [SUPERSEDED]

> **Note**: This specification has been superseded by the simplified MVP version.  
> See: `feat-ccws-cli-workspace-generator-v2.md`

## Status
Superseded - See V2

## Authors
Claude Assistant - August 26, 2025

## Overview
ccws is a macOS-optimized CLI tool that generates disposable Claude Code workspaces by orchestrating multiple git repositories using worktrees, priming them with dependencies and environment files, creating unified command interfaces, and automatically generating structured documentation for Claude Code assistance.

## Background/Problem Statement

Developers working with multi-repository architectures face significant friction when creating temporary development environments:

- **Setup Overhead**: Manually cloning repos, installing dependencies, and configuring environments takes 15-30 minutes per workspace
- **Context Loss**: Switching between repositories requires mental context switching and directory navigation
- **Environment Drift**: Different branches may have different dependency versions, causing subtle bugs
- **Documentation Gap**: Claude Code needs structured context about the workspace to provide optimal assistance
- **Resource Waste**: Full clones consume disk space unnecessarily when only specific branches are needed

The problem is particularly acute for:
- Microservices architectures with 3+ interdependent repositories
- Full-stack applications split across frontend/backend/shared repos
- Temporary feature development requiring isolated environments
- Quick debugging sessions across multiple services

## Goals

- **Rapid Workspace Creation**: Generate a fully functional workspace in <60 seconds
- **Zero Manual Setup**: Automatically detect and configure package managers, dependencies, and environment files
- **Unified Interface**: Single root-level command interface for all repository operations
- **Claude Code Optimization**: Auto-generate structured CLAUDE.md with workspace context
- **Resource Efficiency**: Use git worktrees to minimize disk usage while maintaining isolation
- **Cross-Package Manager Support**: Handle npm, yarn, and pnpm repositories in the same workspace
- **Security by Design**: Never create git repos at workspace root to prevent accidental secret commits

## Non-Goals

- **Cross-platform support**: Initial version is macOS-only (uses `cp -al`, `rsync`, `ditto`)
- **Remote repository cloning**: Assumes local clones already exist
- **Dependency resolution**: Does not solve version conflicts between repositories
- **Production deployment**: This is a development-time tool only
- **Repository discovery beyond filesystem**: No GitHub/GitLab API integration
- **Automatic port conflict resolution**: Users must handle port conflicts manually
- **Windows/Linux compatibility**: Platform-specific commands require porting

## Technical Dependencies

### Required Dependencies
- **@inquirer/prompts** (^7.0.0): Interactive CLI prompts for repository selection
- **execa** (^9.3.0): Process execution with proper escaping and streaming
- **fs-extra** (^11.2.0): Enhanced filesystem operations
- **picocolors** (^1.0.0): Terminal output styling
- **TypeScript** (^5.5.4): Type safety and modern JavaScript features

### Optional Dependencies
- **@agent-io/stream** (^0.2.0): JSONL streaming for Claude Code output (graceful fallback)

### System Requirements
- **macOS**: For hardlink/rsync/ditto commands
- **Git 2.20+**: Worktree support
- **Node.js 18+**: ES modules and modern APIs
- **Claude CLI**: Local installation configured

## Detailed Design

### Architecture Overview

```
┌─────────────────┐
│   User Input    │
│  (inquirer)     │
└────────┬────────┘
         │
┌────────▼────────┐
│ Repo Discovery  │
│   (git.ts)      │
└────────┬────────┘
         │
┌────────▼────────┐
│ Workspace Setup │
│  (fsops.ts)     │
└────────┬────────┘
         │
    ┌────┴────┬─────────┬──────────┐
    │         │         │          │
┌───▼──┐ ┌───▼──┐ ┌────▼────┐ ┌───▼──┐
│ Git  │ │ Node │ │ Package │ │Claude│
│Trees │ │Modules│ │  JSON   │ │ MD   │
└──────┘ └──────┘ └─────────┘ └──────┘
```

### Module Structure

#### `src/types.ts`
Core type definitions:
- `RepoPick`: User-selected repository configuration
- `RepoMounted`: Repository with workspace paths and detected package manager

#### `src/git.ts`
Git operations wrapper:
- `currentBranch()`: Get active branch name
- `listLocalRepos()`: Find git repositories in filesystem
- `addWorktree()`: Create lightweight worktree for branch

#### `src/pm.ts`
Package manager detection and command generation:
- `detectPM()`: Identify npm/yarn/pnpm from lockfiles and package.json
- `pmRun()`: Generate package manager-specific run commands

#### `src/fsops.ts`
Filesystem operations optimized for macOS:
- `ensureWorkspaceSkeleton()`: Create directory structure
- `primeNodeModules()`: Hardlink or copy node_modules for fast startup
- `copyEnvFiles()`: Transfer .env* files to worktrees

#### `src/pkggen.ts`
Root package.json generation:
- Creates unified script interface mapping `<alias>:<command>` to repo-specific commands
- Adds concurrently for parallel execution

#### `src/claude.ts`
Claude Code integration:
- `writeFactpacks()`: Extract repository metadata (ports, env vars, scripts)
- `generateClaudeMd()`: Invoke Claude CLI to generate structured documentation
- Stream handling with optional @agent-io/stream support

#### `src/index.ts`
Main orchestration:
1. Prompt for base directory
2. Discover repositories
3. Select and configure repos
4. Create workspace structure
5. Mount worktrees
6. Prime dependencies
7. Generate documentation
8. Output workspace path

### Data Flow

1. **Discovery Phase**
   ```
   User Input → fd/find → Git repos list → Interactive selection
   ```

2. **Setup Phase**
   ```
   Selected repos → Worktree creation → Dependency priming → Env copying
   ```

3. **Generation Phase**
   ```
   Mounted repos → Factpack extraction → Claude invocation → CLAUDE.md
   ```

### File Layout

Generated workspace structure:
```
ccws-xyz123/
├── .gitignore        # Excludes repos/* and node_modules
├── package.json      # Root command interface
├── CLAUDE.md         # Auto-generated workspace guide
├── README.txt        # Quick start instructions
└── repos/
    ├── frontend/     # Worktree of frontend repo
    ├── backend/      # Worktree of backend repo
    └── shared/       # Worktree of shared lib
```

## User Experience

### Interactive Flow

1. **Launch**: `ccws` command starts interactive session
2. **Discovery**: User provides base directory for repository search
3. **Selection**: Multi-select checkbox UI for choosing repositories
4. **Configuration**: For each repo:
   - Set alias (default: directory name)
   - Choose branch (default: current branch)
5. **Workspace Naming**: Optional custom name or auto-generated
6. **Generation**: Progress indicators during setup
7. **Completion**: Clear next steps displayed

### Command Interface

From workspace root:
```bash
# Install root dependencies
npm i

# Start all repos in dev mode
npm run dev

# Run specific repo commands
npm run frontend:build
npm run backend:test
npm run shared:lint
```

### Error Recovery

- **Missing repos**: Clear error message with path
- **Worktree conflicts**: Automatic cleanup attempt
- **Permission issues**: Helpful sudo hints
- **Claude CLI failures**: Fallback to template CLAUDE.md

## Testing Strategy

### Unit Tests

**Package Manager Detection** (`pm.test.ts`)
```typescript
// Test: Correctly identifies yarn from yarn.lock
// Purpose: Ensures yarn projects are handled with correct commands
test('detects yarn from lockfile', () => {
  mockFs({ 'yarn.lock': '' });
  expect(detectPM('/test')).toBe('yarn');
});

// Test: Falls back to npm when no indicators present
// Purpose: Validates default behavior for ambiguous projects
test('defaults to npm without lockfiles', () => {
  expect(detectPM('/empty')).toBe('npm');
});
```

**Command Generation** (`pm.test.ts`)
```typescript
// Test: Generates correct yarn command with --cwd
// Purpose: Ensures commands execute in correct directory
test('generates yarn commands correctly', () => {
  expect(pmRun('yarn', 'fe', 'dev')).toBe('yarn --cwd ./repos/fe dev');
});
```

### Integration Tests

**Worktree Creation** (`git.integration.test.ts`)
```typescript
// Test: Successfully creates worktree for existing branch
// Purpose: Validates core git functionality works as expected
test('creates worktree for branch', async () => {
  const testRepo = await createTestRepo();
  await addWorktree(testRepo, 'main', '/tmp/worktree');
  expect(fs.existsSync('/tmp/worktree/.git')).toBe(true);
});

// Test: Handles missing branches gracefully
// Purpose: Ensures error handling for invalid branch names
test('fails gracefully on missing branch', async () => {
  await expect(addWorktree('/repo', 'nonexistent', '/tmp/wt'))
    .rejects.toThrow(/branch .* not found/);
});
```

**Hardlink Performance** (`fsops.integration.test.ts`)
```typescript
// Test: Hardlinks are faster than copies for large node_modules
// Purpose: Validates performance optimization actually works
test('hardlink faster than copy for 100MB+ node_modules', async () => {
  const start = Date.now();
  await primeNodeModules(largeRepo, worktree);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(1000); // Should complete in <1s
});
```

### E2E Tests

**Full Workspace Creation** (`e2e/workspace.test.ts`)
```typescript
// Test: Complete workspace generation with multiple repos
// Purpose: Validates entire user flow from start to finish
test('creates functional workspace', async () => {
  const result = await runCLI(['--base', '/repos', '--auto-select']);
  const workspace = result.workspacePath;
  
  // Verify structure
  expect(fs.existsSync(`${workspace}/repos/frontend`)).toBe(true);
  expect(fs.existsSync(`${workspace}/package.json`)).toBe(true);
  expect(fs.existsSync(`${workspace}/CLAUDE.md`)).toBe(true);
  
  // Test commands work
  const { stdout } = await execa('npm', ['run', 'frontend:build'], {
    cwd: workspace
  });
  expect(stdout).toContain('Build successful');
});
```

### Mocking Strategy

- **Git operations**: Mock execa calls for deterministic testing
- **Filesystem**: Use memfs for unit tests, real temp dirs for integration
- **Claude CLI**: Mock with pre-generated responses for consistent tests
- **User input**: Inject answers programmatically via inquirer mocks

## Performance Considerations

### Optimization Strategies

1. **Hardlink node_modules** (<100ms vs 10s+ for copy)
   - Fallback to rsync if cross-filesystem
   - Skip if source doesn't exist

2. **Parallel Operations**
   - Worktree creation can be parallelized
   - Factpack generation runs concurrently

3. **Lazy Dependency Installation**
   - Prime from existing node_modules
   - Only install if lockfiles differ significantly

4. **Streaming Claude Output**
   - @agent-io/stream provides real-time feedback
   - Prevents perceived hang during generation

### Resource Usage

- **Disk Space**: Worktrees share git objects (90% savings vs clones)
- **Memory**: Streaming prevents large buffer accumulation
- **CPU**: Git operations are I/O bound, not CPU intensive

### Benchmarks

Target performance for 3-repo workspace:
- Discovery: <2s
- Worktree creation: <5s total
- Dependency priming: <3s with hardlinks
- Documentation generation: <10s
- **Total: <20s from launch to ready**

## Security Considerations

### Design Decisions

1. **No Git at Root**: Workspace root is never a git repository
   - Prevents accidental commits of .env files
   - Secrets stay local to workspace

2. **Environment File Handling**
   - Copied, never symlinked (prevents source modification)
   - Explicit .gitignore for safety

3. **Command Injection Protection**
   - All paths properly escaped with shell quotes
   - No user input directly in shell commands

4. **Claude CLI Isolation**
   - Runs with current user permissions only
   - Input via stdin, not command arguments

### Security Checklist

- ✅ No credentials in generated files
- ✅ Shell injection prevented via execa
- ✅ Workspace isolation from source repos
- ✅ No network operations (local only)
- ✅ Clear security warnings in README

## Documentation

### User Documentation (README.md)
- Installation instructions
- Quick start guide
- Common use cases with examples
- Troubleshooting section
- Platform-specific notes

### CLAUDE.md Template
- Workspace scope and rules
- Repository aliases and structure
- Available commands
- Service ports and environment variables
- Quick facts per repository

### Developer Documentation
- Architecture overview
- Module descriptions
- Extension points for customization
- Platform porting guide

## Implementation Phases

### Phase 1: MVP/Core Functionality
- ✅ Basic repository discovery using filesystem search
- ✅ Interactive selection with @inquirer/prompts
- ✅ Git worktree creation and mounting
- ✅ Package manager detection (npm/yarn/pnpm)
- ✅ Root package.json generation with unified commands
- ✅ Basic CLAUDE.md generation
- ✅ macOS-specific optimizations (hardlinks)

### Phase 2: Enhanced Features
- Improved repository discovery (config file support)
- Smart branch suggestions based on recent activity
- Dependency version conflict detection
- Port conflict detection and suggestions
- Progress indicators with time estimates
- Workspace templates for common setups
- Cleanup command to remove old workspaces

### Phase 3: Polish and Optimization
- Cross-platform support (Linux, WSL)
- Advanced caching strategies
- Incremental workspace updates
- Integration with VS Code and other editors
- Workspace sharing via config export
- Performance profiling and optimization
- Comprehensive test coverage (>80%)

## Open Questions

1. **Claude CLI Variability**: How to handle different Claude CLI versions/flags?
   - Consider environment variable for CLI path
   - Runtime detection of available flags

2. **Cross-filesystem Hardlinks**: Best fallback strategy?
   - Benchmark rsync vs ditto vs cp on various systems
   - Consider pnpm's symlink approach

3. **Port Conflict Resolution**: Should we auto-assign alternate ports?
   - Could modify .env files but adds complexity
   - Maybe just detect and warn?

4. **Workspace Lifecycle**: Should we track/cleanup old workspaces?
   - Could add `ccws list` and `ccws clean` commands
   - Store metadata in ~/.ccws/workspaces.json

5. **Repository Discovery**: Should we support GitHub/GitLab API?
   - Would enable remote repository support
   - Adds authentication complexity

## References

### External Documentation
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [@inquirer/prompts API](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/prompts)
- [execa Process Management](https://github.com/sindresorhus/execa)
- [fs-extra Enhanced File Operations](https://github.com/jprichardson/node-fs-extra)

### Related Projects
- [Lerna](https://lerna.js.org/) - Monorepo management tool
- [Nx](https://nx.dev/) - Monorepo build system
- [Rush](https://rushjs.io/) - Scalable monorepo manager

### Design Patterns
- Command Pattern: Unified interface for heterogeneous operations
- Factory Pattern: Package manager detection and command generation
- Template Method: Factpack generation and processing
- Strategy Pattern: Platform-specific filesystem operations

### Implementation Notes
- Prefer composition over inheritance in module design
- Use TypeScript strict mode for type safety
- Follow Node.js best practices for CLI tools
- Maintain backward compatibility for workspace format