import { resolve, join } from 'path';
import { readJson, writeFile } from 'fs-extra';
import { execa } from 'execa';
import { ensureWorkspaceSkeleton, primeNodeModules, copyEnvFiles } from './fsops.js';
import { addWorktree } from './git.js';
import { detectPM } from './pm.js';
import { ui } from './ui.js';
import type { RepoPick, RepoMounted } from './types.js';

/**
 * Creates a complete workspace with worktrees for selected repositories
 * This is the core orchestration function that ties together all our modules
 */
export async function createWorkspace(repoPicks: RepoPick[]): Promise<{
  wsDir: string;
  mounted: RepoMounted[];
}> {
  // Generate unique workspace name with timestamp
  const timestamp = Date.now().toString(36);
  const wsName = `ccws-${timestamp}`;
  const wsDir = resolve(wsName);
  
  ui.info(`Creating workspace: ${wsName}`);
  
  // Create workspace directory structure
  ui.info('Setting up workspace skeleton...');
  await ensureWorkspaceSkeleton(wsDir);
  
  // Mount each repository
  const mounted: RepoMounted[] = [];
  const totalRepos = repoPicks.length;
  
  for (let i = 0; i < repoPicks.length; i++) {
    const pick = repoPicks[i];
    const progress = `(${i + 1}/${totalRepos})`;
    
    ui.info(`${progress} Processing ${pick.alias}...`);
    
    try {
      const worktreePath = join(wsDir, 'repos', pick.alias);
      
      // Create worktree
      ui.info(`${progress} Creating worktree for ${pick.alias} (${pick.branch})...`);
      await addWorktree(pick.basePath, pick.branch, worktreePath);
      
      // Prime with dependencies (node_modules)
      ui.info(`${progress} Priming ${pick.alias} with dependencies...`);
      await primeNodeModules(pick.basePath, worktreePath);
      
      // Copy environment files
      ui.info(`${progress} Copying environment files for ${pick.alias}...`);
      await copyEnvFiles(pick.basePath, worktreePath);
      
      // Detect package manager
      const packageManager = detectPM(worktreePath);
      ui.success(`${progress} ${pick.alias} mounted successfully (${packageManager})`);
      
      // Add to mounted repos
      mounted.push({
        ...pick,
        worktreePath,
        packageManager
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ui.error(`${progress} Failed to mount ${pick.alias}: ${errorMessage}`);
      
      // For now, we'll continue with other repos even if one fails
      // In a production version, we might want to offer options like retry or skip
      ui.warning(`Skipping ${pick.alias} and continuing with remaining repositories...`);
    }
  }
  
  if (mounted.length === 0) {
    throw new Error('No repositories were successfully mounted');
  }
  
  if (mounted.length < repoPicks.length) {
    const failed = repoPicks.length - mounted.length;
    ui.warning(`Warning: ${failed} repository(ies) failed to mount`);
  }
  
  ui.success(`✓ Workspace created with ${mounted.length} repository(ies): ${wsDir}`);
  
  return { wsDir, mounted };
}

/**
 * Generates CLAUDE.md via Claude CLI with factpack creation and streaming support
 * Creates factpack files for each repo and invokes Claude CLI with graceful fallbacks
 */
export async function generateClaudeMd(
  wsDir: string, 
  repos: RepoMounted[]
): Promise<void> {
  ui.info('Creating factpack files for repositories...');
  
  // Create factpacks for each repo
  for (const repo of repos) {
    try {
      const pkg = await readJson(
        join(repo.worktreePath, 'package.json')
      );
      
      const facts = [
        `Alias: ${repo.alias}`,
        `Package: ${pkg.name || 'unknown'}`,
        `Branch: ${repo.branch}`,
        `PM: ${repo.packageManager}`,
        'Scripts:',
        ...Object.keys(pkg.scripts || {}).map(s => `  - ${s}`)
      ];
      
      await writeFile(
        join(repo.worktreePath, '.factpack.txt'),
        facts.join('\n')
      );
      
      ui.info(`✓ Created factpack for ${repo.alias}`);
    } catch (error) {
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
    
    // Try to use @agent-io/stream if available
    let streamHandler: { push: (data: string) => void } | null = null;
    try {
      // Dynamic import with proper error handling for optional dependency
      // Use Function constructor to avoid TypeScript module resolution at compile time
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const agentIoModule = await dynamicImport('@agent-io/stream').catch(() => null);
      
      if (agentIoModule && typeof agentIoModule.createStreamRenderer === 'function') {
        const renderer = agentIoModule.createStreamRenderer({
          onText: (t: string) => process.stdout.write(t)
        });
        
        if (renderer && typeof renderer.push === 'function') {
          streamHandler = renderer;
          child.stdout?.on('data', (buf: Buffer) => {
            renderer.push(buf.toString());
          });
          ui.info('Using @agent-io/stream for enhanced output rendering');
        } else {
          throw new Error('Invalid renderer object');
        }
      } else {
        throw new Error('Agent IO stream not available');
      }
    } catch {
      // Fallback: pipe directly to stdout
      child.stdout?.pipe(process.stdout);
      ui.info('Using direct output streaming (fallback mode)');
    }
    
    // Send prompt to Claude CLI
    child.stdin?.write(prompt);
    child.stdin?.end();
    
    // Wait for completion and save result
    const { stdout } = await child;
    await writeFile(join(wsDir, 'CLAUDE.md'), stdout);
    ui.success('✓ CLAUDE.md generated successfully via Claude CLI');
    
  } catch (error) {
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