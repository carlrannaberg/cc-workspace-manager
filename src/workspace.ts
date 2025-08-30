import { resolve, join } from 'path';
import fs from 'fs-extra';
const { readJson, writeFile } = fs;
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execa } from 'execa';
import { spawn } from 'child_process';
import { ensureWorkspaceSkeleton, primeNodeModules, copyEnvFiles } from './fsops.js';
import { addWorktree } from './git.js';
import { detectPM } from './pm.js';
import { ui } from './ui.js';
import { SecurityValidator, ErrorUtils } from './utils/security.js';
import { EnvironmentUtils } from './utils/environment.js';
import type { RepoPick, RepoMounted } from './types.js';


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
export async function createWorkspace(repoPicks: RepoPick[]): Promise<{
  wsDir: string;
  mounted: RepoMounted[];
}> {
  // Generate unique workspace name with timestamp
  const timestamp = Date.now().toString(36);
  const wsName = `ccws-${timestamp}`;
  const wsDir = SecurityValidator.validatePath(wsName);
  
  ui.info(`Creating workspace: ${wsName}`);
  
  // Create workspace directory structure
  ui.info('Setting up workspace skeleton...');
  await ensureWorkspaceSkeleton(wsDir);
  
  // Mount repositories in parallel for better performance
  const totalRepos = repoPicks.length;
  ui.info(`Processing ${totalRepos} repository(ies) in parallel...`);
  
  const mountPromises = repoPicks.map(async (pick): Promise<RepoMounted | null> => {
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
      } else if (primingResult.method === 'rsync') {
        ui.info(`Dependencies for ${pick.alias} primed via rsync (slower)`);
      } else if (primingResult.method === 'skipped') {
        if (primingResult.error) {
          ui.warning(`Dependency priming failed for ${pick.alias}`);
        } else {
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
      
    } catch (error) {
      const errorMessage = ErrorUtils.extractErrorMessage(error);
      ui.error(`Failed to mount ${pick.alias}: ${errorMessage}`);
      ui.warning(`Skipping ${pick.alias} and continuing with remaining repositories...`);
      return null;
    }
  });
  
  // Wait for all repositories to be processed with progress tracking
  const results: PromiseSettledResult<RepoMounted | null>[] = [];
  let completedCount = 0;
  
  // Process repositories with progress tracking
  for (const promise of mountPromises) {
    const result = await promise.then(
      (value): PromiseSettledResult<RepoMounted | null> => ({ status: 'fulfilled', value }),
      (reason): PromiseSettledResult<RepoMounted | null> => ({ status: 'rejected', reason })
    );
    
    results.push(result);
    completedCount++;
    
    // Show progress
    ui.progress(completedCount, totalRepos, 'repositories processed');
  }
  
  // Collect successfully mounted repositories
  const mounted: RepoMounted[] = [];
  let failedCount = 0;
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value !== null) {
      mounted.push(result.value);
    } else {
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
 * Creates .factpack.txt files in each repository with metadata for Claude CLI.
 * 
 * Factpack files contain repository information that helps Claude generate
 * better workspace documentation by providing context about each repository.
 * 
 * @param repos - Array of mounted repository configurations
 * @returns Promise that resolves when all factpacks are created
 */
async function createFactpackFiles(repos: RepoMounted[]): Promise<void> {
  ui.info('Creating factpack files for repositories...');
  
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
      ui.warning(`Failed to create factpack for ${repo.alias}: ${ErrorUtils.extractErrorMessage(error)}`);
    }
  }
}

/**
 * Package.json structure for repository information
 */
