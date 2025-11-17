# Claude Code Workspace Manager API Documentation

This document provides comprehensive documentation for the Claude Code Workspace Manager API, including all public interfaces, types, and usage patterns.

## Table of Contents

- [Core API](#core-api)
- [Types and Interfaces](#types-and-interfaces)
- [CLI Interface](#cli-interface)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Core API

### `createWorkspace(repoPicks: RepoPick[])`

Creates a complete workspace with worktrees for selected repositories.

**Parameters:**
- `repoPicks: RepoPick[]` - Array of repository configurations to process

**Returns:**
- `Promise<{ wsDir: string; mounted: RepoMounted[]; }>`
  - `wsDir` - Absolute path to the created workspace directory
  - `mounted` - Array of successfully mounted repository configurations

**Throws:**
- `Error` - When no repositories are successfully mounted
- `Error` - When workspace directory creation fails

**Features:**
- Parallel repository processing for optimal performance
- Automatic dependency priming via APFS clones or rsync fallback
- Environment file copying (.env*) for configuration consistency
- Package manager detection (npm/yarn/pnpm)
- Comprehensive error handling with partial failure support

```typescript
import { createWorkspace } from './src/workspace.js';

const repoPicks = [
  { alias: 'frontend', basePath: '/path/to/frontend', branch: 'main' },
  { alias: 'backend', basePath: '/path/to/backend', branch: 'develop' }
];

const { wsDir, mounted } = await createWorkspace(repoPicks);
console.log(`Workspace created at: ${wsDir}`);
console.log(`${mounted.length} repositories mounted successfully`);
```

### `generateClaudeMd(wsDir: string, repos: RepoMounted[])`

Generates a comprehensive CLAUDE.md workspace guide using Claude CLI.

**Parameters:**
- `wsDir: string` - Absolute path to workspace directory
- `repos: RepoMounted[]` - Array of mounted repository configurations

**Returns:**
- `Promise<void>` - Resolves when CLAUDE.md is created

**Features:**
- Creates .factpack.txt files for each repository with metadata
- Invokes Claude CLI with workspace-specific prompts
- Supports @agent-io/stream for enhanced output rendering
- Provides fallback template if Claude CLI unavailable
- Graceful error handling without throwing

```typescript
import { generateClaudeMd } from './src/workspace.js';

await generateClaudeMd('/path/to/workspace', mounted);
// Creates comprehensive workspace guide at workspace/CLAUDE.md
```

### `getUserSelections()`

Interactive prompt flow to gather user repository selections and configurations.

**Returns:**
- `Promise<RepoPick[]>` - Array of configured repository picks

**Throws:**
- `UserCancelledError` - When user cancels operation via Ctrl+C or ESC
- `Error` - When no git repositories found in base directory
- `Error` - When user selects no repositories

**Features:**
- Repository discovery with security measures
- Interactive alias and branch configuration
- Comprehensive validation (format, uniqueness, existence)
- Configuration summary and confirmation
- Graceful cancellation handling

```typescript
import { getUserSelections, UserCancelledError } from './src/prompts.js';

try {
  const selections = await getUserSelections();
  console.log(`User selected ${selections.length} repositories`);
} catch (error) {
  if (error instanceof UserCancelledError) {
    console.log('User cancelled the operation');
  } else {
    console.error('Selection failed:', error.message);
  }
}
```

### `generateRootPackageJson(wsDir: string, mounted: RepoMounted[])`

Generates unified package.json with orchestration scripts for all repositories.

**Parameters:**
- `wsDir: string` - Absolute path to workspace directory  
- `mounted: RepoMounted[]` - Array of mounted repository configurations

**Returns:**
- `Promise<void>` - Resolves when package.json is written

**Features:**
- Individual repository scripts (`{alias}:{command}`)
- Combined orchestration scripts (`dev`, `build:all`, `test:all`)
- Package manager awareness (npm/yarn/pnpm)
- Concurrently integration for parallel execution
- Workspace metadata storage

```typescript
import { generateRootPackageJson } from './src/package.js';

await generateRootPackageJson('/path/to/workspace', mounted);
// Creates package.json with comprehensive script orchestration
```

### `discoverRepos(baseDir: string)`

Safely discovers git repositories within a specified base directory.

**Parameters:**
- `baseDir: string` - Base directory path to search for repositories

**Returns:**
- `Promise<string[]>` - Array of absolute repository paths

**Throws:**
- `Error` - When directory doesn't exist or isn't accessible
- `Error` - When path traversal attack is detected

**Security Features:**
- Path sanitization and validation
- Directory traversal attack prevention
- Symlink traversal protection
- Depth limiting to prevent infinite recursion
- Permission error handling

```typescript
import { discoverRepos } from './src/git.js';

const repos = await discoverRepos('/Users/dev/projects');
console.log(`Found ${repos.length} repositories`);
```

## Types and Interfaces

### `RepoPick`

Repository selection and configuration from user input.

```typescript
type RepoPick = {
  /** User-friendly name for the repository (used for scripts and directories) */
  alias: string;
  /** Absolute path to the original repository on disk */
  basePath: string;
  /** Git branch to checkout in the worktree */
  branch: string;
};
```

### `RepoMounted`

Successfully mounted repository with workspace context.

```typescript
type RepoMounted = RepoPick & {
  /** Absolute path to the repository worktree within the workspace */
  worktreePath: string;
  /** Package manager detected in the repository (npm/yarn/pnpm) */
  packageManager: 'npm' | 'yarn' | 'pnpm';
};
```

### `UserCancelledError`

Custom error class for user-initiated cancellation events.

```typescript
class UserCancelledError extends Error {
  constructor(message?: string);
}
```

## CLI Interface

### Command Line Usage

```bash
# Interactive workspace creation
ccws

# Show help information  
ccws --help
ccws -h

# Show version information
ccws --version
ccws -v
```

### Environment Variables

- `CLAUDE_CLI_ARGS` - Additional arguments passed to Claude CLI invocation

### Exit Codes

- `0` - Success or user-initiated cancellation
- `1` - Error (configuration failure, no repositories found, etc.)

## Configuration

### Requirements

- **macOS 10.13+** - Uses APFS clones (cp -c) with rsync fallback
- **Git 2.20+** - Required for worktree support
- **Node.js 18+** - ES modules and modern JavaScript features
- **Claude CLI** - Must be installed and configured for CLAUDE.md generation

### Optional Dependencies

- `@agent-io/stream` - Enhanced output rendering for Claude CLI integration

### Directory Structure

Generated workspaces follow this structure:

```
ccws-{timestamp}/
├── CLAUDE.md              # Generated workspace guide
├── package.json           # Unified orchestration scripts
└── repos/                 # Repository worktrees
    ├── {alias1}/          # Individual repository worktrees
    │   ├── .factpack.txt  # Repository metadata
    │   └── ...            # Repository files
    └── {alias2}/
        └── ...
```

## Error Handling

### Error Categories

1. **User Cancellation** (`UserCancelledError`)
   - Exit code: 0
   - Triggered by: Ctrl+C, ESC, explicit cancellation
   - Handling: Graceful shutdown with user feedback

2. **Configuration Errors** (`Error`)
   - Exit code: 1
   - Examples: No repositories found, invalid paths, permission issues
   - Handling: Contextual error messages with troubleshooting guidance

3. **Runtime Errors** (`Error`)
   - Exit code: 1
   - Examples: Git operations failed, file system errors
   - Handling: Partial failure support, detailed error reporting

### Error Handling Best Practices

```typescript
import { createWorkspace, UserCancelledError } from './dist/index.js';

try {
  const result = await createWorkspace(repoPicks);
  // Handle success
} catch (error) {
  if (error instanceof UserCancelledError) {
    // User cancelled - exit gracefully
    console.log('Operation cancelled by user');
    process.exit(0);
  } else if (error.message.includes('No repositories were successfully mounted')) {
    // No repositories mounted - critical failure
    console.error('Workspace creation failed: No repositories could be mounted');
    process.exit(1);  
  } else {
    // Other errors - provide context
    console.error('Workspace creation failed:', error.message);
    process.exit(1);
  }
}
```

## Examples

### Basic Programmatic Usage

```typescript
import { getUserSelections, createWorkspace, generateRootPackageJson, generateClaudeMd } from 'cc-workspace-manager';

async function createMyWorkspace() {
  try {
    // 1. Get user selections interactively
    const selections = await getUserSelections();
    
    // 2. Create workspace with selected repositories  
    const { wsDir, mounted } = await createWorkspace(selections);
    
    // 3. Generate package.json with orchestration scripts
    await generateRootPackageJson(wsDir, mounted);
    
    // 4. Generate CLAUDE.md workspace guide
    await generateClaudeMd(wsDir, mounted);
    
    console.log(`✅ Workspace ready: ${wsDir}`);
    return { wsDir, mounted };
    
  } catch (error) {
    if (error instanceof UserCancelledError) {
      console.log('👋 Operation cancelled');
      return null;
    }
    throw error;
  }
}
```

### Programmatic Repository Selection

```typescript
import { createWorkspace } from 'cc-workspace-manager';

// Skip interactive prompts with predefined selections
const predefinedSelections = [
  {
    alias: 'ui',
    basePath: '/Users/dev/projects/react-app', 
    branch: 'feature/new-design'
  },
  {
    alias: 'api', 
    basePath: '/Users/dev/projects/express-server',
    branch: 'main'
  }
];

const { wsDir, mounted } = await createWorkspace(predefinedSelections);
```

### Custom Package Manager Integration

```typescript
import { pmRun } from './src/pm.js';

// Generate package manager commands
const npmCommand = pmRun('npm', 'frontend', 'dev');
// Result: "npm --prefix ./repos/frontend run dev"

const yarnCommand = pmRun('yarn', 'backend', 'build');  
// Result: "yarn --cwd ./repos/backend build"

const pnpmCommand = pmRun('pnpm', 'shared', 'test');
// Result: "pnpm -C ./repos/shared test"
```

### Advanced Configuration

```typescript
// Environment variable configuration
process.env.CLAUDE_CLI_ARGS = '--model claude-3-sonnet --stream';

// Optional dependency detection
try {
  const stream = await import('@agent-io/stream');
  console.log('Enhanced streaming available');
} catch {
  console.log('Using fallback output mode');
}
```

---

## Migration Guide

When upgrading between versions, refer to the [CHANGELOG.md](./CHANGELOG.md) for breaking changes and migration guidance.

## Contributing

For API changes and extensions, please ensure:
1. Comprehensive JSDoc documentation
2. Type safety with TypeScript strict mode
3. Test coverage for new functionality
4. Security review for input handling
5. Backward compatibility considerations