import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execa } from 'execa';
import { rmSync } from 'fs-extra';
import { addWorktree } from '../src/git.js';
import { createWorkspace, generateClaudeMd } from '../src/workspace.js';
import { ensureWorkspaceSkeleton, primeNodeModules, copyEnvFiles } from '../src/fsops.js';
import { detectPM } from '../src/pm.js';
import type { RepoPick, RepoMounted } from '../src/types.js';

describe('Integration Tests - Complete Workspace Generation', () => {
  let testDir: string;
  let cleanupPaths: string[] = [];
  
  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'ccws-integration-'));
    cleanupPaths.push(testDir);
  });

  afterAll(async () => {
    // Cleanup test files
    for (const path of cleanupPaths) {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Single Repository Workspace Generation', () => {
    let testRepo: string;

    beforeEach(async () => {
      // Create a test git repo
      testRepo = mkdtempSync(join(tmpdir(), 'test-repo-'));
      cleanupPaths.push(testRepo);
      
      await execa('git', ['init'], { cwd: testRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRepo });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: testRepo });
      
      // Create package.json with realistic content
      writeFileSync(join(testRepo, 'package.json'), JSON.stringify({
        name: 'test-frontend',
        version: '1.0.0',
        scripts: { 
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          test: 'jest',
          lint: 'eslint .'
        },
        dependencies: {
          'next': '^14.0.0',
          'react': '^18.0.0',
          'react-dom': '^18.0.0'
        },
        devDependencies: {
          'eslint': '^8.0.0',
          'jest': '^29.0.0'
        }
      }, null, 2));
      
      // Create .env file
      writeFileSync(join(testRepo, '.env'), 'NODE_ENV=development\nPORT=3000\nAPI_URL=http://localhost:4000\n');
      writeFileSync(join(testRepo, '.env.local'), 'SECRET_KEY=test-secret\n');
      
      // Create node_modules directory with realistic structure
      const nodeModulesDir = join(testRepo, 'node_modules');
      mkdirSync(nodeModulesDir, { recursive: true });
      
      // Create some package directories
      mkdirSync(join(nodeModulesDir, 'next'), { recursive: true });
      mkdirSync(join(nodeModulesDir, 'react'), { recursive: true });
      mkdirSync(join(nodeModulesDir, '.bin'), { recursive: true });
      
      writeFileSync(join(nodeModulesDir, 'next', 'package.json'), '{"name":"next","version":"14.0.0"}');
      writeFileSync(join(nodeModulesDir, 'react', 'package.json'), '{"name":"react","version":"18.0.0"}');
      writeFileSync(join(nodeModulesDir, '.bin', 'next'), '#!/usr/bin/env node\nconsole.log("next");');
      
      // Create some source files
      mkdirSync(join(testRepo, 'src', 'components'), { recursive: true });
      writeFileSync(join(testRepo, 'src', 'components', 'Button.tsx'), 'export const Button = () => <button>Click me</button>;');
      writeFileSync(join(testRepo, 'README.md'), '# Test Frontend\n\nA test Next.js application.');
      
      await execa('git', ['add', '.'], { cwd: testRepo });
      await execa('git', ['commit', '-m', 'initial commit'], { cwd: testRepo });
    });

    test('creates worktree successfully with all files', async () => {
      // Create a new branch for the worktree to avoid main branch being checked out
      await execa('git', ['branch', 'test-branch'], { cwd: testRepo });
      
      const worktreeDir = mkdtempSync(join(tmpdir(), 'worktree-'));
      cleanupPaths.push(worktreeDir);
      
      await addWorktree(testRepo, 'test-branch', worktreeDir);
      
      // Verify git worktree structure
      expect(existsSync(join(worktreeDir, '.git'))).toBe(true);
      
      // Verify all files are present
      expect(existsSync(join(worktreeDir, 'package.json'))).toBe(true);
      expect(existsSync(join(worktreeDir, 'README.md'))).toBe(true);
      expect(existsSync(join(worktreeDir, 'src', 'components', 'Button.tsx'))).toBe(true);
      
      // Verify package.json content is correct
      const pkgContent = JSON.parse(readFileSync(join(worktreeDir, 'package.json'), 'utf8'));
      expect(pkgContent.name).toBe('test-frontend');
      expect(pkgContent.scripts.dev).toBe('next dev');
    });

    test('generates complete workspace with priming and env files', async () => {
      // Create a branch for the worktree
      await execa('git', ['branch', 'workspace-branch'], { cwd: testRepo });
      
      const repoPicks: RepoPick[] = [{
        alias: 'frontend',
        basePath: testRepo,
        branch: 'workspace-branch'
      }];
      
      const { wsDir, mounted } = await createWorkspace(repoPicks);
      cleanupPaths.push(wsDir);
      
      // Verify workspace structure
      expect(existsSync(wsDir)).toBe(true);
      expect(existsSync(join(wsDir, 'repos'))).toBe(true);
      expect(existsSync(join(wsDir, '.gitignore'))).toBe(true);
      
      // Verify .gitignore content
      const gitignoreContent = readFileSync(join(wsDir, '.gitignore'), 'utf8');
      expect(gitignoreContent).toContain('repos/');
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('.env*');
      
      // Verify worktree directory
      const repoDir = join(wsDir, 'repos', 'frontend');
      expect(existsSync(repoDir)).toBe(true);
      expect(existsSync(join(repoDir, 'package.json'))).toBe(true);
      expect(existsSync(join(repoDir, 'src', 'components', 'Button.tsx'))).toBe(true);
      
      // Verify node_modules priming
      expect(existsSync(join(repoDir, 'node_modules'))).toBe(true);
      expect(existsSync(join(repoDir, 'node_modules', 'next'))).toBe(true);
      expect(existsSync(join(repoDir, 'node_modules', 'react'))).toBe(true);
      expect(existsSync(join(repoDir, 'node_modules', '.bin'))).toBe(true);
      
      // Verify env files copying
      expect(existsSync(join(repoDir, '.env'))).toBe(true);
      expect(existsSync(join(repoDir, '.env.local'))).toBe(true);
      
      const envContent = readFileSync(join(repoDir, '.env'), 'utf8');
      expect(envContent).toContain('NODE_ENV=development');
      expect(envContent).toContain('PORT=3000');
      
      const envLocalContent = readFileSync(join(repoDir, '.env.local'), 'utf8');
      expect(envLocalContent).toContain('SECRET_KEY=test-secret');
      
      // Verify mounted info
      expect(mounted).toHaveLength(1);
      expect(mounted[0].alias).toBe('frontend');
      expect(mounted[0].packageManager).toBe('npm');
      expect(mounted[0].worktreePath).toBe(repoDir);
    });
  });

  describe('Multiple Repository Workspace Generation', () => {
    let frontendRepo: string;
    let backendRepo: string;

    beforeEach(async () => {
      // Create frontend repo (npm)
      frontendRepo = mkdtempSync(join(tmpdir(), 'frontend-repo-'));
      cleanupPaths.push(frontendRepo);
      
      await execa('git', ['init'], { cwd: frontendRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: frontendRepo });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: frontendRepo });
      
      writeFileSync(join(frontendRepo, 'package.json'), JSON.stringify({
        name: 'my-frontend',
        scripts: { 
          dev: 'react-scripts start',
          build: 'react-scripts build',
          test: 'react-scripts test'
        }
      }));
      
      // Create node_modules
      const frontendNodeModules = join(frontendRepo, 'node_modules');
      mkdirSync(frontendNodeModules, { recursive: true });
      mkdirSync(join(frontendNodeModules, 'react-scripts'), { recursive: true });
      
      await execa('git', ['add', '.'], { cwd: frontendRepo });
      await execa('git', ['commit', '-m', 'frontend initial'], { cwd: frontendRepo });
      
      // Create backend repo (yarn)
      backendRepo = mkdtempSync(join(tmpdir(), 'backend-repo-'));
      cleanupPaths.push(backendRepo);
      
      await execa('git', ['init'], { cwd: backendRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: backendRepo });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: backendRepo });
      
      writeFileSync(join(backendRepo, 'package.json'), JSON.stringify({
        name: 'my-backend',
        scripts: { 
          dev: 'nodemon index.js',
          start: 'node index.js',
          test: 'jest'
        }
      }));
      
      // Create yarn.lock to identify as yarn project
      writeFileSync(join(backendRepo, 'yarn.lock'), '# yarn lockfile v1\n\nnodemon@^2.0.0:\n  version "2.0.20"');
      
      // Create .env file
      writeFileSync(join(backendRepo, '.env'), 'DATABASE_URL=postgres://localhost/test\nJWT_SECRET=secret123');
      
      // Create node_modules
      const backendNodeModules = join(backendRepo, 'node_modules');
      mkdirSync(backendNodeModules, { recursive: true });
      mkdirSync(join(backendNodeModules, 'nodemon'), { recursive: true });
      mkdirSync(join(backendNodeModules, 'express'), { recursive: true });
      
      await execa('git', ['add', '.'], { cwd: backendRepo });
      await execa('git', ['commit', '-m', 'backend initial'], { cwd: backendRepo });
    });

    test('handles multiple repositories with different package managers', async () => {
      // Create branches for worktrees
      await execa('git', ['branch', 'frontend-branch'], { cwd: frontendRepo });
      await execa('git', ['branch', 'backend-branch'], { cwd: backendRepo });
      
      const repoPicks: RepoPick[] = [
        { alias: 'frontend', basePath: frontendRepo, branch: 'frontend-branch' },
        { alias: 'backend', basePath: backendRepo, branch: 'backend-branch' }
      ];
      
      const { wsDir, mounted } = await createWorkspace(repoPicks);
      cleanupPaths.push(wsDir);
      
      // Verify both repositories are mounted
      expect(mounted).toHaveLength(2);
      
      // Find frontend and backend in mounted repos
      const frontend = mounted.find(r => r.alias === 'frontend');
      const backend = mounted.find(r => r.alias === 'backend');
      
      expect(frontend).toBeDefined();
      expect(backend).toBeDefined();
      
      // Verify package manager detection
      expect(frontend!.packageManager).toBe('npm');
      expect(backend!.packageManager).toBe('yarn');
      
      // Verify directory structure
      expect(existsSync(join(wsDir, 'repos', 'frontend'))).toBe(true);
      expect(existsSync(join(wsDir, 'repos', 'backend'))).toBe(true);
      
      // Verify frontend files
      const frontendDir = join(wsDir, 'repos', 'frontend');
      expect(existsSync(join(frontendDir, 'package.json'))).toBe(true);
      expect(existsSync(join(frontendDir, 'node_modules', 'react-scripts'))).toBe(true);
      
      // Verify backend files
      const backendDir = join(wsDir, 'repos', 'backend');
      expect(existsSync(join(backendDir, 'package.json'))).toBe(true);
      expect(existsSync(join(backendDir, 'yarn.lock'))).toBe(true);
      expect(existsSync(join(backendDir, '.env'))).toBe(true);
      expect(existsSync(join(backendDir, 'node_modules', 'nodemon'))).toBe(true);
      expect(existsSync(join(backendDir, 'node_modules', 'express'))).toBe(true);
    });

    test('correctly detects package managers from lockfiles and package.json', async () => {
      // Test npm detection
      const frontendPM = detectPM(frontendRepo);
      expect(frontendPM).toBe('npm');
      
      // Test yarn detection
      const backendPM = detectPM(backendRepo);
      expect(backendPM).toBe('yarn');
      
      // Test pnpm detection by creating a pnpm repo
      const pnpmRepo = mkdtempSync(join(tmpdir(), 'pnpm-repo-'));
      cleanupPaths.push(pnpmRepo);
      
      writeFileSync(join(pnpmRepo, 'package.json'), JSON.stringify({ name: 'pnpm-test' }));
      writeFileSync(join(pnpmRepo, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');
      
      const pnpmPM = detectPM(pnpmRepo);
      expect(pnpmPM).toBe('pnpm');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('handles partial failures gracefully', async () => {
      // Create one valid repo and one invalid repo reference
      const validRepo = mkdtempSync(join(tmpdir(), 'valid-repo-'));
      cleanupPaths.push(validRepo);
      
      await execa('git', ['init'], { cwd: validRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: validRepo });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: validRepo });
      
      writeFileSync(join(validRepo, 'package.json'), JSON.stringify({
        name: 'valid-repo',
        scripts: { dev: 'echo "valid"' }
      }));
      
      await execa('git', ['add', '.'], { cwd: validRepo });
      await execa('git', ['commit', '-m', 'initial'], { cwd: validRepo });
      
      // Create branch for the valid repo
      await execa('git', ['branch', 'valid-branch'], { cwd: validRepo });
      
      // Create picks with one valid and one invalid repo
      const repoPicks: RepoPick[] = [
        { alias: 'valid', basePath: validRepo, branch: 'valid-branch' },
        { alias: 'invalid', basePath: '/non/existent/path', branch: 'main' }
      ];
      
      const { wsDir, mounted } = await createWorkspace(repoPicks);
      cleanupPaths.push(wsDir);
      
      // Should succeed with only the valid repo
      expect(mounted).toHaveLength(1);
      expect(mounted[0].alias).toBe('valid');
      expect(existsSync(join(wsDir, 'repos', 'valid'))).toBe(true);
      expect(existsSync(join(wsDir, 'repos', 'invalid'))).toBe(false);
    });

    test('throws error when no repositories can be mounted', async () => {
      const repoPicks: RepoPick[] = [
        { alias: 'invalid1', basePath: '/non/existent/path1', branch: 'main' },
        { alias: 'invalid2', basePath: '/non/existent/path2', branch: 'main' }
      ];
      
      await expect(createWorkspace(repoPicks)).rejects.toThrow('No repositories were successfully mounted');
    });

    test('handles repositories without node_modules gracefully', async () => {
      const repoWithoutNodeModules = mkdtempSync(join(tmpdir(), 'no-node-modules-'));
      cleanupPaths.push(repoWithoutNodeModules);
      
      await execa('git', ['init'], { cwd: repoWithoutNodeModules });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: repoWithoutNodeModules });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: repoWithoutNodeModules });
      
      writeFileSync(join(repoWithoutNodeModules, 'package.json'), JSON.stringify({
        name: 'no-deps',
        scripts: { start: 'echo "hello"' }
      }));
      
      // No node_modules created
      await execa('git', ['add', '.'], { cwd: repoWithoutNodeModules });
      await execa('git', ['commit', '-m', 'initial'], { cwd: repoWithoutNodeModules });
      
      // Create branch for worktree
      await execa('git', ['branch', 'no-deps-branch'], { cwd: repoWithoutNodeModules });
      
      const repoPicks: RepoPick[] = [{
        alias: 'no-deps',
        basePath: repoWithoutNodeModules,
        branch: 'no-deps-branch'
      }];
      
      const { wsDir, mounted } = await createWorkspace(repoPicks);
      cleanupPaths.push(wsDir);
      
      // Should succeed even without node_modules to prime
      expect(mounted).toHaveLength(1);
      expect(mounted[0].alias).toBe('no-deps');
      
      const repoDir = join(wsDir, 'repos', 'no-deps');
      expect(existsSync(join(repoDir, 'package.json'))).toBe(true);
      expect(existsSync(join(repoDir, 'node_modules'))).toBe(false);
    });
  });

  describe('CLAUDE.md Generation with Mocked CLI', () => {
    let testRepo: string;
    let mockClaudeOutput: string;

    beforeEach(async () => {
      // Create test repo
      testRepo = mkdtempSync(join(tmpdir(), 'claude-test-repo-'));
      cleanupPaths.push(testRepo);
      
      await execa('git', ['init'], { cwd: testRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRepo });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: testRepo });
      
      writeFileSync(join(testRepo, 'package.json'), JSON.stringify({
        name: 'claude-test',
        scripts: { 
          dev: 'next dev',
          build: 'next build',
          test: 'jest',
          lint: 'eslint'
        }
      }));
      
      await execa('git', ['add', '.'], { cwd: testRepo });
      await execa('git', ['commit', '-m', 'initial'], { cwd: testRepo });

      // Mock Claude CLI output
      mockClaudeOutput = `# Claude Code Workspace

## Overview
This workspace contains 1 repository for development.

## Repositories
- **test-app**: main branch - A Next.js application

## Quick Start
1. Run \`npm install\` in the workspace root
2. Start development with \`npm run test-app:dev\`

## Available Commands
- \`npm run test-app:dev\` - Start development server
- \`npm run test-app:build\` - Build for production
- \`npm run test-app:test\` - Run tests
- \`npm run test-app:lint\` - Lint code

## Repository Details
### test-app
- **Package Manager**: npm
- **Main Scripts**: dev, build, test, lint
- **Location**: repos/test-app/

Happy coding!`;
    });

    test('generates CLAUDE.md with mocked Claude CLI success', async () => {
      // Mock execa for Claude CLI
      const mockExeca = vi.fn().mockImplementation((command: string, args?: string[], options?: Record<string, unknown>) => {
        if (command === 'claude' && args?.[0] === 'code') {
          // Mock successful Claude CLI execution
          return Promise.resolve({
            stdout: mockClaudeOutput,
            stderr: '',
            exitCode: 0
          });
        }
        // For other commands, use real execa
        return vi.importActual('execa').then((mod: { execa: typeof execa }) => mod.execa(command, args, options));
      });

      vi.doMock('execa', () => ({ execa: mockExeca }));

      // Create branch for worktree
      await execa('git', ['branch', 'test-app-branch'], { cwd: testRepo });

      // Create workspace first
      const repoPicks: RepoPick[] = [{
        alias: 'test-app',
        basePath: testRepo,
        branch: 'test-app-branch'
      }];
      
      const { wsDir, mounted } = await createWorkspace(repoPicks);
      cleanupPaths.push(wsDir);
      
      // Mock the Claude CLI child process
      const mockChild = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              // Simulate streaming output
              setTimeout(() => callback(Buffer.from(mockClaudeOutput)), 10);
            }
          }),
          pipe: vi.fn()
        },
        stdin: {
          write: vi.fn(),
          end: vi.fn()
        }
      };

      // Mock execa to return our mock child process
      vi.mocked(mockExeca).mockImplementationOnce(() => {
        return Object.assign(Promise.resolve({
          stdout: mockClaudeOutput,
          stderr: '',
          exitCode: 0
        }), mockChild);
      });
      
      await generateClaudeMd(wsDir, mounted);
      
      // Verify CLAUDE.md was created
      expect(existsSync(join(wsDir, 'CLAUDE.md'))).toBe(true);
      
      // Verify factpack files were created
      expect(existsSync(join(wsDir, 'repos', 'test-app', '.factpack.txt'))).toBe(true);
      
      const factpackContent = readFileSync(join(wsDir, 'repos', 'test-app', '.factpack.txt'), 'utf8');
      expect(factpackContent).toContain('Alias: test-app');
      expect(factpackContent).toContain('Package: claude-test');
      expect(factpackContent).toContain('Branch: test-app-branch');
      expect(factpackContent).toContain('PM: npm');
      expect(factpackContent).toContain('Scripts:');
      expect(factpackContent).toContain('- dev');

      vi.clearAllMocks();
      vi.doUnmock('execa');
    });

    test('generates CLAUDE.md with fallback when Claude CLI fails', async () => {
      // Mock execa to simulate Claude CLI failure
      const mockExeca = vi.fn().mockImplementation((command: string, args?: string[], options?: Record<string, unknown>) => {
        if (command === 'claude' && args?.[0] === 'code') {
          // Mock Claude CLI failure
          return Promise.reject(new Error('Claude CLI not found'));
        }
        // For other commands, use real execa
        return vi.importActual('execa').then((mod: { execa: typeof execa }) => mod.execa(command, args, options));
      });

      vi.doMock('execa', () => ({ execa: mockExeca }));

      // Create branch for worktree
      await execa('git', ['branch', 'test-app-fallback-branch'], { cwd: testRepo });

      // Create workspace first
      const repoPicks: RepoPick[] = [{
        alias: 'test-app',
        basePath: testRepo,
        branch: 'test-app-fallback-branch'
      }];
      
      const { wsDir, mounted } = await createWorkspace(repoPicks);
      cleanupPaths.push(wsDir);
      
      await generateClaudeMd(wsDir, mounted);
      
      // Verify CLAUDE.md was created with fallback
      expect(existsSync(join(wsDir, 'CLAUDE.md'))).toBe(true);
      
      const claudeContent = readFileSync(join(wsDir, 'CLAUDE.md'), 'utf8');
      expect(claudeContent).toContain('# Claude Code Workspace');
      expect(claudeContent).toContain('**test-app**: test-app-fallback-branch');
      expect(claudeContent).toContain('npm run test-app:dev');
      expect(claudeContent).toContain('fallback template');
      
      vi.clearAllMocks();
      vi.doUnmock('execa');
    });
  });

  describe('File System Operations Integration', () => {
    test('workspace skeleton creation', async () => {
      const wsDir = mkdtempSync(join(tmpdir(), 'skeleton-test-'));
      cleanupPaths.push(wsDir);
      
      await ensureWorkspaceSkeleton(wsDir);
      
      expect(existsSync(join(wsDir, 'repos'))).toBe(true);
      expect(existsSync(join(wsDir, '.gitignore'))).toBe(true);
      
      const gitignoreContent = readFileSync(join(wsDir, '.gitignore'), 'utf8');
      expect(gitignoreContent).toContain('repos/');
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('.env*');
    });

    test('node_modules priming with real files', async () => {
      // Create source with node_modules
      const sourceDir = mkdtempSync(join(tmpdir(), 'source-'));
      cleanupPaths.push(sourceDir);
      
      const sourceNodeModules = join(sourceDir, 'node_modules');
      mkdirSync(sourceNodeModules, { recursive: true });
      mkdirSync(join(sourceNodeModules, 'package1'), { recursive: true });
      mkdirSync(join(sourceNodeModules, '.bin'), { recursive: true });
      
      writeFileSync(join(sourceNodeModules, 'package1', 'index.js'), 'module.exports = "test";');
      writeFileSync(join(sourceNodeModules, '.bin', 'executable'), '#!/bin/bash\necho "test"');
      
      // Create destination
      const destDir = mkdtempSync(join(tmpdir(), 'dest-'));
      cleanupPaths.push(destDir);
      
      await primeNodeModules(sourceDir, destDir);
      
      // Verify files were copied
      expect(existsSync(join(destDir, 'node_modules'))).toBe(true);
      expect(existsSync(join(destDir, 'node_modules', 'package1'))).toBe(true);
      expect(existsSync(join(destDir, 'node_modules', '.bin'))).toBe(true);
      expect(existsSync(join(destDir, 'node_modules', 'package1', 'index.js'))).toBe(true);
      
      const copiedContent = readFileSync(join(destDir, 'node_modules', 'package1', 'index.js'), 'utf8');
      expect(copiedContent).toBe('module.exports = "test";');
    });

    test('environment files copying', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'env-source-'));
      cleanupPaths.push(sourceDir);
      
      const destDir = mkdtempSync(join(tmpdir(), 'env-dest-'));
      cleanupPaths.push(destDir);
      
      // Create various env files
      writeFileSync(join(sourceDir, '.env'), 'NODE_ENV=production');
      writeFileSync(join(sourceDir, '.env.local'), 'SECRET=local-secret');
      writeFileSync(join(sourceDir, '.env.test'), 'TEST_VAR=test-value');
      writeFileSync(join(sourceDir, '.env.example'), 'EXAMPLE_VAR=example');
      writeFileSync(join(sourceDir, 'regular-file.txt'), 'not an env file');
      
      await copyEnvFiles(sourceDir, destDir);
      
      // Verify env files were copied
      expect(existsSync(join(destDir, '.env'))).toBe(true);
      expect(existsSync(join(destDir, '.env.local'))).toBe(true);
      expect(existsSync(join(destDir, '.env.test'))).toBe(true);
      expect(existsSync(join(destDir, '.env.example'))).toBe(true);
      
      // Verify regular files were not copied
      expect(existsSync(join(destDir, 'regular-file.txt'))).toBe(false);
      
      // Verify content is correct
      const envContent = readFileSync(join(destDir, '.env'), 'utf8');
      expect(envContent).toBe('NODE_ENV=production');
      
      const envLocalContent = readFileSync(join(destDir, '.env.local'), 'utf8');
      expect(envLocalContent).toBe('SECRET=local-secret');
    });
  });

  describe('End-to-End Workflow Validation', () => {
    test('complete workflow with multiple package managers and branches', async () => {
      // Create a complex scenario with multiple repos and branches
      const mainRepo = mkdtempSync(join(tmpdir(), 'main-repo-'));
      cleanupPaths.push(mainRepo);
      
      // Initialize main repo
      await execa('git', ['init'], { cwd: mainRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: mainRepo });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: mainRepo });
      
      // Create main branch content
      writeFileSync(join(mainRepo, 'package.json'), JSON.stringify({
        name: 'main-app',
        scripts: { dev: 'vite', build: 'vite build' }
      }));
      
      mkdirSync(join(mainRepo, 'node_modules', 'vite'), { recursive: true });
      writeFileSync(join(mainRepo, '.env'), 'VITE_API_URL=http://localhost:3000');
      
      await execa('git', ['add', '.'], { cwd: mainRepo });
      await execa('git', ['commit', '-m', 'main branch'], { cwd: mainRepo });
      
      // Create feature branch
      await execa('git', ['checkout', '-b', 'feature/new-ui'], { cwd: mainRepo });
      mkdirSync(join(mainRepo, 'src'), { recursive: true });
      writeFileSync(join(mainRepo, 'src', 'NewComponent.vue'), '<template><div>New UI</div></template>');
      
      await execa('git', ['add', '.'], { cwd: mainRepo });
      await execa('git', ['commit', '-m', 'add new component'], { cwd: mainRepo });
      await execa('git', ['checkout', 'main'], { cwd: mainRepo });
      
      // Create API repo with pnpm
      const apiRepo = mkdtempSync(join(tmpdir(), 'api-repo-'));
      cleanupPaths.push(apiRepo);
      
      await execa('git', ['init'], { cwd: apiRepo });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: apiRepo });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: apiRepo });
      
      writeFileSync(join(apiRepo, 'package.json'), JSON.stringify({
        name: 'api-server',
        packageManager: 'pnpm@8.0.0',
        scripts: { dev: 'nodemon server.js', start: 'node server.js' }
      }));
      
      writeFileSync(join(apiRepo, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');
      mkdirSync(join(apiRepo, 'node_modules', 'nodemon'), { recursive: true });
      writeFileSync(join(apiRepo, '.env'), 'PORT=3000\nDB_URL=postgresql://localhost/api');
      
      await execa('git', ['add', '.'], { cwd: apiRepo });
      await execa('git', ['commit', '-m', 'api initial'], { cwd: apiRepo });
      
      // Create additional branches for worktrees (since main is checked out)
      await execa('git', ['branch', 'main-branch'], { cwd: mainRepo });
      await execa('git', ['branch', 'api-branch'], { cwd: apiRepo });
      
      // Create workspace with multiple repos and branches
      const repoPicks: RepoPick[] = [
        { alias: 'frontend', basePath: mainRepo, branch: 'main-branch' },
        { alias: 'frontend-feature', basePath: mainRepo, branch: 'feature/new-ui' },
        { alias: 'api', basePath: apiRepo, branch: 'api-branch' }
      ];
      
      const { wsDir, mounted } = await createWorkspace(repoPicks);
      cleanupPaths.push(wsDir);
      
      // Verify all three repos are mounted
      expect(mounted).toHaveLength(3);
      
      const frontend = mounted.find(r => r.alias === 'frontend');
      const frontendFeature = mounted.find(r => r.alias === 'frontend-feature');
      const api = mounted.find(r => r.alias === 'api');
      
      expect(frontend).toBeDefined();
      expect(frontendFeature).toBeDefined();
      expect(api).toBeDefined();
      
      // Verify package managers
      expect(frontend!.packageManager).toBe('npm');
      expect(frontendFeature!.packageManager).toBe('npm');
      expect(api!.packageManager).toBe('pnpm'); // Detected from package.json packageManager field
      
      // Verify branch-specific content
      expect(existsSync(join(wsDir, 'repos', 'frontend-feature', 'src', 'NewComponent.vue'))).toBe(true);
      expect(existsSync(join(wsDir, 'repos', 'frontend', 'src', 'NewComponent.vue'))).toBe(false);
      
      // Verify all environments are set up
      expect(existsSync(join(wsDir, 'repos', 'frontend', '.env'))).toBe(true);
      expect(existsSync(join(wsDir, 'repos', 'api', '.env'))).toBe(true);
      
      // Verify node_modules are primed for all repos
      expect(existsSync(join(wsDir, 'repos', 'frontend', 'node_modules', 'vite'))).toBe(true);
      expect(existsSync(join(wsDir, 'repos', 'api', 'node_modules', 'nodemon'))).toBe(true);
      
      // Generate CLAUDE.md (will use fallback)
      await generateClaudeMd(wsDir, mounted);
      expect(existsSync(join(wsDir, 'CLAUDE.md'))).toBe(true);
      
      const claudeContent = readFileSync(join(wsDir, 'CLAUDE.md'), 'utf8');
      expect(claudeContent).toContain('frontend');
      expect(claudeContent).toContain('frontend-feature');
      expect(claudeContent).toContain('api');
    });
  });
});