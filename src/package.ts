import fs from 'fs-extra';
import { join } from 'path';
import { pmRun } from './pm.js';
import { ui } from './ui.js';
import type { RepoMounted } from './types.js';

/**
 * Generates a unified package.json at workspace root with scripts for all mounted repos
 */
export async function generateRootPackageJson(
  wsDir: string, 
  mounted: RepoMounted[]
): Promise<void> {
  ui.info('Generating workspace package.json...');
  
  const scripts: Record<string, string> = {};
  
  // Generate per-repo scripts for common commands
  for (const repo of mounted) {
    for (const cmd of ['dev', 'build', 'test', 'lint', 'start']) {
      scripts[`${repo.alias}:${cmd}`] = pmRun(
        repo.packageManager, 
        repo.alias, 
        cmd
      );
    }
  }
  
  // Generate combined dev script using concurrently
  if (mounted.length > 0) {
    const devCommands = mounted
      .map(r => `"npm run ${r.alias}:dev"`)
      .join(' ');
    
    const repoNames = mounted
      .map(r => r.alias.toUpperCase())
      .join(',');
    
    scripts.dev = `concurrently -n ${repoNames} ${devCommands}`;
    
    // Also create a build-all script
    const buildCommands = mounted
      .map(r => `"npm run ${r.alias}:build"`)
      .join(' ');
    
    scripts['build:all'] = `concurrently ${buildCommands}`;
    
    // And a test-all script  
    const testCommands = mounted
      .map(r => `"npm run ${r.alias}:test"`)
      .join(' ');
      
    scripts['test:all'] = `concurrently ${testCommands}`;
  }
  
  // Create package.json
  const packageJson = {
    name: 'cc-workspace',
    version: '1.0.0',
    private: true,
    description: 'Claude Code workspace with multiple repositories',
    type: 'module',
    scripts,
    devDependencies: {
      concurrently: '^9.0.0'
    },
    // Add metadata about the workspace
    ccws: {
      created: new Date().toISOString(),
      repositories: mounted.map(r => ({
        alias: r.alias,
        branch: r.branch,
        packageManager: r.packageManager,
        basePath: r.basePath
      }))
    }
  };
  
  const packageJsonPath = join(wsDir, 'package.json');
  await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
  
  ui.success(`✓ Created package.json with ${Object.keys(scripts).length} scripts`);
}