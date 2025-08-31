import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import type { RepoMounted } from '../src/types.js';
import { EnvironmentUtils } from '../src/utils/environment.js';

describe('Claude CLI Integration (streaming pipeline)', () => {
  let wsDir: string;
  let repoDir: string;

  beforeEach(() => {
    // Ensure tests see non-test environment for this suite
    vi.spyOn(EnvironmentUtils, 'isTestEnvironment').mockReturnValue(false);

    const base = join(process.cwd(), 'temp', `claude-cli-${Date.now().toString(36)}`);
    wsDir = join(base, 'ws');
    repoDir = join(base, 'repo');
    mkdirSync(wsDir, { recursive: true });
    mkdirSync(repoDir, { recursive: true });

    // Minimal package.json to allow factpack creation
    writeFileSync(
      join(repoDir, 'package.json'),
      JSON.stringify({ name: 'claude-test', scripts: { dev: 'echo dev' } }, null, 2)
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    try { rmSync(join(wsDir, '..'), { recursive: true, force: true }); } catch {}
    vi.restoreAllMocks();
  });

  function createFakeProcess({ stdoutData, code = 0, delay = 10 }: { stdoutData?: string; code?: number; delay?: number }) {
    // Minimal EventEmitter-like process with stdout stream and close event
    const stdout = new PassThrough();
    const listeners: Record<string, Array<(arg: any) => void>> = {};
    const on = (event: string, cb: (arg: any) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
      return proc as any;
    };
    const emit = (event: string, arg?: any) => {
      (listeners[event] || []).forEach((cb) => cb(arg));
    };
    const kill = () => emit('close', code);
    const proc = { stdout, on, kill } as any;

    // Emit data then close
    setTimeout(() => {
      if (stdoutData) stdout.write(Buffer.from(stdoutData));
      stdout.end();
      emit('close', code);
    }, delay);

    return proc;
  }

  test('streams via @agent-io/stream and writes CLAUDE.md', async () => {
    vi.resetModules();
    // Force non-test environment in workspace's EnvironmentUtils
    vi.mock('../src/utils/environment.js', () => ({
      EnvironmentUtils: {
        isTestEnvironment: () => false,
        getEnvironmentDescription: () => 'override'
      }
    }));
    vi.mock('child_process', () => ({ spawn: vi.fn() }));
    const childProc = await import('child_process');
    const spawnMock = vi.mocked(childProc.spawn);
    // Arrange spawn behavior: first for 'claude', second for 'npx -y @agent-io/stream'
    spawnMock.mockImplementation((cmd: string, args: string[] = []) => {
      if (cmd === 'claude') {
        // Claude emits NDJSON; streamer will transform, but our test simulates streamer output directly
        const json = JSON.stringify({ text: '# Streamed Title\n' }) + '\n';
        return createFakeProcess({ stdoutData: json });
      }
      if (cmd === 'npx' && args.includes('@agent-io/stream')) {
        // Streamer outputs final rendered markdown
        return createFakeProcess({ stdoutData: '# Claude Code Workspace\nStreamed content\n' });
      }
      throw new Error(`Unexpected spawn: ${cmd} ${args.join(' ')}`);
    });

    const repos: RepoMounted[] = [{
      alias: 'app',
      basePath: repoDir,
      branch: 'test-branch',
      worktreePath: repoDir,
      packageManager: 'npm'
    }];

    // Act
    const { generateClaudeMd } = await import('../src/workspace.js');
    await generateClaudeMd(wsDir, repos);

    // Assert
    const mdPath = join(wsDir, 'CLAUDE.md');
    expect(existsSync(mdPath)).toBe(true);
    const content = readFileSync(mdPath, 'utf8');
    expect(content).toContain('Claude Code Workspace');
    expect(content).toContain('Streamed content');
  });

  test('falls back to template when streaming fails', async () => {
    vi.resetModules();
    vi.mock('../src/utils/environment.js', () => ({
      EnvironmentUtils: {
        isTestEnvironment: () => false,
        getEnvironmentDescription: () => 'override'
      }
    }));
    vi.mock('child_process', () => ({ spawn: vi.fn(() => { throw new Error('streamer not available'); }) }));
    vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: '# Direct Output\nOK', stderr: '', exitCode: 0 }) }));
    const childProc = await import('child_process');
    const spawnMock = vi.mocked(childProc.spawn);
    // First, make streaming throw; then mock execa for direct mode
    spawnMock.mockImplementation(() => { throw new Error('streamer not available'); });

    const repos: RepoMounted[] = [{
      alias: 'app',
      basePath: repoDir,
      branch: 'test-branch',
      worktreePath: repoDir,
      packageManager: 'npm'
    }];

    const { generateClaudeMd } = await import('../src/workspace.js');
    await generateClaudeMd(wsDir, repos);

    const mdPath = join(wsDir, 'CLAUDE.md');
    expect(existsSync(mdPath)).toBe(true);
    const content = readFileSync(mdPath, 'utf8');
    expect(content).toContain('fallback template');
    
  });
});
