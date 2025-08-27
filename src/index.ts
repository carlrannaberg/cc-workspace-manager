#!/usr/bin/env node

import { getUserSelections, handlePromptError } from './prompts.js';
import { createWorkspace, generateClaudeMd } from './workspace.js';
import { generateRootPackageJson } from './package.js';
import { ui } from './ui.js';
import fs from 'fs-extra';
import type { RepoPick, RepoMounted } from './types.js';

/**
 * Display repository selection summary to user
 */
function displayRepositorySelection(repoPicks: RepoPick[]): void {
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
function displaySuccessMessage(wsDir: string, mounted: RepoMounted[]): void {
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
function handleError(error: unknown): never {
  if (error instanceof Error) {
    handlePromptError(error);
    // handlePromptError should exit, but ensure we never return
    process.exit(1);
  } else {
    ui.error(`❌ Unexpected error: ${error}`);
    process.exit(1);
  }
}

async function main() {
  let workspaceCreated = false;
  let wsDir = '';
  let mounted: RepoMounted[] = [];
  
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
    } catch (error) {
      ui.warning(`Failed to generate package.json: ${error instanceof Error ? error.message : String(error)}`);
      ui.info('You can manually create package.json later if needed');
    }
    
    try {
      await generateClaudeMd(wsDir, mounted);
    } catch (error) {
      ui.warning(`Failed to generate CLAUDE.md: ${error instanceof Error ? error.message : String(error)}`);
      ui.info('You can manually create CLAUDE.md later if needed');
    }
    
    // Phase 4: Show success and next steps
    displaySuccessMessage(wsDir, mounted);
    
  } catch (error) {
    // Clean up partial workspace on critical failures
    if (workspaceCreated && wsDir && mounted.length === 0) {
      try {
        ui.info('Cleaning up empty workspace...');
        await fs.rm(wsDir, { recursive: true, force: true });
        ui.info(`Cleaned up workspace: ${wsDir}`);
      } catch (cleanupError) {
        ui.warning(`Failed to cleanup workspace: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    } else if (workspaceCreated && wsDir && mounted.length > 0) {
      ui.info(`Partial workspace preserved at: ${wsDir} (${mounted.length} repo(s) mounted)`);
    }
    
    handleError(error);
  }
}

// Export main function for testing
export { main };

// Run if executed directly
main();