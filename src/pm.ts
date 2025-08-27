import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function detectPM(dir: string): 'npm' | 'yarn' | 'pnpm' {
  // Check for lockfiles in order of precedence (most specific first)
  // pnpm takes highest precedence as it's most specific
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  
  // yarn.lock indicates yarn usage
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  
  // package-lock.json indicates npm usage
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm';
  
  // Check package.json packageManager field as fallback
  try {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkgContent = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgContent);
      const pmField = pkg?.packageManager;
      
      // Check packageManager field with version specificity
      if (pmField?.startsWith('pnpm@')) return 'pnpm';
      if (pmField?.startsWith('yarn@')) return 'yarn';
      if (pmField?.startsWith('npm@')) return 'npm';
      
      // Fallback to basic string matching
      if (pmField?.includes('pnpm')) return 'pnpm';
      if (pmField?.includes('yarn')) return 'yarn';
      if (pmField?.includes('npm')) return 'npm';
    }
  } catch {
    // Ignore JSON parsing errors and continue to default
  }
  
  return 'npm'; // Default fallback
}

export function pmRun(
  pm: 'npm' | 'yarn' | 'pnpm', 
  alias: string, 
  script: string
): string {
  switch(pm) {
    case 'yarn': 
      return `yarn --cwd ./repos/${alias} ${script}`;
    case 'pnpm': 
      return `pnpm -C ./repos/${alias} ${script}`;
    default: 
      return `npm --prefix ./repos/${alias} run ${script}`;
  }
}