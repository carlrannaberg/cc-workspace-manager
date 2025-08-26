# AGENTS.md
This file provides guidance to AI coding assistants working in this repository.

**Note:** CLAUDE.md, .clinerules, .cursorrules, .windsurfrules, .replit.md, GEMINI.md, .github/copilot-instructions.md, and .idx/airules.md are symlinks to AGENTS.md in this project.

# cc-workspace-manager

A macOS CLI tool that generates disposable Claude Code workspaces by orchestrating multiple git repositories using worktrees, with automatic dependency priming and Claude integration.

**Current Status**: Pre-implementation planning phase with comprehensive specifications and task breakdown ready for development.

## Build & Commands

**IMPORTANT**: This project is currently in the planning phase. No package.json exists yet, so no build commands are available.

### Planned Commands (After Implementation)
Based on specifications in `specs/feat-ccws-cli-workspace-generator-v2.md`:

**Development:**
- `npm run build` - TypeScript compilation to dist/
- `npm run dev` - Development mode with source maps  
- `npm run prepublishOnly` - Pre-publish build

**Testing:** (Planned)
- `npm test` - Run unit tests with Vitest
- `npm run test:integration` - Integration tests
- `npm run test:watch` - Watch mode for testing

**Quality:** (Planned)
- `npm run lint` - ESLint code quality checks
- `npm run typecheck` - TypeScript type checking
- `npm run format` - Prettier code formatting

**CLI Usage:** (After Global Install)
- `ccws` - Interactive workspace generator
- Environment variable: `CLAUDE_CLI_ARGS` - Customize Claude CLI flags

### Script Command Consistency
**Important**: When implementing package.json scripts, ensure all references are updated in:
- Task breakdown in `specs/feat-ccws-cli-workspace-generator-v2-tasks.md`
- Implementation phases and acceptance criteria
- Future GitHub Actions workflows
- README documentation

## Code Style

### Language & Framework
- **TypeScript 5.5.4+** with strict mode enabled
- **ES2022 target** with ES modules (import/export)
- **Node.js 18+** runtime with ES module support

### File Organization
```
src/
├── index.ts        # CLI entrypoint with shebang
├── git.ts          # Git worktree operations  
├── pm.ts           # Package manager detection
├── fsops.ts        # File system operations
└── types.ts        # TypeScript type definitions
```

### Import Conventions
- Use ES module imports: `import { func } from './module.js'`
- Include `.js` extensions for local imports (ESM requirement)
- Group imports: Node.js built-ins → npm packages → local modules

### TypeScript Patterns
- Export types with `export type` keyword
- Use union types for package managers: `'npm' | 'yarn' | 'pnpm'`
- Extend types with intersection: `RepoMounted = RepoPick & { ... }`
- Enable strict mode for type safety

### Naming Conventions
- **Files**: kebab-case for CLI tools (`feat-ccws-cli-workspace-generator.md`)
- **Functions**: camelCase (`discoverRepos`, `generateClaudeMd`)
- **Types**: PascalCase (`RepoPick`, `RepoMounted`)
- **Constants**: SCREAMING_SNAKE_CASE for environment variables

### Error Handling Patterns
- Use `try/catch` with informative error messages
- Exit with proper codes: 0 for success, 1 for errors
- Provide actionable error suggestions
- Log warnings but continue execution where appropriate

### CLI Patterns
- Shebang: `#!/usr/bin/env node`
- Use picocolors for terminal output
- Graceful handling of user cancellation (Ctrl+C)
- Clear success/failure feedback

## Testing

### Framework & Setup
- **Primary**: Vitest (planned)
- **Test Files**: `tests/*.test.ts`
- **Integration**: Real git operations in temporary directories
- **Mocking**: Mock Claude CLI for consistent tests

### Testing Philosophy
**When tests fail, fix the code, not the test.**

Key principles:
- **Tests should be meaningful** - Validate actual functionality, not implementation details
- **Test real scenarios** - Use temporary git repos for integration tests
- **Failing tests are valuable** - They reveal bugs and missing features
- **Fix the root cause** - Address underlying issues, don't hide failing tests
- **Test edge cases** - Handle missing files, network failures, permission issues
- **Document test purpose** - Each test explains why it exists and what it validates

### Test Patterns
```typescript
// Unit test example
test('detects yarn from yarn.lock', () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-'));
  writeFileSync(join(dir, 'yarn.lock'), '');
  expect(detectPM(dir)).toBe('yarn');
});

// Integration test with cleanup
test('creates complete workspace', async () => {
  const testRepo = await createTestRepo();
  const { wsDir } = await createWorkspace([{...}]);
  
  expect(existsSync(join(wsDir, 'CLAUDE.md'))).toBe(true);
  
  // Always cleanup
  await execa('rm', ['-rf', testRepo, wsDir]);
});
```

