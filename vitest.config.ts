import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use dot reporter for minimal output in coding agents
    reporter: process.env.VERBOSE_TESTS === 'true' ? 'verbose' : 'dot',
    // Suppress stdout from passing tests  
    silent: process.env.VERBOSE_TESTS === 'true' ? false : 'passed-only',
    // Allow tests to pass when no tests are found
    passWithNoTests: true,
    // Hide skipped tests unless verbose mode
    hideSkippedTests: process.env.VERBOSE_TESTS !== 'true',
    // Test environment configuration
    environment: 'node',
    // Increase timeout for integration tests
    testTimeout: 15000, // 15 seconds for integration tests
    // Coverage configuration
    coverage: {
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        'tests/**'
      ]
    },
    // Include test files
    include: [
      'tests/**/*.{test,spec}.{js,ts}'
    ]
  }
});
