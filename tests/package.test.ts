import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateRootPackageJson } from '../src/package.js';
import fs from 'fs-extra';
import { join } from 'path';
import type { RepoMounted } from '../src/types.js';

// Mock dependencies
vi.mock('fs-extra');

describe('Package.json Generation', () => {
  const mockWsDir = '/test/workspace';
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.writeJSON).mockResolvedValue();
  });

  test('generates package.json with all repo scripts', async () => {
    const mounted: RepoMounted[] = [
      {
        alias: 'frontend',
        basePath: '/repos/frontend',
        branch: 'main',
        worktreePath: '/workspace/repos/frontend',
        packageManager: 'npm'
      },
      {
        alias: 'backend',
        basePath: '/repos/backend', 
        branch: 'develop',
        worktreePath: '/workspace/repos/backend',
        packageManager: 'yarn'
      }
    ];
    
    await generateRootPackageJson(mockWsDir, mounted);
    
    const [path, content] = vi.mocked(fs.writeJSON).mock.calls[0];
    
    expect(path).toBe(join(mockWsDir, 'package.json'));
    expect(content.name).toBe('cc-workspace');
    expect(content.private).toBe(true);
    
    // Verify individual repo scripts
    expect(content.scripts['frontend:dev']).toBe('npm --prefix ./repos/frontend run dev');
    expect(content.scripts['frontend:build']).toBe('npm --prefix ./repos/frontend run build');
    expect(content.scripts['frontend:test']).toBe('npm --prefix ./repos/frontend run test');
    expect(content.scripts['frontend:lint']).toBe('npm --prefix ./repos/frontend run lint');
    expect(content.scripts['frontend:start']).toBe('npm --prefix ./repos/frontend run start');
    
    expect(content.scripts['backend:dev']).toBe('yarn --cwd ./repos/backend dev');
    expect(content.scripts['backend:build']).toBe('yarn --cwd ./repos/backend build');
    expect(content.scripts['backend:test']).toBe('yarn --cwd ./repos/backend test');
    expect(content.scripts['backend:lint']).toBe('yarn --cwd ./repos/backend lint');
    expect(content.scripts['backend:start']).toBe('yarn --cwd ./repos/backend start');
    
    // Verify combined scripts
    expect(content.scripts.dev).toContain('concurrently');
    expect(content.scripts.dev).toContain('FRONTEND,BACKEND');
    expect(content.scripts.dev).toContain('frontend:dev');
    expect(content.scripts.dev).toContain('backend:dev');
    
    expect(content.scripts['build:all']).toContain('frontend:build');
    expect(content.scripts['build:all']).toContain('backend:build');
    
    expect(content.scripts['test:all']).toContain('frontend:test');
    expect(content.scripts['test:all']).toContain('backend:test');
    
    // Verify metadata
    expect(content.ccws.repositories).toHaveLength(2);
    expect(content.ccws.repositories[0].alias).toBe('frontend');
    expect(content.ccws.repositories[0].branch).toBe('main');
    expect(content.ccws.repositories[0].packageManager).toBe('npm');
    expect(content.ccws.repositories[1].alias).toBe('backend');
    expect(content.ccws.repositories[1].branch).toBe('develop');
    expect(content.ccws.repositories[1].packageManager).toBe('yarn');
    expect(content.ccws.created).toBeDefined();
    expect(new Date(content.ccws.created).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  test('handles empty mounted repos array', async () => {
    await generateRootPackageJson(mockWsDir, []);
    
    const [, content] = vi.mocked(fs.writeJSON).mock.calls[0];
    
    expect(content.scripts).toEqual({});
    expect(content.ccws.repositories).toEqual([]);
    expect(content.name).toBe('cc-workspace');
    expect(content.private).toBe(true);
  });

  test('generates correct pnpm commands', async () => {
    const mounted: RepoMounted[] = [{
      alias: 'app',
      basePath: '/app',
      branch: 'main',
      worktreePath: '/workspace/repos/app',
      packageManager: 'pnpm'
    }];
    
    await generateRootPackageJson(mockWsDir, mounted);
    
    const [, content] = vi.mocked(fs.writeJSON).mock.calls[0];
    
    expect(content.scripts['app:dev']).toBe('pnpm -C ./repos/app dev');
    expect(content.scripts['app:build']).toBe('pnpm -C ./repos/app build');
    expect(content.scripts['app:test']).toBe('pnpm -C ./repos/app test');
    expect(content.scripts['app:lint']).toBe('pnpm -C ./repos/app lint');
    expect(content.scripts['app:start']).toBe('pnpm -C ./repos/app start');
  });

  test('handles single repository correctly', async () => {
    const mounted: RepoMounted[] = [{
      alias: 'solo',
      basePath: '/solo',
      branch: 'feature/test',
      worktreePath: '/workspace/repos/solo',
      packageManager: 'npm'
    }];
    
    await generateRootPackageJson(mockWsDir, mounted);
    
    const [, content] = vi.mocked(fs.writeJSON).mock.calls[0];
    
    // Should still generate combined scripts even for single repo
    expect(content.scripts.dev).toContain('concurrently');
    expect(content.scripts.dev).toContain('SOLO');
    expect(content.scripts.dev).toContain('solo:dev');
    
    expect(content.scripts['build:all']).toBe('concurrently "npm run solo:build"');
    expect(content.scripts['test:all']).toBe('concurrently "npm run solo:test"');
  });

  test('handles repositories with special characters in aliases', async () => {
    const mounted: RepoMounted[] = [
      {
        alias: 'my-frontend',
        basePath: '/repos/my-frontend',
        branch: 'main',
        worktreePath: '/workspace/repos/my-frontend',
        packageManager: 'npm'
      },
      {
        alias: 'api_v2',
        basePath: '/repos/api_v2',
        branch: 'main',
        worktreePath: '/workspace/repos/api_v2',
        packageManager: 'yarn'
      }
    ];
    
    await generateRootPackageJson(mockWsDir, mounted);
    
    const [, content] = vi.mocked(fs.writeJSON).mock.calls[0];
    
    expect(content.scripts['my-frontend:dev']).toBeDefined();
    expect(content.scripts['api_v2:dev']).toBeDefined();
    
    // Combined scripts should handle special characters
    expect(content.scripts.dev).toContain('MY-FRONTEND,API_V2');
  });

  test('generates workspace metadata correctly', async () => {
    const mounted: RepoMounted[] = [
      {
        alias: 'test-repo',
        basePath: '/path/to/repo',
        branch: 'feature/branch',
        worktreePath: '/workspace/repos/test-repo',
        packageManager: 'pnpm'
      }
    ];
    
    const beforeTime = Date.now();
    await generateRootPackageJson(mockWsDir, mounted);
    const afterTime = Date.now();
    
    const [, content] = vi.mocked(fs.writeJSON).mock.calls[0];
    
    expect(content.ccws).toBeDefined();
    expect(content.version).toBe('1.0.0'); // Workspace package version, not ccws.version
    expect(new Date(content.ccws.created).getTime()).toBeGreaterThanOrEqual(beforeTime);
    expect(new Date(content.ccws.created).getTime()).toBeLessThanOrEqual(afterTime);
    expect(content.ccws.repositories).toHaveLength(1);
    expect(content.ccws.repositories[0]).toEqual({
      alias: 'test-repo',
      basePath: '/path/to/repo',
      branch: 'feature/branch',
      packageManager: 'pnpm'
    });
  });

  test('installs concurrently dependency', async () => {
    const mounted: RepoMounted[] = [
      {
        alias: 'app1',
        basePath: '/app1',
        branch: 'main',
        worktreePath: '/workspace/repos/app1',
        packageManager: 'npm'
      },
      {
        alias: 'app2',
        basePath: '/app2',
        branch: 'main',
        worktreePath: '/workspace/repos/app2',
        packageManager: 'npm'
      }
    ];
    
    await generateRootPackageJson(mockWsDir, mounted);
    
    const [, content] = vi.mocked(fs.writeJSON).mock.calls[0];
    
    expect(content.devDependencies).toBeDefined();
    expect(content.devDependencies.concurrently).toBe('^9.0.0');
  });

  test('uses pretty JSON formatting', async () => {
    const mounted: RepoMounted[] = [{
      alias: 'test',
      basePath: '/test',
      branch: 'main',
      worktreePath: '/workspace/repos/test',
      packageManager: 'npm'
    }];
    
    await generateRootPackageJson(mockWsDir, mounted);
    
    const writeJSONCall = vi.mocked(fs.writeJSON).mock.calls[0];
    const options = writeJSONCall[2];
    
    expect(options).toEqual({ spaces: 2 });
  });
});