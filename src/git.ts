import { execa } from 'execa';
import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';

export async function discoverRepos(baseDir: string): Promise<string[]> {
  try {
    // Validate and sanitize input path
    const sanitizedPath = resolve(baseDir);
    
    // Security checks
    if (!existsSync(sanitizedPath)) {
      throw new Error('Directory does not exist');
    }
    
    if (!statSync(sanitizedPath).isDirectory()) {
      throw new Error('Path is not a directory');
    }
    
    // Prevent directory traversal attacks
    if (sanitizedPath.includes('..') || baseDir.includes('..')) {
      throw new Error('Path traversal detected');
    }
    
    // Use native Node.js API for safer directory scanning
    const repos = new Set<string>();
    const visited = new Set<string>();
    
    async function scanDir(dir: string, depth: number): Promise<void> {
      if (depth > 3 || visited.has(dir)) return;
      visited.add(dir);
      
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        
        // Check for .git directory first (early exit optimization)
        if (entries.some(e => e.isDirectory() && e.name === '.git')) {
          repos.add(dir);
          return; // Don't scan subdirectories of git repos
        }
        
        // Parallel scanning of subdirectories
        const subDirPromises = entries
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => scanDir(join(dir, e.name), depth + 1));
        
        await Promise.all(subDirPromises);
      } catch {
        // Silently skip directories we can't read
      }
    }
    
    await scanDir(sanitizedPath, 1);
    return Array.from(repos).sort();
  } catch (error) {
    console.error('Failed to discover repos:', error);
    return [];
  }
}

export async function currentBranch(repoPath: string): Promise<string> {
  try {
    // Validate path to prevent injection
    const sanitizedPath = resolve(repoPath);
    if (sanitizedPath.includes('..') || repoPath.includes('..')) {
      throw new Error('Path traversal detected');
    }
    
    const { stdout } = await execa('git', [
      '-C', sanitizedPath, 
      'rev-parse', 
      '--abbrev-ref', 
      'HEAD'
    ], {
      shell: false // Explicitly disable shell interpretation
    });
    return stdout.trim();
  } catch {
    return 'main'; // Default fallback
  }
}

export async function addWorktree(
  baseRepo: string, 
  branch: string, 
  worktreeDir: string
): Promise<void> {
  // Validate all paths to prevent injection
  const sanitizedBaseRepo = resolve(baseRepo);
  const sanitizedWorktreeDir = resolve(worktreeDir);
  const sanitizedBranch = branch.trim();
  
  // Security checks
  if (sanitizedBaseRepo.includes('..') || baseRepo.includes('..')) {
    throw new Error('Path traversal detected in baseRepo');
  }
  if (sanitizedWorktreeDir.includes('..') || worktreeDir.includes('..')) {
    throw new Error('Path traversal detected in worktreeDir');
  }
  
  // Validate branch name (prevent injection)
  if (!/^[a-zA-Z0-9/_-]+$/.test(sanitizedBranch) || sanitizedBranch.includes('..')) {
    throw new Error('Invalid branch name');
  }
  
  // Fetch latest changes with timeout
  try {
    await execa('git', ['-C', sanitizedBaseRepo, 'fetch', 'origin'], { 
      stdio: 'ignore',
      shell: false,
      timeout: 30000 // 30 second timeout
    });
  } catch {
    // Continue even if fetch fails (offline mode)
  }
  
  // Create worktree
  await execa('git', [
    '-C', sanitizedBaseRepo, 
    'worktree', 'add', 
    sanitizedWorktreeDir, sanitizedBranch
  ], {
    shell: false // Explicitly disable shell interpretation
  });
}