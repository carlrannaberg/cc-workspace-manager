import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
export function detectPM(dir) {
    // Check for lockfiles
    if (existsSync(join(dir, 'yarn.lock')))
        return 'yarn';
    if (existsSync(join(dir, 'pnpm-lock.yaml')))
        return 'pnpm';
    // Check package.json packageManager field
    try {
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
            const pkgContent = readFileSync(pkgPath, 'utf8');
            const pkg = JSON.parse(pkgContent);
            const pmField = pkg?.packageManager;
            if (pmField?.startsWith('yarn'))
                return 'yarn';
            if (pmField?.startsWith('pnpm'))
                return 'pnpm';
        }
    }
    catch {
        // Ignore errors
    }
    return 'npm'; // Default
}
export function pmRun(pm, alias, script) {
    switch (pm) {
        case 'yarn':
            return `yarn --cwd ./repos/${alias} ${script}`;
        case 'pnpm':
            return `pnpm -C ./repos/${alias} ${script}`;
        default:
            return `npm --prefix ./repos/${alias} run ${script}`;
    }
}
//# sourceMappingURL=pm.js.map