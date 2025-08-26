import { input, checkbox, confirm } from '@inquirer/prompts';
import { basename } from 'path';
import { discoverRepos, currentBranch } from './git.js';
import { ui } from './ui.js';
export class UserCancelledError extends Error {
    constructor(message = 'Operation cancelled by user') {
        super(message);
        this.name = 'UserCancelledError';
    }
}
export async function getUserSelections() {
    try {
        ui.header('🔧 CC Workspace Manager - Repository Setup\n');
        // 1. Get base directory
        const baseDir = await input({
            message: 'Base directory to search for repositories:',
            default: process.cwd(),
            validate: (input) => {
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
        const repoPicks = [];
        for (let i = 0; i < selected.length; i++) {
            const repo = selected[i];
            const repoName = basename(repo);
            ui.repoProgress(i + 1, selected.length, repoName);
            // Get alias
            const alias = await input({
                message: `Alias for ${repoName}:`,
                default: repoName,
                validate: (input) => {
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
                validate: (input) => {
                    if (!input.trim()) {
                        return 'Branch cannot be empty';
                    }
                    return true;
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
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.name === 'ExitPromptError' || error.message.includes('User force closed')) {
                throw new UserCancelledError('Operation cancelled by user (Ctrl+C)');
            }
            throw error;
        }
        throw new Error('An unexpected error occurred during user interaction');
    }
}
export function handlePromptError(error) {
    if (error instanceof UserCancelledError) {
        console.log(''); // Add spacing
        ui.userCancelled();
        process.exit(0);
    }
    else if (error.message.includes('No git repositories found')) {
        console.log(''); // Add spacing
        ui.error('❌ Setup failed: No repositories to configure');
        ui.warning('💡 Try running from a directory that contains git repositories');
        process.exit(1);
    }
    else if (error.message.includes('No repositories selected')) {
        console.log(''); // Add spacing
        ui.noReposSelected();
        process.exit(1);
    }
    else {
        console.log(''); // Add spacing
        ui.error(`❌ An error occurred: ${error.message}`);
        process.exit(1);
    }
}
//# sourceMappingURL=prompts.js.map