### Test Execution Guidelines
- Use temporary directories for file system tests
- Always cleanup test artifacts
- Mock external dependencies (Claude CLI)
- Test both success and error scenarios

## Security

### macOS-Specific Considerations
- **Hardlink operations**: Use `cp -al` for same-filesystem performance
- **Path validation**: Prevent directory traversal attacks
- **Environment files**: Copy `.env*` files, never symlink
- **Git isolation**: Workspace root is never a git repository

### Data Protection
- **Secret isolation**: `.env` files stay local to workspace
- **No credential commits**: Workspace root excludes secrets via `.gitignore`
- **Process isolation**: Use execa for safe command execution
- **Permission handling**: Check write permissions before operations

### Git Security
- **Worktree isolation**: Changes in source repos don't affect workspace
- **Fetch safety**: Handle offline scenarios gracefully
- **Branch validation**: Verify branch exists before creating worktree

## Architecture & Implementation

### Core Philosophy
- **Unix philosophy**: Do one thing well (generate workspaces quickly)
- **Disposable workspaces**: Temporary environments, not permanent
- **Resource efficiency**: Git worktrees share objects (90% disk savings)
- **Zero configuration**: Auto-detect package managers and settings

### Key Design Decisions
1. **Git worktrees** over full clones for disk efficiency
2. **Hardlinked node_modules** for instant dependency access
3. **Package manager detection** from lockfiles and package.json
4. **macOS-first** with platform-specific optimizations
5. **Claude CLI integration** for automatic documentation generation

### Performance Targets
- Complete workspace creation in <60 seconds
- Hardlink node_modules in <1 second vs 10+ for copy
- Support 3+ repositories in single workspace

## Configuration

### Environment Variables
- `CLAUDE_CLI_ARGS` - Custom flags for Claude CLI invocation
- Standard Node.js environment variables

### System Requirements
- **macOS** (uses `cp -al`, `rsync`, `ditto`)
- **Git 2.20+** for worktree support
- **Node.js 18+** for ES modules
- **Claude CLI** installed and configured

### Development Setup (Planned)
```bash
# After implementation
npm install
npm run build
npm link  # For global CLI access
```

## Directory Structure & File Organization

### Reports Directory
ALL project reports and documentation should be saved to the `reports/` directory:

```
cc-workspace-manager/
├── reports/              # All project reports and documentation
│   └── *.md             # Various report types
├── temp/                # Temporary files and debugging
├── specs/               # Technical specifications
│   ├── feat-ccws-cli-workspace-generator-v2.md
│   └── feat-ccws-cli-workspace-generator-v2-tasks.md
└── [implementation directories when created]
```

### Report Generation Guidelines
**Important**: ALL reports should be saved to the `reports/` directory with descriptive names:

**Implementation Reports:**
- Phase validation: `PHASE_X_VALIDATION_REPORT.md`
- Implementation summaries: `IMPLEMENTATION_SUMMARY_[FEATURE].md`
- Feature completion: `FEATURE_[NAME]_REPORT.md`

**Testing & Analysis Reports:**
- Test results: `TEST_RESULTS_[DATE].md`
- Coverage reports: `COVERAGE_REPORT_[DATE].md`
- Performance analysis: `PERFORMANCE_ANALYSIS_[SCENARIO].md`
- Security scans: `SECURITY_SCAN_[DATE].md`

**Quality & Validation:**
- Code quality: `CODE_QUALITY_REPORT.md`
- Dependency analysis: `DEPENDENCY_REPORT.md`
- API compatibility: `API_COMPATIBILITY_REPORT.md`

### Temporary Files & Debugging
All temporary files should be organized in the `/temp` directory:
- Debug scripts: `temp/debug-*.js`
- Test artifacts: `temp/test-results/`
- Generated files: `temp/generated/`
- Include `/temp/` in `.gitignore`

### Claude Code Settings (.claude Directory)

#### Version Controlled Files (commit these):
- `.claude/settings.json` - Shared team settings
- `.claude/agents/*.md` - 33 specialized AI agents available
- `.claude/commands/*.md` - Custom slash commands

#### Ignored Files (do NOT commit):
- `.claude/settings.local.json` - Personal preferences

## Git Workflow

### Commit Conventions
This project uses **Conventional Commits** format as documented in `CLAUDE.md`:
- Format: `<type>: <description>`
- Types: feat, fix, docs, style, refactor, test, chore
- Present tense, imperative mood
- Subject line under 50 characters

### Examples
```
feat: add comprehensive ccws CLI specification
docs: add commit conventions documentation  
fix: handle missing node_modules gracefully
test: add unit tests for package manager detection
```

