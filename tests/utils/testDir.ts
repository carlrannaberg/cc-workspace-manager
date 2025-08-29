import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const RANDOM_SUFFIX_LENGTH = 6;
const MAX_SAFE_NAME_LENGTH = 50;

/**
 * Creates a unique test directory with timestamp and random suffix
 * Prevents test interference by ensuring unique directory names
 */
export function createTestDir(prefix: string, testName?: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 2 + RANDOM_SUFFIX_LENGTH);
  
  const safeName = testName 
    ? testName.replace(/[^a-zA-Z0-9]/g, '-').substring(0, MAX_SAFE_NAME_LENGTH)
    : '';
  
  const dirName = [prefix, timestamp, randomSuffix, safeName]
    .filter(Boolean)
    .join('-') + '-';
    
  return mkdtempSync(join(tmpdir(), dirName));
}

/**
 * Manages cleanup of multiple test directories
 */
export class TestDirManager {
  private cleanupPaths: string[] = [];
  
  create(prefix: string, testName?: string): string {
    const dir = createTestDir(prefix, testName);
    this.cleanupPaths.push(dir);
    return dir;
  }
  
  cleanup(): void {
    for (const path of this.cleanupPaths) {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch (error) {
        // Test cleanup failures are acceptable but preserve error context for debugging
        if (process.env.NODE_ENV === 'development' || process.env.VITEST_DEBUG) {
          console.warn(`Test cleanup warning for ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    this.cleanupPaths = [];
  }
}