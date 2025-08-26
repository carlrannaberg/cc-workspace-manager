import { execa } from 'execa';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import fs from 'fs-extra';
export async function ensureWorkspaceSkeleton(wsDir) {
    await fs.ensureDir(join(wsDir, 'repos'));
    await fs.writeFile(join(wsDir, '.gitignore'), 'repos/\nnode_modules/\n.env*\n');
}
export async function primeNodeModules(src, dst) {
    const srcPath = join(src, 'node_modules');
    const dstPath = join(dst, 'node_modules');
    // Skip if source doesn't exist
    if (!existsSync(srcPath))
        return;
    // Try hardlink first (fast on same filesystem)
    try {
        await execa('cp', ['-al', srcPath, dstPath]);
        return;
    }
    catch {
        // Hardlink failed, try rsync
    }
    // Fallback to rsync
    try {
        await execa('rsync', [
            '-a',
            '--delete',
            `${srcPath}/`,
            `${dstPath}/`
        ]);
    }
    catch (error) {
        console.warn(`Failed to prime node_modules for ${dst}:`, error);
    }
}
export async function copyEnvFiles(src, dst) {
    try {
        // Find all .env* files in source
        const { stdout } = await execa('find', [
            src,
            '-maxdepth', '1',
            '-name', '.env*',
            '-type', 'f'
        ]);
        const files = stdout.split('\n').filter(Boolean);
        // Copy each file
        for (const file of files) {
            const destFile = join(dst, basename(file));
            await fs.copyFile(file, destFile);
        }
    }
    catch (error) {
        console.warn(`Failed to copy env files:`, error);
    }
}
//# sourceMappingURL=fsops.js.map