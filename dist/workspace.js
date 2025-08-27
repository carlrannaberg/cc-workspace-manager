import { resolve, join } from 'path';
import fs from 'fs-extra';
const { readJson, writeFile } = fs;
import { execa } from 'execa';
import { ensureWorkspaceSkeleton, primeNodeModules, copyEnvFiles } from './fsops.js';
import { addWorktree } from './git.js';
import { detectPM } from './pm.js';
import { ui } from './ui.js';
/**
 * Creates a complete workspace with worktrees for selected repositories.
 *
 * This is the core orchestration function that ties together all modules to:
 * - Generate a unique workspace directory with timestamp-based naming
 * - Create worktrees for each selected repository and branch
 * - Prime each worktree with dependencies (node_modules) from source repos
 * - Copy environment files (.env*) to maintain configuration consistency
 * - Detect package managers and configure workspace accordingly
 * - Process repositories in parallel for optimal performance
 *
 * @param repoPicks - Array of repository configurations to process
 * @param repoPicks[].alias - User-friendly name for the repository
 * @param repoPicks[].basePath - Absolute path to the source repository
 * @param repoPicks[].branch - Git branch to checkout in the worktree
 *
 * @returns Promise resolving to workspace creation result
 * @returns wsDir - Absolute path to the created workspace directory
 * @returns mounted - Array of successfully mounted repository configurations
 *
 * @throws {Error} When no repositories are successfully mounted
 * @throws {Error} When workspace directory creation fails
 * @throws {Error} When git operations fail for critical repositories
 *
 * @example
 * ```typescript
 * const repoPicks = [
 *   { alias: 'frontend', basePath: '/path/to/frontend', branch: 'main' },
 *   { alias: 'backend', basePath: '/path/to/backend', branch: 'develop' }
 * ];
 *
 * const { wsDir, mounted } = await createWorkspace(repoPicks);
 * console.log(`Workspace created at: ${wsDir}`);
 * console.log(`${mounted.length} repositories mounted successfully`);
 * ```
 */
export async function createWorkspace(repoPicks) {
    // Generate unique workspace name with timestamp
    const timestamp = Date.now().toString(36);
    const wsName = `ccws-${timestamp}`;
    const wsDir = resolve(wsName);
    ui.info(`Creating workspace: ${wsName}`);
    // Create workspace directory structure
    ui.info('Setting up workspace skeleton...');
    await ensureWorkspaceSkeleton(wsDir);
    // Mount repositories in parallel for better performance
    const totalRepos = repoPicks.length;
    ui.info(`Processing ${totalRepos} repository(ies) in parallel...`);
    const mountPromises = repoPicks.map(async (pick) => {
        try {
            const worktreePath = join(wsDir, 'repos', pick.alias);
            // Create worktree
            ui.info(`Creating worktree for ${pick.alias} (${pick.branch})...`);
            await addWorktree(pick.basePath, pick.branch, worktreePath);
            // Prime with dependencies (node_modules)
            ui.info(`Priming ${pick.alias} with dependencies...`);
            const primingResult = await primeNodeModules(pick.basePath, worktreePath);
            // Provide feedback on priming result
            if (primingResult.method === 'hardlink') {
                ui.info(`Dependencies for ${pick.alias} primed via hardlink (fast)`);
            }
            else if (primingResult.method === 'rsync') {
                ui.info(`Dependencies for ${pick.alias} primed via rsync (slower)`);
            }
            else if (primingResult.method === 'skipped') {
                if (primingResult.error) {
                    ui.warning(`Dependency priming failed for ${pick.alias}`);
                }
                else {
                    ui.info(`No node_modules found in ${pick.alias} source repository`);
                }
            }
            // Copy environment files
            ui.info(`Copying environment files for ${pick.alias}...`);
            await copyEnvFiles(pick.basePath, worktreePath);
            // Detect package manager
            const packageManager = detectPM(worktreePath);
            ui.success(`✓ ${pick.alias} mounted successfully (${packageManager})`);
            return {
                ...pick,
                worktreePath,
                packageManager
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            ui.error(`Failed to mount ${pick.alias}: ${errorMessage}`);
            ui.warning(`Skipping ${pick.alias} and continuing with remaining repositories...`);
            return null;
        }
    });
    // Wait for all repositories to be processed with progress tracking
    const results = [];
    let completedCount = 0;
    // Process repositories with progress tracking
    for (const promise of mountPromises) {
        const result = await promise.then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason }));
        results.push(result);
        completedCount++;
        // Show progress
        ui.progress(completedCount, totalRepos, 'repositories processed');
    }
    // Collect successfully mounted repositories
    const mounted = [];
    let failedCount = 0;
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value !== null) {
            mounted.push(result.value);
        }
        else {
            failedCount++;
            if (result.status === 'rejected') {
                const alias = repoPicks[index].alias;
                ui.error(`Unexpected error processing ${alias}: ${result.reason}`);
            }
        }
    });
    if (mounted.length === 0) {
        throw new Error('No repositories were successfully mounted');
    }
    if (failedCount > 0) {
        ui.warning(`Warning: ${failedCount} repository(ies) failed to mount`);
    }
    ui.success(`✓ Workspace created with ${mounted.length} repository(ies): ${wsDir}`);
    return { wsDir, mounted };
}
/**
 * Generates a comprehensive CLAUDE.md workspace guide using Claude CLI.
 *
 * This function creates factpack files for each repository and invokes the Claude CLI
 * to generate an intelligent workspace guide. It provides fallback template generation
 * if Claude CLI is unavailable and supports enhanced output streaming when possible.
 *
 * Process:
 * 1. Creates .factpack.txt files in each repository with metadata
 * 2. Invokes Claude CLI with workspace-specific prompt
 * 3. Attempts to use @agent-io/stream for enhanced output rendering
 * 4. Falls back to direct stdout piping if streaming unavailable
 * 5. Generates fallback template if Claude CLI fails completely
 *
 * @param wsDir - Absolute path to the workspace directory
 * @param repos - Array of mounted repository configurations
 * @param repos[].alias - Repository alias for display
 * @param repos[].branch - Active branch in the worktree
 * @param repos[].packageManager - Detected package manager (npm/yarn/pnpm)
 * @param repos[].worktreePath - Path to the repository worktree
 *
 * @returns Promise that resolves when CLAUDE.md is created
 *
 * @throws Does not throw - handles all errors gracefully with fallbacks
 *
 * @example
 * ```typescript
 * const repos = [
 *   { alias: 'frontend', branch: 'main', packageManager: 'npm', ... },
 *   { alias: 'backend', branch: 'develop', packageManager: 'yarn', ... }
 * ];
 *
 * await generateClaudeMd('/path/to/workspace', repos);
 * // Creates /path/to/workspace/CLAUDE.md with workspace guide
 * ```
 *
 * Environment Variables:
 * - `CLAUDE_CLI_ARGS` - Additional arguments passed to Claude CLI
 *
 * Dependencies:
 * - Claude CLI must be installed and configured
 * - `@agent-io/stream` (optional) for enhanced output rendering
 */
