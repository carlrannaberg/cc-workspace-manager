import { execa } from 'execa';
import { existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import { ui } from './ui.js';
import { SecurityValidator, ErrorUtils } from './utils/security.js';
export async function ensureWorkspaceSkeleton(wsDir) {
    await fs.ensureDir(join(wsDir, 'repos'));
    await fs.writeFile(join(wsDir, '.gitignore'), 'repos/\nnode_modules/\n.env*\n');
}
export async function primeNodeModules(src, dst) {
    // Validate paths to prevent injection using centralized security utility
    let sanitizedSrc;
    let sanitizedDst;
    try {
        sanitizedSrc = SecurityValidator.validatePath(src);
        sanitizedDst = SecurityValidator.validatePath(dst);
    }
    catch (error) {
        return { method: 'skipped', error: SecurityValidator.sanitizeErrorMessage(error) };
    }
    const srcPath = join(sanitizedSrc, 'node_modules');
    const dstPath = join(sanitizedDst, 'node_modules');
    // Skip if source doesn't exist
    if (!existsSync(srcPath)) {
        return { method: 'skipped' };
    }
    // Try APFS clone first (fast copy-on-write, requires macOS 10.13+ with APFS)
    try {
        await execa('cp', ['-cR', srcPath, dstPath], {
            shell: false // Explicitly disable shell interpretation
        });
        return { method: 'clone' };
    }
    catch (error) {
        const errorMsg = ErrorUtils.extractErrorMessage(error);
        // Check for specific clone failures and provide helpful context
        if (errorMsg.includes('Operation not permitted') || errorMsg.includes('cross-device')) {
            ui.warning(`APFS clone failed (cross-filesystem detected), falling back to rsync...`);
        }
        else if (errorMsg.includes('File exists')) {
            ui.warning(`Target node_modules exists, falling back to rsync...`);
        }
        else if (errorMsg.includes('not supported') || errorMsg.includes('Invalid argument')) {
            ui.warning(`APFS clone not supported (requires macOS 10.13+ with APFS), falling back to rsync...`);
        }
        else {
            ui.warning(`APFS clone failed: ${errorMsg}, falling back to rsync...`);
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
        const errorMsg = ErrorUtils.extractErrorMessage(error);
        ui.error(`Failed to prime node_modules for ${basename(dst)}: ${errorMsg}`);
        ui.info('You may need to run "npm install" manually in this repository');
        return { method: 'skipped', error: errorMsg };
    }
}
export async function copyEnvFiles(src, dst) {
    try {
        // Validate paths using centralized security utility
        const srcPath = SecurityValidator.validatePath(src);
        const dstPath = SecurityValidator.validatePath(dst);
        // Security validations
        if (!existsSync(srcPath) || !statSync(srcPath).isDirectory()) {
            throw new Error('Invalid source directory');
        }
        if (!existsSync(dstPath) || !statSync(dstPath).isDirectory()) {
            throw new Error('Invalid destination directory');
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
                ui.warning(`Failed to copy ${file}: ${ErrorUtils.extractErrorMessage(fileError)}`);
            }
        }));
    }
    catch (error) {
        // Sanitize error messages using centralized security utility
        const safeError = SecurityValidator.sanitizeErrorMessage(error);
        ui.warning(`Failed to copy env files: ${safeError}`);
    }
}
//# sourceMappingURL=fsops.js.map