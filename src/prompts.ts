import { input, checkbox, confirm } from '@inquirer/prompts';
import { basename } from 'path';
import { discoverRepos, currentBranch } from './git.js';
import type { RepoPick } from './types.js';
import { ui } from './ui.js';
import { ErrorUtils, SecurityValidator } from './utils/security.js';

/**
 * Custom error class for user-initiated cancellation events.
 * 
 * This error is thrown when the user cancels operations through:
 * - Ctrl+C (SIGINT)
 * - ESC key in prompts
 * - Explicit cancellation in confirmation dialogs
 * 
 * @extends Error
 * 
 * @example
 * ```typescript
 * if (!confirmed) {
 *   throw new UserCancelledError('User declined to proceed');
 * }
 * ```
 */
export class UserCancelledError extends Error {
  constructor(message = 'Operation cancelled by user') {
    super(message);
    this.name = 'UserCancelledError';
  }
}

/**
 * Interactive prompt flow to gather user repository selections and configurations.
 * 
 * This function orchestrates the complete user interaction flow:
 * 1. Prompts for base directory to search for repositories
 * 2. Discovers all git repositories in the specified directory
 * 3. Allows user to select which repositories to include
 * 4. Configures alias and branch for each selected repository
 * 5. Shows configuration summary and requests final confirmation
 * 
 * The function includes comprehensive validation:
 * - Base directory existence and permissions
 * - Repository alias format and uniqueness
 * - Branch name validity
 * - Selection requirement (at least one repository)
 * 
 * @returns Promise resolving to array of configured repository picks
 * @returns RepoPick[].alias - User-defined alias for the repository
 * @returns RepoPick[].basePath - Absolute path to source repository
 * @returns RepoPick[].branch - Target branch for the worktree
 * 
 * @throws {UserCancelledError} When user cancels operation via Ctrl+C or ESC
 * @throws {Error} When no git repositories found in base directory
 * @throws {Error} When user selects no repositories
 * 
 * @example
 * ```typescript
 * try {
 *   const selections = await getUserSelections();
 *   console.log(`User selected ${selections.length} repositories`);
 *   selections.forEach(pick => {
 *     console.log(`${pick.alias} -> ${pick.branch} from ${pick.basePath}`);
 *   });
 * } catch (error) {
 *   if (error instanceof UserCancelledError) {
 *     console.log('User cancelled the operation');
 *   } else {
 *     console.error('Selection failed:', error.message);
 *   }
 * }
 * ```
 */
export async function getUserSelections(): Promise<RepoPick[]> {
  try {
    ui.header('🔧 CC Workspace Manager - Repository Setup\n');

    // 1. Get base directory
    const baseDir = await input({
      message: 'Base directory to search for repositories:',
      default: process.cwd(),
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Base directory cannot be empty';
        }
        return true;
      }
    });

    ui.searching(baseDir);

    // 2. Discover repos
    const repos = await discoverRepos(baseDir);
    
    if (repos.length === 0) {
      ui.noReposFound(baseDir);
      throw new Error(`No git repositories found in ${baseDir}`);
    }

    ui.foundRepos(repos.length);
    
    // 3. Select repos
    const selected = await checkbox({
      message: 'Select repositories to include in workspace:',
      choices: repos.map(r => ({
        name: `${basename(r)} ${ui.dim(`(${r})`)}`,
        value: r,
        checked: false
      })),
      required: true,
      validate: (choices) => {
        if (choices.length === 0) {
          return 'Please select at least one repository';
        }
        return true;
      }
    });

    if (selected.length === 0) {
      throw new Error('No repositories selected');
    }

    ui.configuring(selected.length);

    // 4. Configure each repo
    const repoPicks: RepoPick[] = [];
    for (let i = 0; i < selected.length; i++) {
      const repo = selected[i];
      const repoName = basename(repo);
      
      ui.repoProgress(i + 1, selected.length, repoName);
      
      // Get alias
      const alias = await input({
        message: `Alias for ${repoName}:`,
        default: repoName,
        validate: (input: string) => {
          const trimmed = input.trim();
          if (!trimmed) {
            return 'Alias cannot be empty';
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
            return 'Alias can only contain letters, numbers, hyphens, and underscores';
          }
          if (repoPicks.some(rp => rp.alias === trimmed)) {
            return 'This alias is already in use, please choose a different one';
          }
          return true;
        }
      });
      
      // Get current branch as default
      const defaultBranch = await currentBranch(repo);
      const branch = await input({
        message: `Branch for ${alias}:`,
        default: defaultBranch,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Branch cannot be empty';
          }
          try {
            SecurityValidator.validateBranchName(input.trim());
            return true;
          } catch (error) {
            return ErrorUtils.extractErrorMessage(error);
          }
        }
      });
      
      repoPicks.push({ 
        alias: alias.trim(), 
        basePath: repo, 
        branch: branch.trim() 
      });
      
      ui.repoConfigured(alias.trim(), branch.trim());
    }
    
    // 5. Show summary and confirm
    ui.configSummary();
    repoPicks.forEach((pick, index) => {
      ui.summaryItem(index, pick.alias, pick.branch, pick.basePath);
    });
    
    const confirmed = await confirm({
      message: '\nProceed with this configuration?',
      default: true
    });

    if (!confirmed) {
      throw new UserCancelledError('Configuration cancelled by user');
    }
    
    return repoPicks;

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'ExitPromptError' || error.message.includes('User force closed')) {
        throw new UserCancelledError('Operation cancelled by user (Ctrl+C)');
      }
      throw error;
    }
    throw new Error('An unexpected error occurred during user interaction');
  }
}

/**
 * Centralized error handler for prompt-related errors with contextual messaging.
 * 
 * This function provides consistent error handling and user feedback for different
 * error scenarios that can occur during the interactive prompt flow. It categorizes
 * errors and provides specific guidance for each type.
 * 
 * Error Categories:
 * - UserCancelledError: User-initiated cancellation (exit code 0)
 * - No repositories found: Repository discovery failures (exit code 1)
 * - No repositories selected: User selection validation (exit code 1)
 * - Generic errors: Unexpected failures (exit code 1)
 * 
 * @param error - The error to handle (any type for maximum compatibility)
 * 
 * @returns Never returns - always calls process.exit()
 * 
 * @example
 * ```typescript
 * try {
 *   const selections = await getUserSelections();
 * } catch (error) {
 *   handlePromptError(error); // Provides contextual error message and exits
 * }
 * ```
 * 
 * @see {@link UserCancelledError} for user cancellation scenarios
 */
export function handlePromptError(error: unknown): void {
  console.log(''); // Add spacing
  
  if (error instanceof UserCancelledError) {
    ui.userCancelled();
    process.exit(0);
  }
  
  const errorMessage = ErrorUtils.extractErrorMessage(error);
  
  if (errorMessage.includes('No git repositories found')) {
    ui.error('❌ Setup failed: No repositories to configure');
    ui.warning('💡 Try running from a directory that contains git repositories');
    process.exit(1);
  } else if (errorMessage.includes('No repositories selected')) {
    ui.noReposSelected();
    process.exit(1);
  } else {
    ui.error(`❌ An error occurred: ${errorMessage}`);
    process.exit(1);
  }
}