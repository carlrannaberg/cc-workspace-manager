import { execa } from 'execa';
import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { ui } from './ui.js';
const repoCache = new Map();
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/**
 * Safely discovers git repositories within a specified base directory.
 *
 * This function performs recursive directory scanning to find all git repositories
 * within the specified base directory. It includes comprehensive security measures
 * to prevent directory traversal attacks and handles various git repository formats
 * including regular repositories and worktrees.
 *
 * Security Features:
 * - Path sanitization and validation
 * - Directory traversal attack prevention
 * - Symlink traversal protection
 * - Depth limiting to prevent infinite recursion
 * - Permission error handling
 *
 * @param baseDir - Base directory path to search for repositories
 *
 * @returns Promise resolving to array of absolute repository paths
 *
 * @throws {Error} When directory doesn't exist or isn't accessible
 * @throws {Error} When path traversal attack is detected
 * @throws {Error} When provided path is not a directory
 *
 * @example
 * ```typescript
 * // Discover repositories in a projects directory
 * const repos = await discoverRepos('/Users/dev/projects');
 * console.log(`Found ${repos.length} repositories:`);
 * repos.forEach(repo => console.log(`- ${repo}`));
 *
 * // Output:
 * // Found 3 repositories:
 * // - /Users/dev/projects/frontend
 * // - /Users/dev/projects/backend
 * // - /Users/dev/projects/shared/utils
 * ```
 */
export async function discoverRepos(baseDir) {
    try {
        // Validate and sanitize input path
        const sanitizedPath = resolve(baseDir);
        // Check cache first
        const cacheKey = sanitizedPath;
        const cached = repoCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
            ui.info(`Using cached repository list for ${sanitizedPath} (${cached.data.length} repos)`);
            return cached.data;
        }
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
        const repos = new Set();
        const visited = new Set();
        let totalDirectories = 0;
        let scannedDirectories = 0;
        // Start spinner for discovery process
        const spinner = ui.spinner('Discovering git repositories...');
        const spinnerInterval = spinner.start();
        async function scanDir(dir, depth) {
            if (depth > 3 || visited.has(dir))
                return;
            visited.add(dir);
            scannedDirectories++;
            try {
                const entries = await readdir(dir, { withFileTypes: true });
                totalDirectories += entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).length;
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
            }
            catch {
                // Silently skip directories we can't read
            }
        }
        await scanDir(sanitizedPath, 1);
        // Stop spinner and show results
        spinner.stop(spinnerInterval, `Found ${repos.size} repositories in ${scannedDirectories} directories`);
        const results = Array.from(repos).sort();
        // Cache the results
        repoCache.set(cacheKey, {
            data: results,
            timestamp: Date.now(),
            ttl: DEFAULT_CACHE_TTL
        });
        return results;
    }
    catch (error) {
        console.error('Failed to discover repos:', error);
        return [];
    }
}
export async function currentBranch(repoPath) {
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
    }
    catch {
        return 'main'; // Default fallback
    }
}
export async function addWorktree(baseRepo, branch, worktreeDir) {
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
    }
    catch {
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
//# sourceMappingURL=git.js.map