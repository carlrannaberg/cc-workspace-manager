/**
 * Environment detection utilities for consistent behavior across the application.
 * 
 * This module provides centralized functions for detecting various environment
 * states to ensure consistent behavior throughout the codebase.
 */

/**
 * Centralized test environment detection utility.
 * 
 * Detects if the application is running in a test environment by checking
 * multiple environment variables used by different test runners and frameworks.
 * 
 * @returns true if running in a test environment, false otherwise
 * 
 * @example
 * ```typescript
 * if (EnvironmentUtils.isTestEnvironment()) {
 *   // Skip external API calls or use mocks
 *   return mockResponse();
 * }
 * ```
 */
export class EnvironmentUtils {
  /**
   * Checks if the application is running in a test environment.
   * 
   * This method checks for common test environment indicators:
   * - NODE_ENV === 'test' (standard Node.js test environment)
   * - VITEST environment variables (Vitest test runner)
   * - Other common test framework indicators
   */
  static isTestEnvironment(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      process.env.VITEST === '1' ||
      !!process.env.VITEST ||
      !!process.env.JEST_WORKER_ID ||
      !!process.env.CI_TEST_MODE
    );
  }

  /**
   * Checks if the application is running in a CI/CD environment.
   * 
   * @returns true if running in CI/CD, false otherwise
   */
  static isCiEnvironment(): boolean {
    return (
      !!process.env.CI ||
      !!process.env.GITHUB_ACTIONS ||
      !!process.env.GITLAB_CI ||
      !!process.env.CIRCLECI ||
      !!process.env.JENKINS_URL ||
      !!process.env.TRAVIS
    );
  }

  /**
   * Checks if the application is running in development mode.
   * 
   * @returns true if in development mode, false otherwise
   */
  static isDevelopmentEnvironment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * Checks if the application is running in production mode.
   * 
   * @returns true if in production mode, false otherwise
   */
  static isProductionEnvironment(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Gets a formatted string describing the current environment.
   * Useful for logging and debugging.
   * 
   * @returns Environment description string
   */
  static getEnvironmentDescription(): string {
    const parts: string[] = [];
    
    if (this.isTestEnvironment()) parts.push('test');
    if (this.isCiEnvironment()) parts.push('CI');
    if (this.isDevelopmentEnvironment()) parts.push('development');
    if (this.isProductionEnvironment()) parts.push('production');
    
    return parts.length > 0 ? parts.join(', ') : 'unknown';
  }
}