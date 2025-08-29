import { resolve } from 'path';

/**
 * Centralized security validation and sanitization utilities.
 * 
 * This module provides consistent security patterns across the codebase
 * to prevent command injection, path traversal, and information disclosure.
 */
export class SecurityValidator {
  /**
   * Dangerous patterns that should be rejected in branch names
   */
  private static readonly DANGEROUS_BRANCH_PATTERNS = [
    /\.\./,           // Path traversal
    /^-/,             // Option injection (branch names starting with -)
    /[\x00-\x1f\x7f]/, // Control characters including null bytes
    /[;&|`$(){}]/,    // Shell metacharacters
    /\s/,             // Whitespace characters
    /@\{/             // Reflog syntax (@{...})
  ];

  /**
   * Whitelist of safe CLI arguments for Claude CLI
   */
  private static readonly ALLOWED_CLI_FLAGS = [
    '--model', '--temperature', '--max-tokens', '--format',
    '--timeout', '--verbose', '--quiet', '--help', '--version'
  ];

  /**
   * Validates and sanitizes file system paths to prevent path traversal attacks.
   * 
   * @param path - Path to validate
   * @returns Sanitized absolute path
   * @throws {Error} When path traversal is detected
   */
  static validatePath(path: string): string {
    const sanitized = resolve(path);
    if (sanitized.includes('..') || path.includes('..')) {
      throw new Error('Path traversal detected');
    }
    return sanitized;
  }

  /**
   * Validates git branch names to prevent command injection and security vulnerabilities.
   * 
   * Implements strict validation that blocks dangerous characters and patterns
   * while allowing legitimate git branch naming conventions.
   * 
   * @param branch - Branch name to validate
   * @returns true if valid (throws on invalid)
   * @throws {Error} When branch name contains dangerous patterns or invalid format
   */
  static validateBranchName(branch: string): boolean {
    const sanitized = branch.trim();
    
    // Reject dangerous patterns that could enable command injection
    if (this.DANGEROUS_BRANCH_PATTERNS.some(pattern => pattern.test(sanitized))) {
      throw new Error('Invalid branch name: contains dangerous characters');
    }
    
    // Strict allowlist for branch names - must start and end with alphanumeric
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*[a-zA-Z0-9]$/.test(sanitized)) {
      throw new Error('Invalid branch name format');
    }
    
    // Length limits to prevent buffer overflow issues
    if (sanitized.length > 255) {
      throw new Error('Branch name too long');
    }
    
    return true;
  }

  /**
   * Sanitizes Claude CLI arguments to prevent command injection.
   * 
   * Uses a whitelist approach to only allow safe CLI arguments and
   * validates argument values to prevent shell metacharacter injection.
   * 
   * @param args - Raw CLI arguments string from environment
   * @returns Array of sanitized CLI arguments
   */
  static sanitizeCliArgs(args?: string): string[] {
    if (!args || typeof args !== 'string') {
      return [];
    }
    
    return args
      .split(/\s+/)
      .filter(arg => {
        // Allow flags from whitelist
        if (this.ALLOWED_CLI_FLAGS.some(flag => arg.startsWith(flag))) {
          return true;
        }
        // Allow simple values (no shell metacharacters)
        return /^[a-zA-Z0-9._-]+$/.test(arg);
      })
      .slice(0, 10); // Limit number of arguments
  }

  /**
   * Sanitizes error messages to prevent information disclosure.
   * 
   * Removes sensitive information like file paths and IP addresses
   * from error messages before displaying them to users.
   * 
   * @param error - Error object or string to sanitize
   * @returns Sanitized error message
   */
  static sanitizeErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unknown error';
    }
    
    return error.message
      .replace(/\/[^\s]+/g, '<path>') // Remove file paths
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<ip>') // Remove IP addresses
      .substring(0, 200); // Limit message length
  }
}

/**
 * Utility functions for consistent error handling across the codebase.
 */
export class ErrorUtils {
  /**
   * Extracts error message from unknown error types consistently.
   * 
   * @param error - Error of unknown type
   * @returns String representation of error message
   */
  static extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Creates a safe error handler that sanitizes error messages.
   * 
   * @param context - Context description for the error
   * @returns Function that handles errors safely
   */
  static createSafeErrorHandler(context: string) {
    return (error: unknown) => {
      const message = SecurityValidator.sanitizeErrorMessage(error);
      console.error(`${context}: ${message}`);
    };
  }
}