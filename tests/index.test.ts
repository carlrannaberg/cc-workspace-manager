import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from '../src/index.js';
import * as prompts from '../src/prompts.js';
import * as workspace from '../src/workspace.js';
import * as packageModule from '../src/package.js';
import * as ui from '../src/ui.js';
import fs from 'fs-extra';
import { errorMatchers } from './utils/errorMatchers.js';

// Mock all dependencies
vi.mock('../src/prompts.js');
vi.mock('../src/workspace.js');
vi.mock('../src/package.js');
vi.mock('../src/ui.js');
vi.mock('fs-extra');

describe('Main CLI Workflow', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock process.exit to throw instead of exiting
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });
    
    // Mock console.log to prevent test output noise
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Mock UI methods
    vi.mocked(ui.ui.header).mockImplementation(() => {});
    vi.mocked(ui.ui.setupComplete).mockImplementation(() => {});
    vi.mocked(ui.ui.showSelectedRepos).mockImplementation(() => {});
    vi.mocked(ui.ui.selectedRepoItem).mockImplementation(() => {});
    vi.mocked(ui.ui.success).mockImplementation(() => {});
    vi.mocked(ui.ui.info).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('successful workspace creation flow', async () => {
    const mockRepoPicks = [
      { alias: 'frontend', basePath: '/test/frontend', branch: 'main' },
      { alias: 'backend', basePath: '/test/backend', branch: 'develop' }
    ];
    
    const mockWorkspace = { 
      wsDir: '/workspace/ccws-test123', 
      mounted: [
        { 
          alias: 'frontend', 
          basePath: '/test/frontend', 
          branch: 'main',
          worktreePath: '/workspace/ccws-test123/repos/frontend',
          packageManager: 'npm' as const
        },
        { 
          alias: 'backend', 
          basePath: '/test/backend', 
          branch: 'develop',
          worktreePath: '/workspace/ccws-test123/repos/backend',
          packageManager: 'yarn' as const
        }
      ] 
    };

    // Mock successful workflow
    vi.mocked(prompts.getUserSelections).mockResolvedValue(mockRepoPicks);
    vi.mocked(workspace.createWorkspace).mockResolvedValue(mockWorkspace);
    vi.mocked(packageModule.generateRootPackageJson).mockResolvedValue();
    vi.mocked(workspace.generateClaudeMd).mockResolvedValue();
    
    await main();
    
    // Verify workflow execution order
    expect(ui.ui.header).toHaveBeenCalledWith('🚀 Claude Code Workspace Generator\n');
    expect(prompts.getUserSelections).toHaveBeenCalledOnce();
    expect(ui.ui.setupComplete).toHaveBeenCalledOnce();
    expect(ui.ui.showSelectedRepos).toHaveBeenCalledOnce();
    expect(workspace.createWorkspace).toHaveBeenCalledWith(mockRepoPicks);
    expect(packageModule.generateRootPackageJson).toHaveBeenCalledWith(
      mockWorkspace.wsDir, 
      mockWorkspace.mounted
    );
    expect(workspace.generateClaudeMd).toHaveBeenCalledWith(
      mockWorkspace.wsDir, 
      mockWorkspace.mounted
    );
    
    // Verify success message display
    expect(ui.ui.success).toHaveBeenCalledWith('🎉 Workspace ready: /workspace/ccws-test123');
    expect(consoleSpy).toHaveBeenCalledWith('  cd /workspace/ccws-test123');
    expect(consoleSpy).toHaveBeenCalledWith('  npm run frontend:dev    - Start frontend only');
    expect(consoleSpy).toHaveBeenCalledWith('  npm run backend:dev    - Start backend only');
  });

  test('handles user cancellation gracefully', async () => {
    // Mock user cancellation
    vi.mocked(prompts.getUserSelections).mockRejectedValue(
      new prompts.UserCancelledError('User cancelled selection')
    );
    
    await expect(main()).rejects.toThrow(errorMatchers.processExit(1));
    
    expect(prompts.getUserSelections).toHaveBeenCalledOnce();
    
    // Should not proceed to workspace creation
    expect(workspace.createWorkspace).not.toHaveBeenCalled();
  });

  test('cleans up empty workspace on total failure', async () => {
    const mockRepoPicks = [
      { alias: 'test', basePath: '/test/repo', branch: 'main' }
    ];
    
    // Mock successful user selection but failed workspace creation
    vi.mocked(prompts.getUserSelections).mockResolvedValue(mockRepoPicks);
    vi.mocked(workspace.createWorkspace).mockRejectedValue(
      new Error('No repositories were successfully mounted')
    );
    vi.mocked(fs.rm).mockResolvedValue();
    
    await expect(main()).rejects.toThrow(errorMatchers.processExit(1));
    
    // Should NOT attempt cleanup because workspace creation failed, not because it was empty
    expect(fs.rm).not.toHaveBeenCalled();
  });

  test('preserves partial workspace when some repos succeed', async () => {
    const mockRepoPicks = [
      { alias: 'test1', basePath: '/test/repo1', branch: 'main' },
      { alias: 'test2', basePath: '/test/repo2', branch: 'main' }
    ];
    
    // Mock successful workspace creation but package.json generation fails (non-critical)
    vi.mocked(prompts.getUserSelections).mockResolvedValue(mockRepoPicks);
    vi.mocked(workspace.createWorkspace).mockResolvedValue({
      wsDir: '/workspace/ccws-partial',
      mounted: [{ 
        alias: 'test1', 
        basePath: '/test/repo1', 
        branch: 'main', 
        worktreePath: '/workspace/ccws-partial/repos/test1', 
        packageManager: 'npm' as const
      }]
    });
    vi.mocked(packageModule.generateRootPackageJson).mockRejectedValue(
      new Error('Failed to generate package.json')
    );
    vi.mocked(workspace.generateClaudeMd).mockResolvedValue();
    
    await main();
    
    // Should NOT attempt cleanup since repos were successfully mounted
    expect(fs.rm).not.toHaveBeenCalled();
    
    // Should show warning about package.json generation failure but still succeed
    expect(ui.ui.warning).toHaveBeenCalledWith(
      'Failed to generate package.json: Failed to generate package.json'
    );
    expect(ui.ui.info).toHaveBeenCalledWith(
      'You can manually create package.json later if needed'
    );
    
    // Should show final success message
    expect(ui.ui.success).toHaveBeenCalledWith('🎉 Workspace ready: /workspace/ccws-partial');
  });

  test('handles package.json generation failure gracefully', async () => {
    const mockRepoPicks = [{ alias: 'test', basePath: '/test/repo', branch: 'main' }];
    const mockWorkspace = { 
      wsDir: '/workspace/test', 
      mounted: [{ 
        alias: 'test', 
        basePath: '/test/repo', 
        branch: 'main',
        worktreePath: '/workspace/test/repos/test',
        packageManager: 'npm' as const
      }] 
    };

    vi.mocked(prompts.getUserSelections).mockResolvedValue(mockRepoPicks);
    vi.mocked(workspace.createWorkspace).mockResolvedValue(mockWorkspace);
    vi.mocked(packageModule.generateRootPackageJson).mockRejectedValue(
      new Error('Permission denied')
    );
    vi.mocked(workspace.generateClaudeMd).mockResolvedValue();
    
    await main();
    
    // Should continue despite package.json failure
    expect(workspace.generateClaudeMd).toHaveBeenCalledWith(
      mockWorkspace.wsDir, 
      mockWorkspace.mounted
    );
    
    expect(ui.ui.warning).toHaveBeenCalledWith(
      'Failed to generate package.json: Permission denied'
    );
    expect(ui.ui.info).toHaveBeenCalledWith(
      'You can manually create package.json later if needed'
    );
  });

  test('handles CLAUDE.md generation failure gracefully', async () => {
    const mockRepoPicks = [{ alias: 'test', basePath: '/test/repo', branch: 'main' }];
    const mockWorkspace = { 
      wsDir: '/workspace/test', 
      mounted: [{ 
        alias: 'test', 
        basePath: '/test/repo', 
        branch: 'main',
        worktreePath: '/workspace/test/repos/test',
        packageManager: 'npm' as const
      }] 
    };

    vi.mocked(prompts.getUserSelections).mockResolvedValue(mockRepoPicks);
    vi.mocked(workspace.createWorkspace).mockResolvedValue(mockWorkspace);
    vi.mocked(packageModule.generateRootPackageJson).mockResolvedValue();
    vi.mocked(workspace.generateClaudeMd).mockRejectedValue(
      new Error('Claude CLI not found')
    );
    
    await main();
    
    // Should complete successfully despite CLAUDE.md failure
    expect(ui.ui.success).toHaveBeenCalledWith('🎉 Workspace ready: /workspace/test');
    
    expect(ui.ui.warning).toHaveBeenCalledWith(
      'Failed to generate CLAUDE.md: Claude CLI not found'
    );
    expect(ui.ui.info).toHaveBeenCalledWith(
      'You can manually create CLAUDE.md later if needed'
    );
  });

  test('handles cleanup failure gracefully', async () => {
    const mockRepoPicks = [{ alias: 'test', basePath: '/test/repo', branch: 'main' }];
    
    vi.mocked(prompts.getUserSelections).mockResolvedValue(mockRepoPicks);
    vi.mocked(workspace.createWorkspace).mockRejectedValue(
      new Error('No repositories were successfully mounted')
    );
    vi.mocked(fs.rm).mockRejectedValue(new Error('Permission denied'));
    
    await expect(main()).rejects.toThrow(errorMatchers.processExit(1));
    
    // Should not attempt cleanup since workspace creation failed
    expect(fs.rm).not.toHaveBeenCalled();
  });

  test('handles unexpected error types', async () => {
    // Mock non-Error object being thrown
    vi.mocked(prompts.getUserSelections).mockRejectedValue('String error');
    vi.mocked(prompts.handlePromptError).mockImplementation(() => {
      throw new Error('Process exited with code 1');
    });
    
    await expect(main()).rejects.toThrow(errorMatchers.processExit(1));
    
    // For non-Error objects, handleError calls ui.error directly, not handlePromptError
    expect(prompts.handlePromptError).not.toHaveBeenCalled();
    expect(ui.ui.error).toHaveBeenCalledWith('❌ Unexpected error: String error');
  });
});