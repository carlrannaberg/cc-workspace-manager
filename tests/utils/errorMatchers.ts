import { expect } from 'vitest';

/**
 * Standardized error assertion patterns for consistent testing
 */
export const errorMatchers = {
  gitError: expect.objectContaining({
    message: expect.stringMatching(/not a git repository|fatal:|does not exist/i)
  }),
  
  gitWorktreeConflict: expect.objectContaining({
    message: expect.stringMatching(/already checked out|fatal:|Command failed/i)
  }),
  
  processExit: (code: number) => expect.objectContaining({
    message: expect.stringContaining(`Process exited with code ${code}`)
  }),

  // Generic helpers
  anyErrorWithMessage: (pattern: string | RegExp) => expect.objectContaining({
    message: typeof pattern === 'string' 
      ? expect.stringContaining(pattern)
      : expect.stringMatching(pattern)
  })
};

/**
 * Enhanced test utilities for error assertions
 */
export function expectAsyncError<T>(
  promise: Promise<T>, 
  matcher: ReturnType<typeof expect.objectContaining> | typeof expect.any
): Promise<void> {
  return expect(promise).rejects.toThrow(matcher);
}