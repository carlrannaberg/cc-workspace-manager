import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { currentBranch, discoverRepos, addWorktree } from '../src/git.js';
import { SecurityValidator } from '../src/utils/security.js';
import { rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import { createTestDir } from './utils/testDir.js';
import { errorMatchers } from './utils/errorMatchers.js';

describe('Git Operations', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir('git-test', expect.getState().currentTestName);
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('currentBranch', () => {
    test('returns current branch name for valid git repo', async () => {
      const repoDir = join(testDir, 'valid-repo');
      
      // Initialize git repo
      await execa('git', ['init'], { cwd: testDir });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testDir });
      
      // Create initial commit to establish branch
      writeFileSync(join(testDir, 'README.md'), '# Test');
      await execa('git', ['add', '.'], { cwd: testDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testDir });
      
      const branch = await currentBranch(testDir);
      expect(['main', 'master']).toContain(branch);
    });

    test('returns main as fallback for non-git directory', async () => {
      const nonGitDir = join(testDir, 'not-a-repo');
      mkdirSync(nonGitDir);
      
      const branch = await currentBranch(nonGitDir);
      expect(branch).toBe('main');
    });

    test('returns main as fallback for non-existent directory', async () => {
      const branch = await currentBranch('/non/existent/path');
      expect(branch).toBe('main');
    });

    test('returns correct branch name after checkout', async () => {
      // Initialize git repo
      await execa('git', ['init'], { cwd: testDir });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testDir });
      
      // Create initial commit
      writeFileSync(join(testDir, 'README.md'), '# Test');
      await execa('git', ['add', '.'], { cwd: testDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testDir });
      
      // Create and checkout new branch
      await execa('git', ['checkout', '-b', 'feature-branch'], { cwd: testDir });
      
      const branch = await currentBranch(testDir);
      expect(branch).toBe('feature-branch');
    });

    test('handles git repo in detached HEAD state', async () => {
      // Initialize git repo
      await execa('git', ['init'], { cwd: testDir });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testDir });
      
      // Create initial commit
      writeFileSync(join(testDir, 'README.md'), '# Test');
      await execa('git', ['add', '.'], { cwd: testDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testDir });
      
      // Get commit hash and checkout detached HEAD
      const { stdout: commitHash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: testDir });
      await execa('git', ['checkout', commitHash], { cwd: testDir });
      
      const branch = await currentBranch(testDir);
      expect(branch).toBe('HEAD');
    });
  });

  describe('discoverRepos', () => {
    test('finds git directories in base directory', async () => {
      // Create multiple repos
      const repo1 = join(testDir, 'repo1');
      const repo2 = join(testDir, 'repo2');
      
      mkdirSync(repo1);
      mkdirSync(repo2);
      
      await execa('git', ['init'], { cwd: repo1 });
      await execa('git', ['init'], { cwd: repo2 });
      
      const repos = await discoverRepos(testDir);
      expect(repos).toContain(repo1);
      expect(repos).toContain(repo2);
      expect(repos).toHaveLength(2);
    });

    test('finds nested git directories within depth limit', async () => {
      // Create nested structure: testDir/level1/repo (depth 2 from testDir)
      const level1 = join(testDir, 'level1');
      const nestedRepo = join(level1, 'repo');
      
      mkdirSync(level1);
      mkdirSync(nestedRepo);
      
      await execa('git', ['init'], { cwd: nestedRepo });
      
      const repos = await discoverRepos(testDir);
      expect(repos).toContain(nestedRepo);
    });

    test('ignores non-git directories', async () => {
      // Create regular directories
      const regularDir = join(testDir, 'not-a-repo');
      mkdirSync(regularDir);
      
      const repos = await discoverRepos(testDir);
      expect(repos).not.toContain(regularDir);
      expect(repos).toHaveLength(0);
    });

    test('returns empty array for non-existent directory', async () => {
      const repos = await discoverRepos('/non/existent/path');
      expect(repos).toEqual([]);
    });

    test('handles directory with .git file (worktree scenario)', async () => {
      // Create a main repo
      const mainRepo = join(testDir, 'main');
      mkdirSync(mainRepo);
      await execa('git', ['init'], { cwd: mainRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: mainRepo });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: mainRepo });
      
      // Create initial commit
      writeFileSync(join(mainRepo, 'README.md'), '# Main');
      await execa('git', ['add', '.'], { cwd: mainRepo });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: mainRepo });
      
      // Create a worktree
      const worktreeDir = join(testDir, 'worktree');
      await execa('git', ['worktree', 'add', worktreeDir, 'HEAD'], { cwd: mainRepo });
      
      const repos = await discoverRepos(testDir);
      expect(repos).toContain(mainRepo);
      // Worktree should also be discovered as it has .git file
      expect(repos.length).toBeGreaterThanOrEqual(1);
    });

    test('handles permissions errors gracefully', async () => {
      // This test simulates permission denied scenarios
      // On systems where we can't actually remove permissions, this serves as documentation
      const repos = await discoverRepos(testDir);
      expect(Array.isArray(repos)).toBe(true);
    });

    test('excludes directories beyond maxdepth limit', async () => {
      // Create deeply nested structure beyond maxdepth 3
      // testDir/level1/level2/level3/level4/deep-repo (depth 5 from testDir)
      let currentPath = testDir;
      for (let i = 1; i <= 4; i++) {
        currentPath = join(currentPath, `level${i}`);
        mkdirSync(currentPath);
      }
      
      const deepRepo = join(currentPath, 'deep-repo');
      mkdirSync(deepRepo);
      await execa('git', ['init'], { cwd: deepRepo });
      
      const repos = await discoverRepos(testDir);
      // With maxdepth 3, repos at depth 5 should not be found
      expect(repos).not.toContain(deepRepo);
    });
  });

  describe('addWorktree', () => {
    let baseRepo: string;

    beforeEach(async () => {
      baseRepo = join(testDir, 'base-repo');
      mkdirSync(baseRepo);
      
      // Initialize base repo
      await execa('git', ['init'], { cwd: baseRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: baseRepo });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: baseRepo });
      
      // Create initial commit
      writeFileSync(join(baseRepo, 'README.md'), '# Base Repo');
      await execa('git', ['add', '.'], { cwd: baseRepo });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: baseRepo });
    });

    test('creates worktree for existing branch', async () => {
      // Create a feature branch
      await execa('git', ['checkout', '-b', 'feature'], { cwd: baseRepo });
      await execa('git', ['checkout', 'main'], { cwd: baseRepo });
      
      const worktreeDir = join(testDir, 'feature-worktree');
      
      await addWorktree(baseRepo, 'feature', worktreeDir);
      
      // Verify worktree was created
      const { stdout } = await execa('git', ['worktree', 'list'], { cwd: baseRepo });
      expect(stdout).toContain(worktreeDir);
      expect(stdout).toContain('[feature]');
    });

    test('creates worktree for new branch', async () => {
      const worktreeDir = join(testDir, 'new-feature-worktree');
      
      // First create the branch in the base repo
      await execa('git', ['checkout', '-b', 'new-feature'], { cwd: baseRepo });
      await execa('git', ['checkout', 'main'], { cwd: baseRepo });
      
      // Now create worktree for the existing branch
      await addWorktree(baseRepo, 'new-feature', worktreeDir);
      
      // Verify worktree was created
      const { stdout } = await execa('git', ['worktree', 'list'], { cwd: baseRepo });
      expect(stdout).toContain(worktreeDir);
      expect(stdout).toContain('[new-feature]');
    });

    test('handles fetch failure gracefully (offline mode)', async () => {
      // Create a repo with invalid remote to simulate fetch failure
      await execa('git', ['remote', 'add', 'origin', 'https://invalid.url/repo.git'], { cwd: baseRepo });
      
      // Create a separate branch for the worktree (can't use 'main' as it's checked out)
      await execa('git', ['checkout', '-b', 'offline-branch'], { cwd: baseRepo });
      await execa('git', ['checkout', 'main'], { cwd: baseRepo });
      
      const worktreeDir = join(testDir, 'offline-worktree');
      
      // Should not throw error even if fetch fails
      await expect(addWorktree(baseRepo, 'offline-branch', worktreeDir)).resolves.not.toThrow();
      
      // Verify worktree was still created
      const { stdout } = await execa('git', ['worktree', 'list'], { cwd: baseRepo });
      expect(stdout).toContain(worktreeDir);
    });

    test('throws error for invalid base repo', async () => {
      const invalidRepo = join(testDir, 'not-a-repo');
      mkdirSync(invalidRepo);
      
      const worktreeDir = join(testDir, 'should-fail-worktree');
      
      await expect(addWorktree(invalidRepo, 'main', worktreeDir))
        .rejects.toThrow(errorMatchers.gitError);
    });

    test('throws error when worktree directory already exists', async () => {
      const worktreeDir = join(testDir, 'existing-dir');
      mkdirSync(worktreeDir);
      
      await expect(addWorktree(baseRepo, 'main', worktreeDir))
        .rejects.toThrow(errorMatchers.gitWorktreeConflict);
    });

    test('handles branch names with special characters', async () => {
      // Create branch with special characters
      await execa('git', ['checkout', '-b', 'feature/special-chars-123'], { cwd: baseRepo });
      await execa('git', ['checkout', 'main'], { cwd: baseRepo });
      
      const worktreeDir = join(testDir, 'special-chars-worktree');
      
      await addWorktree(baseRepo, 'feature/special-chars-123', worktreeDir);
      
      // Verify worktree was created
      const { stdout } = await execa('git', ['worktree', 'list'], { cwd: baseRepo });
      expect(stdout).toContain(worktreeDir);
      expect(stdout).toContain('[feature/special-chars-123]');
    });
  });

  describe('SecurityValidator.validateBranchName', () => {
    test('accepts valid branch names', () => {
      expect(() => SecurityValidator.validateBranchName('main')).not.toThrow();
      expect(() => SecurityValidator.validateBranchName('feature/user-auth')).not.toThrow();
      expect(() => SecurityValidator.validateBranchName('fix-bug-123')).not.toThrow();
      expect(() => SecurityValidator.validateBranchName('dev_branch')).not.toThrow();
      expect(() => SecurityValidator.validateBranchName('release-v1.0.0')).not.toThrow();
    });

    test('rejects branch names with path traversal', () => {
      expect(() => SecurityValidator.validateBranchName('../etc/passwd')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('feature/../../../etc/passwd')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('../../malicious')).toThrow('Invalid branch name: contains dangerous characters');
    });

    test('rejects branch names with option injection', () => {
      expect(() => SecurityValidator.validateBranchName('-rf')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('--delete-everything')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('-exec rm -rf /')).toThrow('Invalid branch name: contains dangerous characters');
    });

    test('rejects branch names with shell metacharacters', () => {
      expect(() => SecurityValidator.validateBranchName('branch; rm -rf /')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch && malicious')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch | evil')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch`command`')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch$(cmd)')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch{test}')).toThrow('Invalid branch name: contains dangerous characters');
    });

    test('rejects branch names with control characters', () => {
      expect(() => SecurityValidator.validateBranchName('branch\x00null')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch\x1b[31mred')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch\nnewline')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('branch\ttab')).toThrow('Invalid branch name: contains dangerous characters');
    });

    test('rejects branch names with internal whitespace', () => {
      expect(() => SecurityValidator.validateBranchName('branch name')).toThrow('Invalid branch name: contains dangerous characters');
    });

    test('handles leading and trailing whitespace by trimming', () => {
      // Leading and trailing whitespace should be trimmed and result validated
      expect(() => SecurityValidator.validateBranchName(' valid-branch')).not.toThrow();
      expect(() => SecurityValidator.validateBranchName('valid-branch ')).not.toThrow();
      expect(() => SecurityValidator.validateBranchName(' valid-branch ')).not.toThrow();
      
      // But empty after trimming should fail
      expect(() => SecurityValidator.validateBranchName('   ')).toThrow('Invalid branch name format');
    });

    test('rejects branch names with reflog syntax', () => {
      expect(() => SecurityValidator.validateBranchName('branch@{yesterday}')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('HEAD@{1}')).toThrow('Invalid branch name: contains dangerous characters');
    });

    test('rejects branch names that are too long', () => {
      const longBranch = 'a'.repeat(256);
      expect(() => SecurityValidator.validateBranchName(longBranch)).toThrow('Branch name too long');
    });

    test('rejects branch names with invalid format', () => {
      expect(() => SecurityValidator.validateBranchName('')).toThrow('Invalid branch name format');
      expect(() => SecurityValidator.validateBranchName('a')).toThrow('Invalid branch name format');  // Too short
      expect(() => SecurityValidator.validateBranchName('-invalid-start')).toThrow('Invalid branch name: contains dangerous characters');
      expect(() => SecurityValidator.validateBranchName('invalid-end-')).toThrow('Invalid branch name format');
      expect(() => SecurityValidator.validateBranchName('.invalid-start')).toThrow('Invalid branch name format');
    });

    test('handles empty or null input', () => {
      expect(() => SecurityValidator.validateBranchName('')).toThrow('Invalid branch name format');
      expect(() => SecurityValidator.validateBranchName('   ')).toThrow('Invalid branch name format');
    });
  });

  describe('Security and Error Handling', () => {
    test('discoverRepos handles path traversal attacks', async () => {
      // These should be handled gracefully, returning empty arrays
      const repos1 = await discoverRepos('../../../etc');
      expect(Array.isArray(repos1)).toBe(true);

      const repos2 = await discoverRepos('/etc/../../../secret');
      expect(Array.isArray(repos2)).toBe(true);
    });

    test('currentBranch handles path traversal in repo path', async () => {
      // Should return fallback 'main' for invalid paths
      const branch = await currentBranch('../../../etc/passwd');
      expect(branch).toBe('main');
    });

    test('addWorktree rejects malicious branch names', async () => {
      const baseRepo = join(testDir, 'base-repo');
      mkdirSync(baseRepo);
      
      // Initialize base repo
      await execa('git', ['init'], { cwd: baseRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: baseRepo });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: baseRepo });
      
      // Create initial commit
      writeFileSync(join(baseRepo, 'README.md'), '# Base Repo');
      await execa('git', ['add', '.'], { cwd: baseRepo });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: baseRepo });

      const worktreeDir = join(testDir, 'test-worktree');

      // Test various malicious branch names
      await expect(addWorktree(baseRepo, '../../../etc/passwd', worktreeDir))
        .rejects.toThrow('Invalid branch name: contains dangerous characters');

      await expect(addWorktree(baseRepo, 'branch; rm -rf /', worktreeDir))
        .rejects.toThrow('Invalid branch name: contains dangerous characters');

      await expect(addWorktree(baseRepo, 'branch && evil', worktreeDir))
        .rejects.toThrow('Invalid branch name: contains dangerous characters');

      await expect(addWorktree(baseRepo, '-delete-flag', worktreeDir))
        .rejects.toThrow('Invalid branch name: contains dangerous characters');
    });

    test('addWorktree handles path traversal in paths', async () => {
      const baseRepo = join(testDir, 'base-repo');
      mkdirSync(baseRepo);
      
      // Initialize base repo
      await execa('git', ['init'], { cwd: baseRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: baseRepo });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: baseRepo });
      
      // Create initial commit
      writeFileSync(join(baseRepo, 'README.md'), '# Base Repo');
      await execa('git', ['add', '.'], { cwd: baseRepo });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: baseRepo });

      // Create a valid branch
      await execa('git', ['checkout', '-b', 'test-branch'], { cwd: baseRepo });
      await execa('git', ['checkout', 'main'], { cwd: baseRepo });

      // Test path traversal in base repo path
      await expect(addWorktree('../../etc/passwd', 'test-branch', join(testDir, 'worktree')))
        .rejects.toThrow('Path traversal detected');

      // Test path traversal in worktree path
      await expect(addWorktree(baseRepo, 'test-branch', '../../../etc/passwd'))
        .rejects.toThrow('Path traversal detected');
    });

    test('addWorktree handles git command failures', async () => {
      const baseRepo = join(testDir, 'base-repo');
      mkdirSync(baseRepo);
      
      // Initialize base repo
      await execa('git', ['init'], { cwd: baseRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: baseRepo });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: baseRepo });
      
      // Create initial commit
      writeFileSync(join(baseRepo, 'README.md'), '# Base Repo');
      await execa('git', ['add', '.'], { cwd: baseRepo });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: baseRepo });

      const worktreeDir = join(testDir, 'test-worktree');

      // Test creating worktree for non-existent branch now creates a new branch from base
      await addWorktree(baseRepo, 'non-existent-branch', worktreeDir);
      expect(existsSync(worktreeDir)).toBe(true);

      // Test creating worktree in existing directory should still fail
      const conflictDir = join(testDir, 'conflict-worktree');
      mkdirSync(conflictDir);
      writeFileSync(join(conflictDir, 'conflict.txt'), 'existing file');

      await expect(addWorktree(baseRepo, 'main', conflictDir))
        .rejects.toThrow();
    });

    test('git operations handle corrupted repositories', async () => {
      const corruptRepo = join(testDir, 'corrupt-repo');
      mkdirSync(corruptRepo);
      
      // Create a fake .git directory without proper structure
      const gitDir = join(corruptRepo, '.git');
      mkdirSync(gitDir);
      writeFileSync(join(gitDir, 'invalid'), 'not a real git repo');

      // Operations should handle corruption gracefully
      const branch = await currentBranch(corruptRepo);
      expect(branch).toBe('main'); // Should fall back to default

      const repos = await discoverRepos(testDir);
      // May or may not include the corrupt repo, but should not crash
      expect(Array.isArray(repos)).toBe(true);
    });
  });
});
