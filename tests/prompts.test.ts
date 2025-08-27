import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as inquirerPrompts from '@inquirer/prompts';
import { getUserSelections, UserCancelledError, handlePromptError } from '../src/prompts.js';
import * as git from '../src/git.js';
import * as ui from '../src/ui.js';

// Type definitions for inquirer prompt options
interface InputOptions {
  message: string;
  default?: string;
  validate?: (input: string) => boolean | string;
}

interface CheckboxOptions {
  message: string;
  choices: Array<{ name: string; value: string; checked?: boolean }>;
  required?: boolean;
  validate?: (input: string[]) => boolean | string;
}

// Mock all dependencies
vi.mock('@inquirer/prompts');
vi.mock('../src/git.js');
vi.mock('../src/ui.js');

describe('User Prompts', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock process.exit
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Mock UI functions
    vi.mocked(ui.ui.header).mockImplementation(() => {});
    vi.mocked(ui.ui.searching).mockImplementation(() => {});
    vi.mocked(ui.ui.foundRepos).mockImplementation(() => {});
    vi.mocked(ui.ui.configuring).mockImplementation(() => {});
    vi.mocked(ui.ui.noReposFound).mockImplementation(() => {});
    vi.mocked(ui.ui.success).mockImplementation(() => {});
    vi.mocked(ui.ui.error).mockImplementation(() => {});
    vi.mocked(ui.ui.info).mockImplementation(() => {});
    vi.mocked(ui.ui.warning).mockImplementation(() => {});
    vi.mocked(ui.ui.userCancelled).mockImplementation(() => {});
    vi.mocked(ui.ui.noReposSelected).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('complete selection flow with valid inputs', async () => {
    const mockRepos = ['/test/frontend', '/test/backend'];
    
    vi.mocked(git.discoverRepos).mockResolvedValue(mockRepos);
    vi.mocked(git.currentBranch)
      .mockResolvedValueOnce('main')    // for frontend
      .mockResolvedValueOnce('develop'); // for backend
    
    // Mock input sequence
    vi.mocked(inquirerPrompts.input)
      .mockResolvedValueOnce('/base/dir')     // base directory
      .mockResolvedValueOnce('frontend')      // alias for repo1
      .mockResolvedValueOnce('main')          // branch for repo1
      .mockResolvedValueOnce('backend')       // alias for repo2
      .mockResolvedValueOnce('develop');      // branch for repo2
    
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(mockRepos);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);
    
    const result = await getUserSelections();
    
    expect(result).toEqual([
      { alias: 'frontend', basePath: '/test/frontend', branch: 'main' },
      { alias: 'backend', basePath: '/test/backend', branch: 'develop' }
    ]);
    
    // Verify UI feedback
    expect(ui.ui.header).toHaveBeenCalledWith('🔧 CC Workspace Manager - Repository Setup\n');
    expect(ui.ui.searching).toHaveBeenCalledWith('/base/dir');
    expect(ui.ui.foundRepos).toHaveBeenCalledWith(2);
    expect(ui.ui.configuring).toHaveBeenCalledWith(2);
  });

  test('validates base directory input', async () => {
    const mockRepos = ['/test/repo'];
    
    vi.mocked(git.discoverRepos).mockResolvedValue(mockRepos);
    vi.mocked(git.currentBranch).mockResolvedValue('main');
    
    // Mock input with validation testing
    let inputCallCount = 0;
    vi.mocked(inquirerPrompts.input).mockImplementation(async (options: InputOptions) => {
      inputCallCount++;
      
      if (inputCallCount === 1) {
        // Test base directory validation
        const validate = options.validate;
        if (validate) {
          expect(validate('')).toBe('Base directory cannot be empty');
          expect(validate('   ')).toBe('Base directory cannot be empty'); 
          expect(validate('/valid/path')).toBe(true);
        }
        return '/valid/path';
      }
      
      // Subsequent calls for alias/branch
      return inputCallCount === 2 ? 'test-alias' : 'main';
    });
    
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(mockRepos);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);
    
    await getUserSelections();
    
    expect(inquirerPrompts.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Base directory to search for repositories:',
        default: process.cwd()
      })
    );
  });

  test('validates alias format and uniqueness', async () => {
    const mockRepos = ['/test/repo1', '/test/repo2'];
    
    vi.mocked(git.discoverRepos).mockResolvedValue(mockRepos);
    vi.mocked(git.currentBranch).mockResolvedValue('main');
    
    let inputCallCount = 0;
    vi.mocked(inquirerPrompts.input).mockImplementation(async (options: InputOptions) => {
      inputCallCount++;
      
      if (inputCallCount === 1) return '/base/dir';
      
      const validate = options.validate;
      if (validate && inputCallCount === 2) {
        // Test alias validation for first repo
        expect(validate('')).toBe('Alias cannot be empty');
        expect(validate('   ')).toBe('Alias cannot be empty');
        expect(validate('invalid@alias')).toBe('Alias can only contain letters, numbers, hyphens, and underscores');
        expect(validate('validAlias123')).toBe(true);
        return 'frontend';
      }
      
      if (validate && inputCallCount === 4) {
        // Test alias validation for second repo (check uniqueness)
        const existingAliases = ['frontend'];
        expect(validate('frontend')).toBe('This alias is already in use, please choose a different one');
        expect(validate('backend')).toBe(true);
        return 'backend';
      }
      
      // Branch inputs
      return 'main';
    });
    
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(mockRepos);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);
    
    await getUserSelections();
    
    expect(inquirerPrompts.input).toHaveBeenCalledTimes(5); // base + 2*(alias+branch)
  });

  test('handles no repositories found', async () => {
    vi.mocked(git.discoverRepos).mockResolvedValue([]);
    vi.mocked(inquirerPrompts.input).mockResolvedValue('/empty/dir');
    
    await expect(getUserSelections()).rejects.toThrow('No git repositories found in /empty/dir');
    
    expect(ui.ui.noReposFound).toHaveBeenCalledWith('/empty/dir');
  });

  test('handles user refusing to proceed with no selected repos', async () => {
    const mockRepos = ['/test/repo1', '/test/repo2'];
    
    vi.mocked(git.discoverRepos).mockResolvedValue(mockRepos);
    vi.mocked(inquirerPrompts.input).mockResolvedValue('/base/dir');
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue([]); // No repos selected
    
    await expect(getUserSelections()).rejects.toThrow(
      'No repositories selected'
    );
  });

  test('handles configuration cancellation', async () => {
    const mockRepos = ['/test/repo'];
    
    vi.mocked(git.discoverRepos).mockResolvedValue(mockRepos);
    vi.mocked(git.currentBranch).mockResolvedValue('main');
    
    vi.mocked(inquirerPrompts.input)
      .mockResolvedValueOnce('/base/dir')
      .mockResolvedValueOnce('test-alias')
      .mockResolvedValueOnce('main');
    
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(mockRepos);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(false); // Cancel configuration
    
    await expect(getUserSelections()).rejects.toThrow(UserCancelledError);
  });

  test('handles Ctrl+C cancellation during input', async () => {
    const exitError = new Error('User force closed the prompt');
    exitError.name = 'ExitPromptError';
    
    vi.mocked(inquirerPrompts.input).mockRejectedValue(exitError);
    
    await expect(getUserSelections()).rejects.toThrow(UserCancelledError);
  });

  test('handles interrupt signals (SIGINT)', async () => {
    const interruptError = new Error('Interrupted');
    interruptError.name = 'AbortError';
    
    vi.mocked(inquirerPrompts.input).mockRejectedValue(interruptError);
    
    // This should NOT convert to UserCancelledError, only ExitPromptError does that
    await expect(getUserSelections()).rejects.toThrow('Interrupted');
  });

  test('validates branch names', async () => {
    const mockRepos = ['/test/repo'];
    
    vi.mocked(git.discoverRepos).mockResolvedValue(mockRepos);
    vi.mocked(git.currentBranch).mockResolvedValue('main');
    
    let inputCallCount = 0;
    vi.mocked(inquirerPrompts.input).mockImplementation(async (options: InputOptions) => {
      inputCallCount++;
      
      if (inputCallCount === 1) return '/base/dir';
      if (inputCallCount === 2) return 'test-alias';
      
      // Branch validation
      const validate = options.validate;
      if (validate && inputCallCount === 3) {
        expect(validate('')).toBe('Branch cannot be empty');
        expect(validate('   ')).toBe('Branch cannot be empty');
        expect(validate('valid-branch')).toBe(true);
        expect(validate('feature/branch')).toBe(true);
        return 'main';
      }
      
      return 'main';
    });
    
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(mockRepos);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);
    
    await getUserSelections();
  });

  describe('Error Handler', () => {
    beforeEach(() => {
      exitSpy.mockClear();
      consoleSpy.mockClear();
    });
    
    test('handles UserCancelledError with code 0', () => {
      // Mock process.exit to not throw to allow UI method verification
      exitSpy.mockImplementation(() => undefined as never);
      
      handlePromptError(new UserCancelledError('Test cancellation'));
      
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(ui.ui.warning).toHaveBeenCalledWith('⚠️  Operation cancelled by user');
    });
    
    test('handles no repositories found error with suggestions', () => {
      handlePromptError(new Error('No git repositories found in /test/dir'));
      
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(ui.ui.error).toHaveBeenCalledWith('❌ Setup failed: No repositories to configure');
      expect(ui.ui.warning).toHaveBeenCalledWith('💡 Try running from a directory that contains git repositories');
    });
    
    test('handles repository selection error', () => {
      // Mock process.exit to not throw to allow UI method verification
      exitSpy.mockImplementation(() => undefined as never);
      
      handlePromptError(new Error('No repositories selected'));
      
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(ui.ui.error).toHaveBeenCalledWith('❌ Setup failed: No repositories selected');
      expect(ui.ui.warning).toHaveBeenCalledWith('💡 You need to select at least one repository to continue');
    });
    
    test('handles generic errors', () => {
      handlePromptError(new Error('Some generic error'));
      
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(ui.ui.error).toHaveBeenCalledWith('❌ An error occurred: Some generic error');
    });
    
    test('handles non-Error objects', () => {
      handlePromptError('String error');
      
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(ui.ui.error).toHaveBeenCalledWith('❌ An error occurred: String error');
    });
  });

  describe('Repository Selection Validation', () => {
    test('validates checkbox selection has at least one repo', async () => {
      const mockRepos = ['/test/repo1', '/test/repo2'];
      
      vi.mocked(git.discoverRepos).mockResolvedValue(mockRepos);
      vi.mocked(inquirerPrompts.input).mockResolvedValue('/base/dir');
      
      // Mock checkbox with validation testing
      vi.mocked(inquirerPrompts.checkbox).mockImplementation(async (options: CheckboxOptions) => {
        const validate = options.validate;
        if (validate) {
          expect(validate([])).toBe('Please select at least one repository');
          expect(validate(['/test/repo1'])).toBe(true);
        }
        return ['/test/repo1'];
      });
      
      vi.mocked(git.currentBranch).mockResolvedValue('main');
      vi.mocked(inquirerPrompts.input)
        .mockResolvedValueOnce('/base/dir')
        .mockResolvedValueOnce('test')
        .mockResolvedValueOnce('main');
      vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);
      
      await getUserSelections();
    });
  });
});