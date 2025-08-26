import { execa } from 'execa';

export async function discoverRepos(baseDir: string): Promise<string[]> {
  try {
    const { stdout } = await execa('find', [
      baseDir, 
      '-maxdepth', '3',
      '-type', 'd',
      '-name', '.git',
      '-prune'
    ]);
    return stdout.split('\n')
      .filter(Boolean)
      .map(p => p.replace('/.git', ''));
  } catch (error) {
    console.error('Failed to discover repos:', error);
    return [];
  }
}

export async function currentBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execa('git', [
      '-C', repoPath, 
      'rev-parse', 
      '--abbrev-ref', 
      'HEAD'
    ]);
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
  // Fetch latest changes
  try {
    await execa('git', ['-C', baseRepo, 'fetch', 'origin'], { 
      stdio: 'ignore' 
    });
  } catch {
    // Continue even if fetch fails (offline mode)
  }
  
  // Create worktree
  await execa('git', [
    '-C', baseRepo, 
    'worktree', 'add', 
    worktreeDir, branch
  ]);
}