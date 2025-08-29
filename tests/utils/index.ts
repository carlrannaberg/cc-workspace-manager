/**
 * Test utilities for cc-workspace-manager test suite
 * Provides centralized access to all test helpers
 */

// Test directory management
export { createTestDir, TestDirManager } from './testDir.js';

// Error assertion patterns
export { errorMatchers, expectPromiseRejection } from './errorMatchers.js';

// Test data fixtures
export { packageFixtures, createPackageJson } from '../fixtures/packageJsonFixtures.js';