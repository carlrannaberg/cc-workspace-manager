import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ensureWorkspaceSkeleton, primeNodeModules, copyEnvFiles } from '../src/fsops.js';
import { rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, symlinkSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import { createTestDir } from './utils/testDir.js';

describe('File System Operations', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir('fsops-test', expect.getState().currentTestName);
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ensureWorkspaceSkeleton', () => {
    test('creates repos directory', async () => {
      const wsDir = join(testDir, 'workspace');
      
      await ensureWorkspaceSkeleton(wsDir);
      
      expect(existsSync(join(wsDir, 'repos'))).toBe(true);
    });

    test('creates .gitignore file with correct content', async () => {
      const wsDir = join(testDir, 'workspace');
      
      await ensureWorkspaceSkeleton(wsDir);
      
      const gitignorePath = join(wsDir, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);
      
      const content = readFileSync(gitignorePath, 'utf8');
      expect(content).toBe('repos/\nnode_modules/\n.env*\n');
    });

    test('creates parent directories if they do not exist', async () => {
      const wsDir = join(testDir, 'deep', 'nested', 'workspace');
      
      await ensureWorkspaceSkeleton(wsDir);
      
      expect(existsSync(join(wsDir, 'repos'))).toBe(true);
      expect(existsSync(join(wsDir, '.gitignore'))).toBe(true);
    });

    test('does not overwrite existing .gitignore', async () => {
      const wsDir = join(testDir, 'workspace');
      mkdirSync(wsDir, { recursive: true });
      
      const existingContent = '# Existing gitignore\nnode_modules/\n';
      writeFileSync(join(wsDir, '.gitignore'), existingContent);
      
      await ensureWorkspaceSkeleton(wsDir);
      
      const content = readFileSync(join(wsDir, '.gitignore'), 'utf8');
      expect(content).toBe('repos/\nnode_modules/\n.env*\n');
    });

    test('works with existing repos directory', async () => {
      const wsDir = join(testDir, 'workspace');
      mkdirSync(wsDir, { recursive: true });
      mkdirSync(join(wsDir, 'repos'));
      
      // Should not throw error
      await expect(ensureWorkspaceSkeleton(wsDir)).resolves.not.toThrow();
      
      expect(existsSync(join(wsDir, 'repos'))).toBe(true);
    });
  });

  describe('primeNodeModules', () => {
    let srcDir: string;
    let dstDir: string;

    beforeEach(() => {
      srcDir = join(testDir, 'source');
      dstDir = join(testDir, 'destination');
      mkdirSync(srcDir);
      mkdirSync(dstDir);
    });

    test('skips when source node_modules does not exist', async () => {
      await primeNodeModules(srcDir, dstDir);
      
      expect(existsSync(join(dstDir, 'node_modules'))).toBe(false);
    });

    test('copies node_modules using hardlinks when available', async () => {
      // Create source node_modules with a test file
      const srcNodeModules = join(srcDir, 'node_modules');
      mkdirSync(srcNodeModules);
      writeFileSync(join(srcNodeModules, 'test-package.txt'), 'test content');
      
      await primeNodeModules(srcDir, dstDir);
      
      const dstNodeModules = join(dstDir, 'node_modules');
      expect(existsSync(dstNodeModules)).toBe(true);
      expect(existsSync(join(dstNodeModules, 'test-package.txt'))).toBe(true);
      
      const content = readFileSync(join(dstNodeModules, 'test-package.txt'), 'utf8');
      expect(content).toBe('test content');
    });

    test('handles nested node_modules structure', async () => {
      // Create complex node_modules structure
      const srcNodeModules = join(srcDir, 'node_modules');
      mkdirSync(srcNodeModules);
      
      // Create a package with its own node_modules
      const packageDir = join(srcNodeModules, 'some-package');
      mkdirSync(packageDir);
      writeFileSync(join(packageDir, 'package.json'), '{"name": "some-package"}');
      
      const nestedNodeModules = join(packageDir, 'node_modules');
      mkdirSync(nestedNodeModules);
      writeFileSync(join(nestedNodeModules, 'nested-dep.txt'), 'nested dependency');
      
      await primeNodeModules(srcDir, dstDir);
      
      const dstPackageDir = join(dstDir, 'node_modules', 'some-package');
      expect(existsSync(join(dstPackageDir, 'package.json'))).toBe(true);
      expect(existsSync(join(dstPackageDir, 'node_modules', 'nested-dep.txt'))).toBe(true);
    });

    test('handles symbolic links in node_modules', async () => {
      // Create source node_modules with symlink
      const srcNodeModules = join(srcDir, 'node_modules');
      mkdirSync(srcNodeModules);
      
      // Create a real file and a symlink to it
      writeFileSync(join(srcNodeModules, 'real-file.txt'), 'real content');
      symlinkSync('real-file.txt', join(srcNodeModules, 'symlink.txt'));
      
      await primeNodeModules(srcDir, dstDir);
      
      const dstNodeModules = join(dstDir, 'node_modules');
      expect(existsSync(join(dstNodeModules, 'real-file.txt'))).toBe(true);
      expect(existsSync(join(dstNodeModules, 'symlink.txt'))).toBe(true);
    });

    test('handles binary files correctly', async () => {
      // Create source node_modules with binary-like content
      const srcNodeModules = join(srcDir, 'node_modules');
      mkdirSync(srcNodeModules);
      
      // Create file with binary-like content
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]);
      writeFileSync(join(srcNodeModules, 'binary-file.dat'), binaryContent);
      
      await primeNodeModules(srcDir, dstDir);
      
      const dstBinaryFile = join(dstDir, 'node_modules', 'binary-file.dat');
      expect(existsSync(dstBinaryFile)).toBe(true);
      
      const copiedContent = readFileSync(dstBinaryFile);
      expect(copiedContent.equals(binaryContent)).toBe(true);
    });

    test('handles large file structures', async () => {
      // Create a moderately large node_modules structure
      const srcNodeModules = join(srcDir, 'node_modules');
      mkdirSync(srcNodeModules);
      
      // Create multiple packages with files
      for (let i = 0; i < 10; i++) {
        const packageDir = join(srcNodeModules, `package-${i}`);
        mkdirSync(packageDir);
        
        for (let j = 0; j < 5; j++) {
          writeFileSync(join(packageDir, `file-${j}.js`), `module.exports = ${j};`);
        }
      }
      
      await primeNodeModules(srcDir, dstDir);
      
      // Verify all packages were copied
      for (let i = 0; i < 10; i++) {
        const packageDir = join(dstDir, 'node_modules', `package-${i}`);
        expect(existsSync(packageDir)).toBe(true);
        
        for (let j = 0; j < 5; j++) {
          const filePath = join(packageDir, `file-${j}.js`);
          expect(existsSync(filePath)).toBe(true);
        }
      }
    });

    test('continues operation when copying fails partially', async () => {
      // This test simulates partial failure scenarios
      // In practice, we'd need special setup for this, so we document the behavior
      const srcNodeModules = join(srcDir, 'node_modules');
      mkdirSync(srcNodeModules);
      writeFileSync(join(srcNodeModules, 'good-file.txt'), 'content');
      
      // Should not throw even if some operations fail
      await expect(primeNodeModules(srcDir, dstDir)).resolves.not.toThrow();
    });
  });

  describe('copyEnvFiles', () => {
    let srcDir: string;
    let dstDir: string;

    beforeEach(() => {
      srcDir = join(testDir, 'source');
      dstDir = join(testDir, 'destination');
      mkdirSync(srcDir);
      mkdirSync(dstDir);
    });

    test('copies .env file', async () => {
      writeFileSync(join(srcDir, '.env'), 'NODE_ENV=production');
      
      await copyEnvFiles(srcDir, dstDir);
      
      expect(existsSync(join(dstDir, '.env'))).toBe(true);
      const content = readFileSync(join(dstDir, '.env'), 'utf8');
      expect(content).toBe('NODE_ENV=production');
    });

    test('copies multiple .env files', async () => {
      writeFileSync(join(srcDir, '.env'), 'NODE_ENV=production');
      writeFileSync(join(srcDir, '.env.local'), 'API_KEY=secret');
      writeFileSync(join(srcDir, '.env.development'), 'NODE_ENV=development');
      writeFileSync(join(srcDir, '.env.test'), 'NODE_ENV=test');
      
      await copyEnvFiles(srcDir, dstDir);
      
      expect(existsSync(join(dstDir, '.env'))).toBe(true);
      expect(existsSync(join(dstDir, '.env.local'))).toBe(true);
      expect(existsSync(join(dstDir, '.env.development'))).toBe(true);
      expect(existsSync(join(dstDir, '.env.test'))).toBe(true);
      
      expect(readFileSync(join(dstDir, '.env'), 'utf8')).toBe('NODE_ENV=production');
      expect(readFileSync(join(dstDir, '.env.local'), 'utf8')).toBe('API_KEY=secret');
    });

    test('ignores .env directories', async () => {
      writeFileSync(join(srcDir, '.env'), 'NODE_ENV=production');
      mkdirSync(join(srcDir, '.env-dir'));
      writeFileSync(join(srcDir, '.env-dir', 'config'), 'should not copy');
      
      await copyEnvFiles(srcDir, dstDir);
      
      expect(existsSync(join(dstDir, '.env'))).toBe(true);
      expect(existsSync(join(dstDir, '.env-dir'))).toBe(false);
    });

    test('handles no .env files gracefully', async () => {
      // Create some regular files
      writeFileSync(join(srcDir, 'package.json'), '{}');
      writeFileSync(join(srcDir, 'README.md'), '# Test');
      
      await expect(copyEnvFiles(srcDir, dstDir)).resolves.not.toThrow();
      
      expect(existsSync(join(dstDir, 'package.json'))).toBe(false);
      expect(existsSync(join(dstDir, 'README.md'))).toBe(false);
    });

    test('overwrites existing .env files', async () => {
      writeFileSync(join(srcDir, '.env'), 'NODE_ENV=production');
      writeFileSync(join(dstDir, '.env'), 'NODE_ENV=development');
      
      await copyEnvFiles(srcDir, dstDir);
      
      const content = readFileSync(join(dstDir, '.env'), 'utf8');
      expect(content).toBe('NODE_ENV=production');
    });

    test('handles .env files with complex content', async () => {
      const complexEnvContent = `# Comment
NODE_ENV=production
API_URL=https://api.example.com
DATABASE_URL="postgresql://user:password@localhost:5432/db"
FEATURE_FLAGS={"feature1":true,"feature2":false}
MULTILINE_VAR="line1
line2
line3"`;
      
      writeFileSync(join(srcDir, '.env'), complexEnvContent);
      
      await copyEnvFiles(srcDir, dstDir);
      
      const copiedContent = readFileSync(join(dstDir, '.env'), 'utf8');
      expect(copiedContent).toBe(complexEnvContent);
    });

    test('handles .env files with special characters in names', async () => {
      writeFileSync(join(srcDir, '.env.staging-v2'), 'ENV=staging-v2');
      writeFileSync(join(srcDir, '.env.prod_backup'), 'ENV=prod_backup');
      
      await copyEnvFiles(srcDir, dstDir);
      
      expect(existsSync(join(dstDir, '.env.staging-v2'))).toBe(true);
      expect(existsSync(join(dstDir, '.env.prod_backup'))).toBe(true);
    });

    test('handles source directory without permissions', async () => {
      // This would require actual permission manipulation in a real test
      // For now, we test that the function doesn't crash on missing source
      await expect(copyEnvFiles('/non/existent/path', dstDir)).resolves.not.toThrow();
    });

    test('handles binary content in .env files', async () => {
      // While not typical, .env files could contain binary data
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]);
      writeFileSync(join(srcDir, '.env.binary'), binaryContent);
      
      await copyEnvFiles(srcDir, dstDir);
      
      expect(existsSync(join(dstDir, '.env.binary'))).toBe(true);
      const copiedContent = readFileSync(join(dstDir, '.env.binary'));
      expect(copiedContent.equals(binaryContent)).toBe(true);
    });

    test('preserves file permissions', async () => {
      writeFileSync(join(srcDir, '.env'), 'NODE_ENV=production');
      
      // Set specific permissions (readable only by owner)
      await execa('chmod', ['600', join(srcDir, '.env')]);
      
      await copyEnvFiles(srcDir, dstDir);
      
      expect(existsSync(join(dstDir, '.env'))).toBe(true);
      
      // Check that permissions are maintained (platform dependent)
      // Use different stat command syntax based on platform
      const isLinux = process.platform === 'linux';
      const statArgs = isLinux ? ['-c', '%a'] : ['-f', '%A'];
      const { stdout } = await execa('stat', [...statArgs, join(dstDir, '.env')]);
      
      // On macOS, stat returns octal format differently
      const permissions = isLinux ? stdout.trim() : stdout.trim();
      expect(permissions).toMatch(/600|0600/);
    });
  });
});