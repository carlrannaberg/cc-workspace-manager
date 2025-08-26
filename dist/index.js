#!/usr/bin/env node
import { getUserSelections, handlePromptError } from './prompts.js';
import { createWorkspace, generateClaudeMd } from './workspace.js';
import { generateRootPackageJson } from './package.js';
import { ui } from './ui.js';
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
 * Handle all types of errors in a consistent manner
 */
function handleError(error) {
    if (error instanceof Error) {
        handlePromptError(error);
        // handlePromptError should exit, but ensure we never return
        process.exit(1);
    }
    else {
        ui.error(`❌ Unexpected error: ${error}`);
        process.exit(1);
    }
}
async function main() {
    try {
        // Start with CLI header
        ui.header('🚀 Claude Code Workspace Generator\n');
        // Phase 1: Get user selections
        const repoPicks = await getUserSelections();
        displayRepositorySelection(repoPicks);
        // Phase 2: Create workspace and mount repositories
        const { wsDir, mounted } = await createWorkspace(repoPicks);
        // Phase 3: Generate configuration files
        await generateRootPackageJson(wsDir, mounted);
        await generateClaudeMd(wsDir, mounted);
        // Phase 4: Show success and next steps
        displaySuccessMessage(wsDir, mounted);
    }
    catch (error) {
        handleError(error);
    }
}
// Export main function for testing
export { main };
// Run if executed directly
main();
//# sourceMappingURL=index.js.map