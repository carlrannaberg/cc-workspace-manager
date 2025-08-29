import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SecurityValidator } from './utils/security.js';
export function detectPM(dir) {
    // Validate directory path for security
    const sanitizedDir = SecurityValidator.validatePath(dir);
    // Check for lockfiles in order of precedence (most specific first)
    // pnpm takes highest precedence as it's most specific
    if (existsSync(join(sanitizedDir, 'pnpm-lock.yaml')))
        return 'pnpm';
    // yarn.lock indicates yarn usage
    if (existsSync(join(sanitizedDir, 'yarn.lock')))
        return 'yarn';
    // package-lock.json indicates npm usage
    if (existsSync(join(sanitizedDir, 'package-lock.json')))
        return 'npm';
    // Check package.json packageManager field as fallback
    try {
        const pkgPath = join(sanitizedDir, 'package.json');
        if (existsSync(pkgPath)) {
            const pkgContent = readFileSync(pkgPath, 'utf8');
            // Validate JSON content size to prevent DoS attacks
            if (pkgContent.length > 1024 * 1024) { // 1MB limit
                throw new Error('package.json file too large');
            }
            const pkg = JSON.parse(pkgContent);
            // Validate parsed JSON structure
            if (typeof pkg !== 'object' || pkg === null) {
                throw new Error('Invalid package.json structure');
            }
            const pmField = pkg?.packageManager;
            // Check packageManager field with version specificity
            if (pmField?.startsWith('pnpm@'))
                return 'pnpm';
            if (pmField?.startsWith('yarn@'))
                return 'yarn';
            if (pmField?.startsWith('npm@'))
                return 'npm';
            // Fallback to basic string matching
            if (pmField?.includes('pnpm'))
                return 'pnpm';
            if (pmField?.includes('yarn'))
                return 'yarn';
            if (pmField?.includes('npm'))
                return 'npm';
        }
    }
    catch {
        // Ignore JSON parsing errors and continue to default
    }
    return 'npm'; // Default fallback
}
export function pmRun(pm, alias, script) {
    // Validate alias to prevent directory traversal in generated commands
    const sanitizedAlias = alias.trim();
    if (sanitizedAlias.includes('..') || sanitizedAlias.includes('/') || sanitizedAlias.includes('\\')) {
        throw new Error('Invalid alias: contains unsafe characters');
    }
    // Validate script name to prevent command injection (allow empty scripts)
    const sanitizedScript = script.trim();
    if (sanitizedScript.includes(';') || sanitizedScript.includes('&') || sanitizedScript.includes('|')) {
        throw new Error('Invalid script name: contains unsafe characters');
    }
    switch (pm) {
        case 'yarn':
            return `yarn --cwd ./repos/${sanitizedAlias} ${sanitizedScript}`;
        case 'pnpm':
            return `pnpm -C ./repos/${sanitizedAlias} ${sanitizedScript}`;
        default:
            return `npm --prefix ./repos/${sanitizedAlias} run ${sanitizedScript}`;
    }
}
//# sourceMappingURL=pm.js.map