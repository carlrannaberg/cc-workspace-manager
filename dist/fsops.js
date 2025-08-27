import { execa } from 'execa';
import { existsSync, statSync } from 'fs';
import { join, basename, resolve } from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import { ui } from './ui.js';
export async function ensureWorkspaceSkeleton(wsDir) {
    await fs.ensureDir(join(wsDir, 'repos'));
    await fs.writeFile(join(wsDir, '.gitignore'), 'repos/\nnode_modules/\n.env*\n');
}
export async function primeNodeModules(src, dst) {
    // Validate paths to prevent injection
    const sanitizedSrc = resolve(src);
    const sanitizedDst = resolve(dst);
    // Security checks
    if (sanitizedSrc.includes('..') || sanitizedDst.includes('..') || src.includes('..') || dst.includes('..')) {
        return { method: 'skipped', error: 'Path traversal detected' };
    }
    const srcPath = join(sanitizedSrc, 'node_modules');
    const dstPath = join(sanitizedDst, 'node_modules');
    // Skip if source doesn't exist
    if (!existsSync(srcPath)) {
        return { method: 'skipped' };
    }
    // Try hardlink first (fast on same filesystem)
    try {
        await execa('cp', ['-al', srcPath, dstPath], {
            shell: false // Explicitly disable shell interpretation
        });
        return { method: 'hardlink' };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Check for specific hardlink failures and provide helpful context
        if (errorMsg.includes('Operation not permitted') || errorMsg.includes('cross-device')) {
            ui.warning(`Hardlink failed (cross-filesystem detected), falling back to rsync...`);
        }
        else if (errorMsg.includes('File exists')) {
            ui.warning(`Target node_modules exists, falling back to rsync...`);
        }
        else {
            ui.warning(`Hardlink failed: ${errorMsg}, falling back to rsync...`);
        }
    }
    // Fallback to rsync with better error reporting
    try {
        await execa('rsync', [
            '-a',
            '--delete',
            `${srcPath}/`,
            `${dstPath}/`
        ], {
            shell: false // Explicitly disable shell interpretation
        });
        return { method: 'rsync' };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ui.error(`Failed to prime node_modules for ${basename(dst)}: ${errorMsg}`);
        ui.info('You may need to run "npm install" manually in this repository');
        return { method: 'skipped', error: errorMsg };
    }
}
export async function copyEnvFiles(src, dst) {
    try {
        // Validate and resolve paths
        const srcPath = resolve(src);
        const dstPath = resolve(dst);
        // Security validations
        if (!existsSync(srcPath) || !statSync(srcPath).isDirectory()) {
            throw new Error('Invalid source directory');
        }
        if (!existsSync(dstPath) || !statSync(dstPath).isDirectory()) {
            throw new Error('Invalid destination directory');
        }
        // Prevent path traversal
        if (srcPath.includes('..') || dstPath.includes('..') || src.includes('..') || dst.includes('..')) {
            throw new Error('Path traversal detected');
        }
        // Use fs.readdir instead of shell command for safety
        const files = await readdir(srcPath);
        const envFiles = files.filter(f => f.startsWith('.env') && !f.includes('/'));
        // Copy each file with validation
        await Promise.all(envFiles.map(async (file) => {
            const srcFile = join(srcPath, file);
            const dstFile = join(dstPath, file);
            try {
                // Ensure we're not following symlinks for security
                const stat = await fs.lstat(srcFile);
                if (stat.isFile() && !stat.isSymbolicLink()) {
                    await fs.copyFile(srcFile, dstFile);
                    ui.info(`Copied environment file: ${file}`);
                }
            }
            catch (fileError) {
                ui.warning(`Failed to copy ${file}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
            }
        }));
    }
    catch (error) {
        // Sanitize error messages to avoid exposing paths
        const safeError = error instanceof Error
            ? error.message.replace(/\/.*?\//g, '/***/')
            : 'Unknown error';
        ui.warning(`Failed to copy env files: ${safeError}`);
    }
}
//# sourceMappingURL=fsops.js.map