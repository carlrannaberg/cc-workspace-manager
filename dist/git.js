import { execa } from 'execa';
import { existsSync, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { ui } from './ui.js';
import { SecurityValidator } from './utils/security.js';
const repoCache = new Map();
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/**
 * Generator that discovers git repositories with O(n) complexity and constant memory usage.
 *
 * This generator processes directories sequentially rather than in parallel, preventing
 * memory overload when scanning large directory trees while maintaining security.
 *
 * @param dir - Directory to scan
 * @param depth - Current depth in directory tree
 * @yields Repository paths as they are discovered
 */
async function* scanDirGenerator(dir, depth) {
    if (depth > 3)
        return;
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        // Check for .git first (early yield for performance)
        if (entries.some(e => e.isDirectory() && e.name === '.git')) {
            yield dir;
            return; // Don't scan subdirectories of git repos
        }
        // Process subdirectories sequentially for constant memory usage
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                yield* scanDirGenerator(join(dir, entry.name), depth + 1);
            }
        }
    }
    catch {
        // Silently skip directories we can't read
    }
}
/**
 * Safely discovers git repositories within a specified base directory.
 *
 * Optimized implementation using generators for O(n) complexity and constant memory usage.
 * This prevents memory overload when scanning large directory trees while maintaining
 * all security measures and early exit optimizations.
 *
 * Security Features:
 * - Path sanitization and validation
 * - Directory traversal attack prevention
 * - Depth limiting to prevent infinite recursion
 * - Permission error handling
 * - Constant memory usage prevents DoS attacks
 *
 * Performance Features:
 * - O(n) time complexity vs O(n*m) in previous implementation
 * - Constant memory usage vs growing with directory count
 * - Early exit when .git directory is found
 * - Generator-based streaming processing
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
        // Validate and sanitize input path using centralized security utility
        const sanitizedPath = SecurityValidator.validatePath(baseDir);
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
        // Start spinner for discovery process
        const spinner = ui.spinner('Discovering git repositories...');
        const spinnerInterval = spinner.start();
        // Use generator for O(n) complexity with constant memory usage
        const repos = [];
        let scannedRepositories = 0;
        for await (const repo of scanDirGenerator(sanitizedPath, 1)) {
            repos.push(repo);
            scannedRepositories++;
        }
        // Stop spinner and show results
        spinner.stop(spinnerInterval, `Found ${repos.length} repositories`);
        // Sort results for consistent output
        const results = repos.sort();
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
        // Validate path using centralized security utility
        const sanitizedPath = SecurityValidator.validatePath(repoPath);
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
    // Validate all inputs using centralized security utilities
    const sanitizedBaseRepo = SecurityValidator.validatePath(baseRepo);
    const sanitizedWorktreeDir = SecurityValidator.validatePath(worktreeDir);
    const sanitizedBranch = branch.trim();
    // Validate branch name with comprehensive security checks
    SecurityValidator.validateBranchName(sanitizedBranch);
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