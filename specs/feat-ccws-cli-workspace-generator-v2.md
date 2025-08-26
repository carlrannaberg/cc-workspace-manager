# ccws - Claude Code Workspace CLI Specification (Simplified)

## Status
Ready for Implementation

## Authors
Claude Assistant - August 26, 2025

## Overview
ccws is a macOS CLI tool that generates disposable Claude Code workspaces by orchestrating multiple git repositories using worktrees, priming them with dependencies, and automatically generating structured documentation via Claude CLI.

## Background/Problem Statement

Developers working with multi-repository architectures waste 15-30 minutes setting up temporary workspaces. The core problems are:

- **Manual setup overhead**: Cloning, installing deps, copying env files
- **Context switching**: Navigating between multiple repository directories
- **Claude Code context**: Needs structured documentation for optimal assistance
- **Disk waste**: Full clones for temporary work

## Goals

- Generate functional workspace in <60 seconds
- Zero manual setup after generation
- Single command interface for all repos
- Auto-generate CLAUDE.md via Claude CLI
- Minimal disk usage via git worktrees

## Non-Goals

- Cross-platform support (macOS only)
- Remote repository cloning
- Dependency conflict resolution
- Port conflict handling
- Cleanup/lifecycle management
- Config files or templates

## Technical Dependencies

### Required
- **@inquirer/prompts** (^7.0.0): Interactive selection
- **execa** (^9.3.0): Process execution
- **fs-extra** (^11.2.0): File operations
- **picocolors** (^1.0.0): Terminal colors
- **TypeScript** (^5.5.4): Type safety

### Optional
- **@agent-io/stream** (^0.2.0): JSONL streaming for Claude output

### System Requirements
- macOS (for `cp -al`, `rsync`, `ditto`)
- Git 2.20+ (worktree support)
- Node.js 18+ (ES modules)
- Claude CLI installed and configured

## Detailed Design

### File Structure (5 modules)
```
ccws/
  package.json
  tsconfig.json
  src/
    index.ts    # Main orchestration + package.json generation
    git.ts      # Worktree operations
    pm.ts       # Package manager detection
    fsops.ts    # File operations
    types.ts    # Type definitions
  README.md
```

### Core Types
```typescript
// types.ts
export type RepoPick = {
  alias: string;
  basePath: string;
  branch: string;
};

export type RepoMounted = RepoPick & {
  worktreePath: string;
  packageManager: 'npm'|'yarn'|'pnpm';
};
```

### Repository Discovery
```typescript
// git.ts - Using find instead of fd
export async function discoverRepos(baseDir: string) {
  const { stdout } = await execa('find', [
    baseDir, 
    '-maxdepth', '3',
    '-type', 'd',
    '-name', '.git',
    '-prune'
  ]);
  return stdout.split('\n')
    .filter(Boolean)
    .map(p => p.replace('/.git', ''));
}
```

### Package Manager Detection
```typescript
// pm.ts
export function detectPM(dir: string): 'npm'|'yarn'|'pnpm' {
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

export function pmRun(pm: string, alias: string, script: string) {
  switch(pm) {
    case 'yarn': return `yarn --cwd ./repos/${alias} ${script}`;
    case 'pnpm': return `pnpm -C ./repos/${alias} ${script}`;
    default: return `npm --prefix ./repos/${alias} run ${script}`;
  }
}
```

### Workspace Priming
```typescript
// fsops.ts
export async function primeNodeModules(src: string, dst: string) {
  const srcPath = join(src, 'node_modules');
  const dstPath = join(dst, 'node_modules');
  
  if (!existsSync(srcPath)) return;
  
  // Try hardlink first (fast), fallback to rsync
  try {
    await execa('cp', ['-al', srcPath, dstPath]);
  } catch {
    await execa('rsync', ['-a', `${srcPath}/`, `${dstPath}/`]);
  }
}

export async function copyEnvFiles(src: string, dst: string) {
  const { stdout } = await execa('find', [
    src, '-maxdepth', '1', '-name', '.env*', '-type', 'f'
  ]);
  
  for (const file of stdout.split('\n').filter(Boolean)) {
    await copyFile(file, join(dst, basename(file)));
  }
}
```

### Claude CLI Integration
```typescript
// index.ts - Simplified Claude integration
async function generateClaudeMd(wsDir: string, repos: RepoMounted[]) {
  // Create factpacks
  for (const repo of repos) {
    const pkg = await readJson(join(repo.worktreePath, 'package.json'));
    const facts = [
      `Alias: ${repo.alias}`,
      `Package: ${pkg.name}`,
      `Branch: ${repo.branch}`,
      `PM: ${repo.packageManager}`,
      'Scripts:',
      ...Object.keys(pkg.scripts || {}).map(s => `  - ${s}`)
    ];
    await writeFile(
      join(repo.worktreePath, '.factpack.txt'),
      facts.join('\n')
    );
  }

  // Generate prompt
  const prompt = `Generate a CLAUDE.md workspace guide.
  
Repos:
${repos.map(r => `- ${r.alias}: ${r.branch}`).join('\n')}

Include:
- Available commands (npm run <alias>:*)
- How to start dev mode
- Repo responsibilities
  
Keep it under 100 lines.`;

  // Invoke Claude CLI with streaming
  const child = execa('claude', ['code', '--non-interactive']);
  
  // Stream handling with @agent-io/stream if available
  try {
    const { createStreamRenderer } = await import('@agent-io/stream');
    const renderer = createStreamRenderer({
      onText: (t: string) => process.stdout.write(t)
    });
    child.stdout?.on('data', buf => renderer.push(buf.toString()));
  } catch {
    // Fallback: plain output
    child.stdout?.pipe(process.stdout);
  }
  
  child.stdin?.write(prompt);
  child.stdin?.end();
  
  const { stdout } = await child;
  await writeFile(join(wsDir, 'CLAUDE.md'), stdout);
}
```

