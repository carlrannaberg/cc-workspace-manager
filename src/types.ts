/**
 * Repository selection and configuration from user input.
 * 
 * This represents a user's choice of repository, alias, and branch
 * before the workspace is created. It contains the minimal information
 * needed to create a worktree and mount the repository.
 * 
 * @example
 * ```typescript
 * const pick: RepoPick = {
 *   alias: 'frontend',
 *   basePath: '/Users/dev/projects/my-frontend',
 *   branch: 'feature/new-ui'
 * };
 * ```
 */
export type RepoPick = {
  /** User-friendly name for the repository (used for scripts and directories) */
  alias: string;
  /** Absolute path to the original repository on disk */
  basePath: string;
  /** Git branch to checkout in the worktree */
  branch: string;
};

/**
 * Successfully mounted repository with workspace context.
 * 
 * This extends RepoPick with additional information gathered during
 * the workspace creation process, including the worktree location
 * and detected package manager.
 * 
 * @example
 * ```typescript
 * const mounted: RepoMounted = {
 *   alias: 'frontend',
 *   basePath: '/Users/dev/projects/my-frontend',
 *   branch: 'feature/new-ui',
 *   worktreePath: '/Users/dev/workspace/ccws-abc123/repos/frontend',
 *   packageManager: 'npm'
 * };
 * ```
 */
export type RepoMounted = RepoPick & {
  /** Absolute path to the repository worktree within the workspace */
  worktreePath: string;
  /** Package manager detected in the repository (npm/yarn/pnpm) */
  packageManager: 'npm' | 'yarn' | 'pnpm';
};