export async function generateClaudeMd(wsDir, repos) {
    ui.info('Creating factpack files for repositories...');
    // Create factpacks for each repo
    for (const repo of repos) {
        try {
            const pkg = await readJson(join(repo.worktreePath, 'package.json'));
            const facts = [
                `Alias: ${repo.alias}`,
                `Package: ${pkg.name || 'unknown'}`,
                `Branch: ${repo.branch}`,
                `PM: ${repo.packageManager}`,
                'Scripts:',
                ...Object.keys(pkg.scripts || {}).map(s => `  - ${s}`)
            ];
            await writeFile(join(repo.worktreePath, '.factpack.txt'), facts.join('\n'));
            ui.info(`✓ Created factpack for ${repo.alias}`);
        }
        catch (error) {
            ui.warning(`Failed to create factpack for ${repo.alias}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // Generate prompt for Claude CLI
    const prompt = `Generate a CLAUDE.md workspace guide.
  
Repos:
${repos.map(r => `- ${r.alias}: ${r.branch}`).join('\n')}

Include:
- Available commands (npm run <alias>:*)
- How to start dev mode
- Repo responsibilities
  
Keep it under 100 lines.`;
    ui.info('Generating CLAUDE.md via Claude CLI...');
    try {
        // Invoke Claude CLI with streaming
        const child = execa('claude', ['code', '--non-interactive'], {
            env: {
                ...process.env,
                ...(process.env.CLAUDE_CLI_ARGS ? {
                    CLAUDE_CLI_ARGS: process.env.CLAUDE_CLI_ARGS
                } : {})
            }
        });
        // Try to use @agent-io/stream if available with safe dynamic import
        let streamHandler = null;
        try {
            // Safe dynamic import for optional dependency - use string concatenation to avoid TypeScript static analysis
            const moduleName = '@agent-io' + '/' + 'stream';
            const agentIoModule = await import(moduleName).catch(() => null);
            if (agentIoModule?.createStreamRenderer && typeof agentIoModule.createStreamRenderer === 'function') {
                const renderer = agentIoModule.createStreamRenderer({
                    onText: (t) => process.stdout.write(t)
                });
                if (renderer && typeof renderer.push === 'function') {
                    streamHandler = renderer;
                    child.stdout?.on('data', (buf) => {
                        renderer.push(buf.toString());
                    });
                    ui.info('Using @agent-io/stream for enhanced output rendering');
                }
                else {
                    throw new Error('Invalid renderer object from @agent-io/stream');
                }
            }
            else {
                throw new Error('@agent-io/stream createStreamRenderer not available');
            }
        }
        catch (error) {
            // Fallback: pipe directly to stdout
            child.stdout?.pipe(process.stdout);
            ui.info(`Using direct output streaming (fallback mode): ${error instanceof Error ? error.message : 'Stream module unavailable'}`);
        }
        // Send prompt to Claude CLI
        child.stdin?.write(prompt);
        child.stdin?.end();
        // Wait for completion and save result
        const { stdout } = await child;
        await writeFile(join(wsDir, 'CLAUDE.md'), stdout);
        ui.success('✓ CLAUDE.md generated successfully via Claude CLI');
    }
    catch (error) {
        ui.warning('Claude CLI failed, using fallback template');
        // Fallback: write a basic template
        const fallback = `# Claude Code Workspace

## Repositories
${repos.map(r => `- **${r.alias}**: ${r.branch}`).join('\n')}

## Commands
Run from workspace root:
- \`npm run dev\` - Start all repos in dev mode
${repos.map(r => `- \`npm run ${r.alias}:dev\` - Start ${r.alias} only`).join('\n')}

## Getting Started
1. \`npm install\`
2. \`npm run dev\`

## Repository Details
${repos.map(r => `### ${r.alias}
- **Branch**: ${r.branch}
- **Package Manager**: ${r.packageManager}
- **Location**: repos/${r.alias}/
`).join('\n')}

*This file was generated using a fallback template due to Claude CLI unavailability.*
`;
        await writeFile(join(wsDir, 'CLAUDE.md'), fallback);
        ui.success('✓ CLAUDE.md created with fallback template');
    }
}
//# sourceMappingURL=workspace.js.map