interface PackageJsonInfo {
  name?: string;
  description?: string;
  version?: string;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Repository content structure for prompt generation
 */
interface RepoContent {
  alias: string;
  claudeMd?: string;
  packageJson?: PackageJsonInfo;
  readme?: string;
}

/**
 * Reads repository documentation content for prompt generation.
 * 
 * Priority order:
 * 1. CLAUDE.md - Primary AI guidance file
 * 2. AGENTS.md - Alternative AI guidance file  
 * 3. package.json + README.md - Fallback project information
 * 
 * @param repo - Repository configuration
 * @returns Content object with available documentation
 */
async function getRepoContent(repo: RepoMounted): Promise<RepoContent> {
  const result: RepoContent = { alias: repo.alias };

  try {
    // First try to read CLAUDE.md
    const claudeMdPath = join(repo.worktreePath, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      result.claudeMd = await readFile(claudeMdPath, 'utf-8');
    } else {
      // Second try: check for AGENTS.md
      const agentsMdPath = join(repo.worktreePath, 'AGENTS.md');
      if (existsSync(agentsMdPath)) {
        result.claudeMd = await readFile(agentsMdPath, 'utf-8');
      } else {
        // Fallback: read package.json and README.md
        const packageJsonPath = join(repo.worktreePath, 'package.json');
        if (existsSync(packageJsonPath)) {
          result.packageJson = await readJson(packageJsonPath);
        }

        // Try common README variations
        const readmeVariants = ['README.md', 'readme.md', 'Readme.md', 'README.txt'];
        for (const variant of readmeVariants) {
          const readmePath = join(repo.worktreePath, variant);
          if (existsSync(readmePath)) {
            result.readme = await readFile(readmePath, 'utf-8');
            break;
          }
        }
      }
    }
  } catch (error) {
    ui.warning(`Failed to read content for ${repo.alias}: ${ErrorUtils.extractErrorMessage(error)}`);
  }

  return result;
}

/**
 * Generates the prompt text for Claude CLI workspace documentation.
 * 
 * @param repos - Array of mounted repository configurations
 * @returns Formatted prompt string for Claude CLI
 */
async function generateWorkspacePrompt(repos: RepoMounted[]): Promise<string> {
  // Gather content from all repositories
  const repoContents = await Promise.all(repos.map(getRepoContent));
  
  let prompt = `Create a consolidated CLAUDE.md workspace guide by combining the information below.

WORKSPACE OVERVIEW:
This workspace contains ${repos.length} repository(ies) with the following structure:
${repos.map(r => `- ${r.alias}: ${r.branch} (${r.packageManager})`).join('\n')}

REPOSITORY DETAILS:

`;

  // Add content for each repository
  for (const content of repoContents) {
    prompt += `## ${content.alias.toUpperCase()}\n\n`;
    
    if (content.claudeMd) {
      // Use existing AI guidance documentation (CLAUDE.md or AGENTS.md)
      prompt += `### Existing AI Guidance:\n\`\`\`markdown\n${content.claudeMd}\n\`\`\`\n\n`;
    } else {
      // Use package.json and README as fallback
      if (content.packageJson) {
        prompt += `### Package Info:\n`;
        prompt += `- Name: ${content.packageJson.name}\n`;
        prompt += `- Description: ${content.packageJson.description || 'No description'}\n`;
        prompt += `- Version: ${content.packageJson.version}\n`;
        
        if (content.packageJson.scripts) {
          prompt += `- Scripts: ${Object.keys(content.packageJson.scripts).join(', ')}\n`;
        }
        prompt += `\n`;
      }
      
      if (content.readme) {
        // Truncate README to first 500 characters to keep prompt manageable
        const truncatedReadme = content.readme.length > 500 
          ? content.readme.substring(0, 500) + '...' 
          : content.readme;
        prompt += `### README Content:\n\`\`\`markdown\n${truncatedReadme}\n\`\`\`\n\n`;
      }
    }
  }

  prompt += `
CONSOLIDATION REQUIREMENTS:
- Create a single workspace CLAUDE.md that consolidates all repository information
- Include available npm commands for each repo (npm run <alias>:*)
- Explain how to start development mode for the entire workspace
- Describe each repository's purpose and responsibilities
- Keep the output under 100 lines
- Use clear, concise language
- Format as proper Markdown

Generate the consolidated CLAUDE.md content now:`;

  return prompt;
}

/**
 * Generates fallback CLAUDE.md template when Claude CLI is unavailable.
 * 
 * @param repos - Array of mounted repository configurations
 * @returns Markdown content for fallback template
 */
function generateFallbackTemplate(repos: RepoMounted[]): string {
  return `# Claude Code Workspace

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
}

/**
 * Configuration options for Claude CLI execution
 */
interface ClaudeCliOptions {
  streaming?: boolean;
  timeout?: number;
  args: string[];
}

/**
 * Result of Claude CLI execution attempt
 */
interface ClaudeCliResult {
  success: boolean;
  output?: string;
  error?: string;
  method: 'streaming' | 'direct' | 'failed';
}

/**
 * Executes Claude CLI with streaming support using secure process piping
 */
async function executeClaudeCliWithStreaming(prompt: string, options: ClaudeCliOptions): Promise<ClaudeCliResult> {
  const baseArgs = ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...options.args];
  const timeout = options.timeout || 300000;

  // Spawn Claude CLI process
  const claudeProcess = spawn('claude', baseArgs, {
    stdio: ['ignore', 'pipe', 'inherit']
  });
  
  // Spawn @agent-io/stream process to consume Claude's output
  const streamProcess = spawn('npx', ['-y', '@agent-io/stream'], {
    stdio: [claudeProcess.stdout, 'pipe', 'inherit']
  });
  
  // Set up timeout handling
  const timeoutHandle = setTimeout(() => {
    claudeProcess.kill('SIGTERM');
    streamProcess.kill('SIGTERM');
  }, timeout);
  
  // Collect output from stream process
  let stdout = '';
  streamProcess.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  
  try {
    // Wait for both processes to complete
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        claudeProcess.on('close', (code: number | null) => {
          if (code === 0) resolve();
          else reject(new Error(`Claude CLI exited with code ${code}`));
        });
        claudeProcess.on('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        streamProcess.on('close', (code: number | null) => {
          clearTimeout(timeoutHandle);
          if (code === 0) resolve();
          else reject(new Error(`Stream process exited with code ${code}`));
        });
        streamProcess.on('error', reject);
      })
    ]);

    return {
      success: true,
      output: stdout,
      method: 'streaming'
    };
    
  } catch (error) {
    clearTimeout(timeoutHandle);
    return {
      success: false,
      error: ErrorUtils.extractErrorMessage(error),
      method: 'failed'
    };
  }
}

/**
 * Executes Claude CLI directly without streaming
 */
async function executeClaudeCliDirect(prompt: string, options: ClaudeCliOptions): Promise<ClaudeCliResult> {
  const args = ['-p', prompt, ...options.args];
  const timeout = options.timeout || 300000;

  try {
    const { stdout } = await execa('claude', args, {
      timeout,
      shell: false
    });

    return {
      success: true,
      output: stdout,
      method: 'direct'
    };
    
  } catch (error) {
    return {
      success: false,
      error: ErrorUtils.extractErrorMessage(error),
      method: 'failed'
    };
  }
}

/**
 * Attempts to generate CLAUDE.md using Claude CLI with fallback strategy.
 * 
 * @param prompt - The prompt to send to Claude CLI
 * @param wsDir - Workspace directory to save the output
 * @returns Promise that resolves to true if successful, false if failed
 */
async function tryClaudeCliGeneration(prompt: string, wsDir: string): Promise<boolean> {
  // Skip Claude CLI entirely in test environment to avoid timeouts and complexity
  if (EnvironmentUtils.isTestEnvironment()) {
    ui.info(`Test environment detected (${EnvironmentUtils.getEnvironmentDescription()}); skipping Claude CLI generation`);
    return false;
  }

  const timeoutMs = Number(process.env.CCWS_CLAUDE_TIMEOUT_MS) || 300000;
  
  // Sanitize and validate CLAUDE_CLI_ARGS to prevent injection
  const sanitizedArgs = SecurityValidator.sanitizeCliArgs(process.env.CLAUDE_CLI_ARGS);
  
  const options: ClaudeCliOptions = {
    streaming: true,
    timeout: timeoutMs,
    args: sanitizedArgs
  };

  // First attempt: Streaming
  ui.info('Running Claude CLI with streaming support...');
  const streamingResult = await executeClaudeCliWithStreaming(prompt, options);
  
  if (streamingResult.success && streamingResult.output) {
    await writeFile(join(wsDir, 'CLAUDE.md'), streamingResult.output);
    ui.success('✓ CLAUDE.md generated successfully via Claude CLI with streaming');
    return true;
  }

  // Handle streaming-specific failures with actionable guidance
  const errorMessage = streamingResult.error?.toLowerCase() || '';
  
  if (errorMessage.includes('timed out')) {
    const timeoutMinutes = Math.floor(timeoutMs / 60000);
    ui.warning(`Claude CLI timed out after ${timeoutMinutes} minutes. Consider increasing CCWS_CLAUDE_TIMEOUT_MS or check your network connection. Using fallback template.`);
    return false;
  }

  if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
    ui.warning('Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-cli');
    ui.info('Alternatively, set Claude CLI in PATH or use fallback template generation.');
  } else if (errorMessage.includes('permission denied') || errorMessage.includes('eacces')) {
    ui.warning('Permission denied accessing Claude CLI. Check file permissions or run with appropriate privileges.');
  } else if (errorMessage.includes('network') || errorMessage.includes('connect')) {
    ui.warning('Network error with Claude CLI. Check your internet connection and try again.');
  } else {
    ui.warning(`Streaming failed: ${SecurityValidator.sanitizeErrorMessage(streamingResult.error || 'Unknown error')}`);
  }

  // Fallback: Direct execution without streaming
  ui.info('Attempting direct Claude CLI execution without streaming...');
  options.streaming = false;
  const directResult = await executeClaudeCliDirect(prompt, options);
  
  if (directResult.success && directResult.output) {
    await writeFile(join(wsDir, 'CLAUDE.md'), directResult.output);
    ui.success('✓ CLAUDE.md generated successfully via Claude CLI (non-streaming)');
    return true;
  }

  // Both methods failed - provide comprehensive troubleshooting guidance
  const fallbackError = directResult.error?.toLowerCase() || '';
  
  if (fallbackError.includes('command not found') || fallbackError.includes('not found')) {
    ui.error('❌ Claude CLI not found on system');
    ui.info('💡 Install Claude CLI: npm install -g @anthropic-ai/claude-cli');
    ui.info('💡 Or add Claude CLI to your PATH environment variable');
  } else if (fallbackError.includes('authentication') || fallbackError.includes('unauthorized') || fallbackError.includes('api key')) {
    ui.error('❌ Claude CLI authentication failed');
    ui.info('💡 Configure authentication: claude auth login');
    ui.info('💡 Or set ANTHROPIC_API_KEY environment variable');
  } else if (fallbackError.includes('network') || fallbackError.includes('connect') || fallbackError.includes('timeout')) {
    ui.error('❌ Network connectivity issues');
    ui.info('💡 Check your internet connection');
    ui.info('💡 Try again later or increase timeout with CCWS_CLAUDE_TIMEOUT_MS');
  } else if (fallbackError.includes('rate limit') || fallbackError.includes('quota')) {
    ui.error('❌ API rate limit or quota exceeded');
    ui.info('💡 Wait a few minutes and try again');
    ui.info('💡 Check your Claude CLI usage limits');
  } else {
    ui.warning(`Claude CLI failed completely: ${SecurityValidator.sanitizeErrorMessage(directResult.error || 'Unknown error')}`);
    ui.info('💡 Using fallback template generation instead');
  }
  
  return false;
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
export async function generateClaudeMd(
  wsDir: string, 
  repos: RepoMounted[]
): Promise<void> {
  // Step 1: Create factpack files for each repository
  await createFactpackFiles(repos);

  // Step 2: Generate the prompt for Claude CLI
  const prompt = await generateWorkspacePrompt(repos);

  // Step 3: Attempt to generate using Claude CLI
  ui.info('Generating CLAUDE.md via Claude CLI (streaming)...');
  const success = await tryClaudeCliGeneration(prompt, wsDir);

  // Step 4: Use fallback template if Claude CLI failed
  if (!success) {
    const fallback = generateFallbackTemplate(repos);
    await writeFile(join(wsDir, 'CLAUDE.md'), fallback);
    ui.success('✓ CLAUDE.md created with fallback template');
  }
}
