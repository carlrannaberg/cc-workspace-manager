export type RepoPick = {
  alias: string;         // User-friendly name
  basePath: string;      // Path to original repo
  branch: string;        // Branch to checkout
};

export type RepoMounted = RepoPick & {
  worktreePath: string;  // Path in workspace/repos/<alias>
  packageManager: 'npm' | 'yarn' | 'pnpm';
};