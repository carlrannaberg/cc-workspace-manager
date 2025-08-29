#!/usr/bin/env node
import { getUserSelections, handlePromptError } from './prompts.js';
import { createWorkspace, generateClaudeMd } from './workspace.js';
import { generateRootPackageJson } from './package.js';
import { ui } from './ui.js';
import { ErrorUtils } from './utils/security.js';
import { EnvironmentUtils } from './utils/environment.js';
import fs from 'fs-extra';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// Get package.json for version info
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
/**
 * Display repository selection summary to user
 */
function displayRepositorySelection(repoPicks) {
    ui.setupComplete();
    ui.showSelectedRepos();
    repoPicks.forEach((pick) => {
        ui.selectedRepoItem(pick.alias, pick.branch, pick.basePath);
    });
    console.log(); // Add spacing
}
/**
 * Display success message and next steps to user
 */
function displaySuccessMessage(wsDir, mounted) {
    console.log();
    ui.success(`🎉 Workspace ready: ${wsDir}`);
    ui.info('✨ Generated CLAUDE.md for optimal Claude Code assistance');
    ui.info('\n📝 Next steps:');
    console.log(`  cd ${wsDir}`);
    console.log('  npm install');
    console.log('  npm run dev');
    // Show available commands
    console.log();
    ui.info('💡 Available commands:');
    console.log('  npm run dev         - Start all repos in dev mode');
    console.log('  npm run build:all   - Build all repos');
    console.log('  npm run test:all    - Test all repos');
    mounted.forEach(repo => {
        console.log(`  npm run ${repo.alias}:dev    - Start ${repo.alias} only`);
    });
}
/**
 * Display help information
 */
function showHelp() {
    console.log(`
ccws - Claude Code Workspace Generator v${pkg.version}

Usage:
  ccws                  Start interactive workspace creation
  ccws --help, -h       Show this help message
  ccws --version, -v    Show version information

Environment Variables:
  CLAUDE_CLI_ARGS       Custom flags for Claude CLI invocation

Requirements:
  - macOS (uses cp -al, rsync)
  - Git 2.20+ (worktree support)
  - Node.js 18+ (ES modules)
  - Claude CLI installed and configured

Documentation:
  https://github.com/carlrannaberg/cc-workspace-manager
`);
}
/**
 * Display version information
 */
function showVersion() {
    console.log(`ccws v${pkg.version}`);
}
/**
 * Handle all types of errors in a consistent manner
 */
function handleError(error) {
    // Check if we are in test environment
    const isTest = EnvironmentUtils.isTestEnvironment();
    if (error instanceof Error) {
        handlePromptError(error);
        // handlePromptError should exit, but ensure we never return
        if (isTest) {
            throw new Error('Process exited with code 1');
        }
        process.exit(1);
    }
    else {
        ui.error(`❌ Unexpected error: ${error}`);
        if (isTest) {
            throw new Error('Process exited with code 1');
        }
        process.exit(1);
    }
}
async function main() {
    // Handle command line arguments
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }
    if (args.includes('--version') || args.includes('-v')) {
        showVersion();
        process.exit(0);
    }
    // If unknown arguments are provided, show help
    const validArgs = ['--help', '-h', '--version', '-v'];
    const unknownArgs = args.filter(arg => !validArgs.includes(arg));
    if (unknownArgs.length > 0) {
        console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
        showHelp();
        process.exit(1);
    }
    let workspaceCreated = false;
    let wsDir = '';
    let mounted = [];
    try {
        // Start with CLI header
        ui.header('🚀 Claude Code Workspace Generator\n');
        // Phase 1: Get user selections
        const repoPicks = await getUserSelections();
        displayRepositorySelection(repoPicks);
        // Phase 2: Create workspace and mount repositories
        const result = await createWorkspace(repoPicks);
        wsDir = result.wsDir;
        mounted = result.mounted;
        workspaceCreated = true;
        // Phase 3: Generate configuration files (non-critical - workspace still usable if these fail)
        try {
            await generateRootPackageJson(wsDir, mounted);
        }
        catch (error) {
            ui.warning(`Failed to generate package.json: ${ErrorUtils.extractErrorMessage(error)}`);
            ui.info('You can manually create package.json later if needed');
        }
        try {
            await generateClaudeMd(wsDir, mounted);
        }
        catch (error) {
            ui.warning(`Failed to generate CLAUDE.md: ${ErrorUtils.extractErrorMessage(error)}`);
            ui.info('You can manually create CLAUDE.md later if needed');
        }
        // Phase 4: Show success and next steps
        displaySuccessMessage(wsDir, mounted);
    }
    catch (error) {
        // Clean up partial workspace on critical failures
        if (workspaceCreated && wsDir && mounted.length === 0) {
            try {
                ui.info('Cleaning up empty workspace...');
                await fs.rm(wsDir, { recursive: true, force: true });
                ui.info(`Cleaned up workspace: ${wsDir}`);
            }
            catch (cleanupError) {
                ui.warning(`Failed to cleanup workspace: ${ErrorUtils.extractErrorMessage(cleanupError)}`);
            }
        }
        else if (workspaceCreated && wsDir && mounted.length > 0) {
            ui.info(`Partial workspace preserved at: ${wsDir} (${mounted.length} repo(s) mounted)`);
        }
        handleError(error);
    }
}
// Export main function for testing
export { main };
// Run if executed directly (but not in tests)
if (!EnvironmentUtils.isTestEnvironment()) {
    main();
}
//# sourceMappingURL=index.js.map