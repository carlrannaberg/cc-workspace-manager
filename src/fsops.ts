import { execa } from 'execa';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import fs from 'fs-extra';
import { ui } from './ui.js';

export async function ensureWorkspaceSkeleton(wsDir: string): Promise<void> {
  await fs.ensureDir(join(wsDir, 'repos'));
  await fs.writeFile(
    join(wsDir, '.gitignore'), 
    'repos/\nnode_modules/\n.env*\n'
  );
}

export async function primeNodeModules(
  src: string, 
  dst: string
): Promise<{ method: 'hardlink' | 'rsync' | 'skipped'; error?: string }> {
  const srcPath = join(src, 'node_modules');
  const dstPath = join(dst, 'node_modules');
  
  // Skip if source doesn't exist
  if (!existsSync(srcPath)) {
    return { method: 'skipped' };
  }
  
  // Try hardlink first (fast on same filesystem)
  try {
    await execa('cp', ['-al', srcPath, dstPath]);
    return { method: 'hardlink' };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Check for specific hardlink failures and provide helpful context
    if (errorMsg.includes('Operation not permitted') || errorMsg.includes('cross-device')) {
      ui.warning(`Hardlink failed (cross-filesystem detected), falling back to rsync...`);
    } else if (errorMsg.includes('File exists')) {
      ui.warning(`Target node_modules exists, falling back to rsync...`);
    } else {
      ui.warning(`Hardlink failed: ${errorMsg}, falling back to rsync...`);
    }
  }
  
  // Fallback to rsync with better error reporting
  try {
    await execa('rsync', [
      '-a', 
      '--delete',
      `${srcPath}/`, 
      `${dstPath}/`
    ]);
    return { method: 'rsync' };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ui.error(`Failed to prime node_modules for ${basename(dst)}: ${errorMsg}`);
    ui.info('You may need to run "npm install" manually in this repository');
    return { method: 'skipped', error: errorMsg };
  }
}

export async function copyEnvFiles(
  src: string, 
  dst: string
): Promise<void> {
  try {
    // Find all .env* files in source
    const { stdout } = await execa('find', [
      src, 
      '-maxdepth', '1', 
      '-name', '.env*', 
      '-type', 'f'
    ]);
    
    const files = stdout.split('\n').filter(Boolean);
    
    // Copy each file
    for (const file of files) {
      const destFile = join(dst, basename(file));
      await fs.copyFile(file, destFile);
    }
  } catch (error) {
    console.warn(`Failed to copy env files:`, error);
  }
}