## Agent Delegation & Tool Execution

### ⚠️ MANDATORY: Always Delegate to Specialists & Execute in Parallel

**This repository has 33 specialized AI agents available. You MUST use them instead of attempting tasks yourself.**

### Available AI Subagents (33 total)

#### Framework & Language Experts
- **TypeScript Experts** (3): `typescript-expert`, `typescript-build-expert`, `typescript-type-expert`
- **React Experts** (2): `react-expert`, `react-performance-expert`
- **Framework Specialists**: `nextjs-expert`, `nestjs-expert`
- **AI Integration**: `ai-sdk-expert`

#### Testing & Quality Assurance (5)
- **Testing Frameworks**: `testing-expert`, `jest-testing-expert`, `vitest-testing-expert`
- **End-to-End**: `e2e-playwright-expert`
- **Code Quality**: `code-review-expert`, `refactoring-expert`, `linting-expert`

#### DevOps & Infrastructure (8)
- **CLI Development**: `cli-expert` ⭐ (Highly relevant for this project)
- **Version Control**: `git-expert` ⭐ (Critical for worktree operations)
- **Build Systems**: `build-tools-vite-expert`, `build-tools-webpack-expert`
- **Infrastructure**: `devops-expert`, `docker-expert`, `github-actions-expert`

#### Database & Backend (3)
- **Database Systems**: `database-expert`, `database-mongodb-expert`, `database-postgres-expert`
- **Backend Framework**: `nodejs-expert`

#### Frontend & User Experience (3)
- **Styling**: `frontend-css-styling-expert`
- **Accessibility**: `frontend-accessibility-expert`
- **Documentation**: `documentation-expert`

#### Specialized Utilities (11)
- **Code Analysis**: `code-search`, `triage-expert` 
- **Oracle**: `oracle` (General problem solving)
- **Temporary**: `test-integration-agent`

### Delegation Examples for This Project

```bash
# CLI development (use cli-expert)
Task: "Design command-line interface for ccws with @inquirer/prompts"

# Git worktree operations (use git-expert)  
Task: "Implement git worktree creation with branch validation and cleanup"

# TypeScript architecture (use typescript-expert)
Task: "Design TypeScript module structure for ESM CLI tool"

# Testing strategy (use testing-expert)
Task: "Create comprehensive testing strategy for CLI tool with file system operations"

# Documentation (use documentation-expert)
Task: "Generate user documentation for CLI tool installation and usage"
```

### Critical: Always Use Parallel Tool Calls

**Send all tool calls in a single message to execute them in parallel.**

**These cases MUST use parallel tool calls:**
- Multiple grep searches for different patterns
- Reading multiple specification files
- Combining agent delegation with file searches
- Any information gathering where you know what you're looking for upfront

**Planning Approach:**
1. Think: "What information do I need to complete this task?"
2. Identify relevant specialized agents
3. Send all Task calls for agent delegation in a single message
4. Execute all searches together rather than waiting for each result

**Performance Impact:** Parallel tool execution is 3-5x faster than sequential calls.

### Discovering More Agents
```bash
# List all available agents
claudekit list agents

# Get specific agent details  
claudekit show agent cli-expert
```

## Project Status & Next Steps

### Current Phase: Pre-Implementation
- ✅ Comprehensive specifications completed
- ✅ Task breakdown with 13 implementation tasks
- ✅ Over-engineering risks identified and scoped
- ✅ STM (Simple Task Master) tasks created
- 🎯 Ready for Phase 1: Foundation setup

### Implementation Phases
1. **Phase 1: Foundation** (3 tasks) - TypeScript setup, dependencies, types
2. **Phase 2: Core Modules** (3 tasks) - Git operations, package detection, file ops  
3. **Phase 3: Main Implementation** (5 tasks) - CLI, workspace creation, Claude integration
4. **Phase 4: Testing & Documentation** (3 tasks) - Tests, documentation

### Key Resources
- **Primary Spec**: `specs/feat-ccws-cli-workspace-generator-v2.md`
- **Task Breakdown**: `specs/feat-ccws-cli-workspace-generator-v2-tasks.md` 
- **Critical Analysis**: `specs/validation-report.md` (identifies over-engineering risks)

### Recommended Starting Points
1. **Use STM**: `stm list --status pending` to see implementation tasks
2. **Delegate to cli-expert**: For CLI design and @inquirer/prompts implementation
3. **Delegate to git-expert**: For worktree operations and git integration
4. **Start with Foundation**: Tasks 1-3 can begin implementation immediately

This project represents a well-planned, AI-first approach to creating development tooling with extensive documentation and a rich ecosystem of specialized agents to support implementation.