### Main Flow
```typescript
// index.ts
async function main() {
  // 1. Get base directory
  const baseDir = await input({ 
    message: 'Base directory for repos',
    default: process.cwd() 
  });

  // 2. Discover repos
  const repos = await discoverRepos(baseDir);
  
  // 3. Select repos
  const selected = await checkbox({
    message: 'Select repositories',
    choices: repos.map(r => ({ 
      name: basename(r), 
      value: r 
    }))
  });

  // 4. Configure each repo
  const repoPicks: RepoPick[] = [];
  for (const repo of selected) {
    const alias = await input({ 
      message: `Alias for ${basename(repo)}`,
      default: basename(repo)
    });
    const branch = await input({
      message: `Branch for ${alias}`,
      default: await currentBranch(repo)
    });
    repoPicks.push({ alias, basePath: repo, branch });
  }

  // 5. Create workspace
  const wsName = `ccws-${Date.now().toString(36)}`;
  const wsDir = resolve(wsName);
  
  await ensureDir(join(wsDir, 'repos'));
  await writeFile(join(wsDir, '.gitignore'), 'repos/\nnode_modules/');

  // 6. Mount worktrees and prime
  const mounted: RepoMounted[] = [];
  for (const pick of repoPicks) {
    const worktreePath = join(wsDir, 'repos', pick.alias);
    
    // Create worktree
    await execa('git', [
      '-C', pick.basePath, 
      'worktree', 'add', 
      worktreePath, pick.branch
    ]);
    
    // Prime with deps and env
    await primeNodeModules(pick.basePath, worktreePath);
    await copyEnvFiles(pick.basePath, worktreePath);
    
    mounted.push({
      ...pick,
      worktreePath,
      packageManager: detectPM(worktreePath)
    });
  }

  // 7. Generate root package.json
  const scripts: Record<string, string> = {};
  for (const repo of mounted) {
    for (const cmd of ['dev', 'build', 'test', 'lint']) {
      scripts[`${repo.alias}:${cmd}`] = pmRun(
        repo.packageManager, 
        repo.alias, 
        cmd
      );
    }
  }
  
  scripts.dev = `concurrently ${mounted
    .map(r => `"npm run ${r.alias}:dev"`)
    .join(' ')}`;

  await writeJson(join(wsDir, 'package.json'), {
    name: 'cc-workspace',
    private: true,
    scripts,
    devDependencies: { concurrently: '^9.0.0' }
  });

  // 8. Generate CLAUDE.md via CLI
  await generateClaudeMd(wsDir, mounted);

  // 9. Success output
  console.log(green(`✓ Workspace ready: ${wsDir}`));
  console.log('\nNext steps:');
  console.log(`  cd ${wsName}`);
  console.log('  npm install');
  console.log('  npm run dev');
}

main().catch(console.error);
```

## User Experience

1. Run `ccws`
2. Enter base directory
3. Select repos via checkbox
4. Set alias and branch for each
5. Wait ~20 seconds
6. Get workspace path with next steps

## Testing Strategy

### Critical Tests Only

```typescript
// git.test.ts
test('creates worktree successfully', async () => {
  await addWorktree(testRepo, 'main', tmpDir);
  expect(existsSync(join(tmpDir, '.git'))).toBe(true);
});

// pm.test.ts  
test('detects package managers correctly', () => {
  expect(detectPM(yarnRepo)).toBe('yarn');
  expect(detectPM(pnpmRepo)).toBe('pnpm');
  expect(detectPM(npmRepo)).toBe('npm');
});

// Integration test
test('generates complete workspace', async () => {
  const result = await runCLI(testRepos);
  expect(existsSync(join(result.path, 'CLAUDE.md'))).toBe(true);
  expect(existsSync(join(result.path, 'package.json'))).toBe(true);
});
```

## Performance Considerations

- Hardlinks for node_modules: <1s vs 10s+ copy
- Parallel worktree creation where possible
- Stream Claude output to show progress

## Security Considerations

- Workspace root is never a git repo (prevents secret commits)
- Environment files copied, not symlinked
- All paths properly escaped via execa

## Documentation

### README.md
```markdown
# ccws

Quick multi-repo workspace generator for Claude Code.

## Install
npm install -g ccws

## Usage
ccws

Follow prompts to:
1. Select repos
2. Choose branches  
3. Get workspace path

## Requirements
- macOS
- Git 2.20+
- Node.js 18+
- Claude CLI
```

## Implementation Checklist

- [ ] Core modules (5 files)
- [ ] Interactive prompts
- [ ] Git worktree creation
- [ ] Dependency priming
- [ ] Environment file copying
- [ ] Root package.json generation
- [ ] Claude CLI integration with streaming
- [ ] Basic tests
- [ ] README documentation

## Open Questions

1. **Claude CLI flags**: Different versions may need different flags
   - Solution: Environment variable `CLAUDE_CLI_ARGS` for overrides

2. **Hardlink failures**: Cross-filesystem operations will fail
   - Solution: Automatic fallback to rsync

3. **Dirty worktrees**: Existing changes block worktree creation
   - Solution: Clear error message with cleanup instructions

## References

- [Git Worktree Docs](https://git-scm.com/docs/git-worktree)
- [@inquirer/prompts](https://github.com/SBoudrias/Inquirer.js)
- [@agent-io/stream](https://github.com/agent-io/stream)
- [execa](https://github.com/sindresorhus/execa)