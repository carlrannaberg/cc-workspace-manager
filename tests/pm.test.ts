import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { detectPM, pmRun } from '../src/pm.js';
import { writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createTestDir } from './utils/testDir.js';

describe('Package Manager Detection', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir('pm-test', expect.getState().currentTestName);
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('lockfile-based detection', () => {
    test('detects yarn from yarn.lock', () => {
      writeFileSync(join(testDir, 'yarn.lock'), '');
      expect(detectPM(testDir)).toBe('yarn');
    });

    test('detects pnpm from pnpm-lock.yaml', () => {
      writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
      expect(detectPM(testDir)).toBe('pnpm');
    });

    test('yarn.lock takes precedence over package.json packageManager field', () => {
      writeFileSync(join(testDir, 'yarn.lock'), '');
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: 'pnpm@8.0.0'
      }));
      expect(detectPM(testDir)).toBe('yarn');
    });

    test('pnpm-lock.yaml takes precedence over package.json packageManager field', () => {
      writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: 'yarn@3.0.0'
      }));
      expect(detectPM(testDir)).toBe('pnpm');
    });
  });

  describe('packageManager field detection', () => {
    test('detects yarn from package.json packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: 'yarn@3.6.0'
      }));
      expect(detectPM(testDir)).toBe('yarn');
    });

    test('detects pnpm from package.json packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: 'pnpm@8.6.12'
      }));
      expect(detectPM(testDir)).toBe('pnpm');
    });

    test('detects npm from package.json packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: 'npm@9.8.1'
      }));
      expect(detectPM(testDir)).toBe('npm');
    });

    test('handles packageManager field with just package manager name', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: 'yarn'
      }));
      expect(detectPM(testDir)).toBe('yarn');
    });
  });

  describe('edge cases and error handling', () => {
    test('defaults to npm without lockfiles or package.json', () => {
      expect(detectPM(testDir)).toBe('npm');
    });

    test('defaults to npm with package.json but no packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        dependencies: {}
      }));
      expect(detectPM(testDir)).toBe('npm');
    });

    test('handles malformed package.json gracefully', () => {
      writeFileSync(join(testDir, 'package.json'), '{ invalid json }');
      expect(detectPM(testDir)).toBe('npm');
    });

    test('handles package.json with null packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: null
      }));
      expect(detectPM(testDir)).toBe('npm');
    });

    test('handles package.json with undefined packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: undefined
      }));
      expect(detectPM(testDir)).toBe('npm');
    });

    test('handles non-existent directory gracefully', () => {
      expect(detectPM('/non/existent/path')).toBe('npm');
    });

    test('handles empty packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: ''
      }));
      expect(detectPM(testDir)).toBe('npm');
    });

    test('handles unrecognized packageManager field', () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        packageManager: 'bun@1.0.0'
      }));
      expect(detectPM(testDir)).toBe('npm');
    });
  });
});

describe('Command Generation', () => {
  describe('yarn commands', () => {
    test('generates yarn commands correctly', () => {
      expect(pmRun('yarn', 'frontend', 'dev'))
        .toBe('yarn --cwd ./repos/frontend dev');
    });

    test('generates yarn commands with different aliases', () => {
      expect(pmRun('yarn', 'backend', 'build'))
        .toBe('yarn --cwd ./repos/backend build');
    });

    test('generates yarn commands with different scripts', () => {
      expect(pmRun('yarn', 'shared', 'test'))
        .toBe('yarn --cwd ./repos/shared test');
    });

    test('generates yarn commands with complex script names', () => {
      expect(pmRun('yarn', 'api', 'test:watch'))
        .toBe('yarn --cwd ./repos/api test:watch');
    });
  });

  describe('pnpm commands', () => {
    test('generates pnpm commands correctly', () => {
      expect(pmRun('pnpm', 'backend', 'build'))
        .toBe('pnpm -C ./repos/backend build');
    });

    test('generates pnpm commands with different aliases', () => {
      expect(pmRun('pnpm', 'frontend', 'dev'))
        .toBe('pnpm -C ./repos/frontend dev');
    });

    test('generates pnpm commands with different scripts', () => {
      expect(pmRun('pnpm', 'shared', 'lint'))
        .toBe('pnpm -C ./repos/shared lint');
    });

    test('generates pnpm commands with complex script names', () => {
      expect(pmRun('pnpm', 'web', 'build:prod'))
        .toBe('pnpm -C ./repos/web build:prod');
    });
  });

  describe('npm commands', () => {
    test('generates npm commands correctly', () => {
      expect(pmRun('npm', 'shared', 'test'))
        .toBe('npm --prefix ./repos/shared run test');
    });

    test('generates npm commands with different aliases', () => {
      expect(pmRun('npm', 'frontend', 'dev'))
        .toBe('npm --prefix ./repos/frontend run dev');
    });

    test('generates npm commands with different scripts', () => {
      expect(pmRun('npm', 'backend', 'start'))
        .toBe('npm --prefix ./repos/backend run start');
    });

    test('generates npm commands with complex script names', () => {
      expect(pmRun('npm', 'docs', 'serve:dev'))
        .toBe('npm --prefix ./repos/docs run serve:dev');
    });
  });

  describe('edge cases', () => {
    test('handles empty alias', () => {
      expect(pmRun('npm', '', 'test'))
        .toBe('npm --prefix ./repos/ run test');
    });

    test('handles empty script', () => {
      expect(pmRun('yarn', 'frontend', ''))
        .toBe('yarn --cwd ./repos/frontend ');
    });

    test('handles aliases with special characters', () => {
      expect(pmRun('pnpm', 'my-app', 'dev'))
        .toBe('pnpm -C ./repos/my-app dev');
    });

    test('handles scripts with spaces (edge case)', () => {
      // Note: This would likely fail in practice, but tests the function's string handling
      expect(pmRun('yarn', 'app', 'test unit'))
        .toBe('yarn --cwd ./repos/app test unit');
    });
  });
});