import pc from 'picocolors';
/**
 * Centralized UI messaging utilities for consistent CLI experience
 */
export const ui = {
    // Headers and titles
    header: (message) => console.log(pc.cyan(message)),
    title: (message) => console.log(pc.blue(message)),
    // Status messages
    success: (message) => console.log(pc.green(message)),
    error: (message) => console.log(pc.red(message)),
    warning: (message) => console.log(pc.yellow(message)),
    info: (message) => console.log(pc.gray(message)),
    // Special formatting
    highlight: (text) => pc.bold(text),
    dim: (text) => pc.gray(text),
    // Progress indicators
    progress: (current, total, message) => {
        const percentage = Math.round((current / total) * 100);
        const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
        console.log(pc.blue(`[${progressBar}] ${percentage}% ${message} (${current}/${total})`));
    },
    spinner: (message) => {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let frameIndex = 0;
        return {
            start: () => {
                const interval = setInterval(() => {
                    process.stdout.write(`\r${pc.blue(frames[frameIndex])} ${message}`);
                    frameIndex = (frameIndex + 1) % frames.length;
                }, 80);
                return interval;
            },
            stop: (interval, finalMessage) => {
                clearInterval(interval);
                process.stdout.write(`\r${finalMessage ? pc.green('✓ ' + finalMessage) : pc.green('✓ ' + message)}\n`);
            }
        };
    },
    // Common message patterns
    searching: (directory) => console.log(pc.gray(`Searching for git repositories in: ${directory}\n`)),
    foundRepos: (count) => console.log(pc.green(`✅ Found ${count} git repository(ies)\n`)),
    configuring: (count) => console.log(pc.green(`\n📝 Configuring ${count} selected repository(ies)...\n`)),
    repoProgress: (current, total, name) => console.log(pc.blue(`Repository ${current}/${total}: ${name}`)),
    repoConfigured: (alias, branch) => console.log(pc.gray(`   ✓ ${alias} -> ${branch}\n`)),
    configSummary: () => console.log(pc.cyan('📋 Configuration Summary:')),
    summaryItem: (index, alias, branch, path) => console.log(`${index + 1}. ${pc.bold(alias)} (${branch}) from ${path}`),
    // Error messages with suggestions
    noReposFound: (directory) => {
        ui.error(`❌ No git repositories found in ${directory}`);
        ui.warning('💡 Make sure the directory contains git repositories or try a different path.');
    },
    noReposSelected: () => {
        ui.error('❌ Setup failed: No repositories selected');
        ui.warning('💡 You need to select at least one repository to continue');
    },
    userCancelled: () => {
        ui.warning('⚠️  Operation cancelled by user');
    },
    // Final messages
    setupComplete: () => {
        ui.success('🎉 Configuration complete!');
        ui.info('Next steps will set up the workspace with your selected repositories.\n');
    },
    showSelectedRepos: () => console.log(pc.cyan('Selected repositories:')),
    selectedRepoItem: (alias, branch, path) => console.log(`  • ${alias} (${branch}) from ${path}`)
};
//# sourceMappingURL=ui.js.map