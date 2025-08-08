import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testMatch: ['tests/**/*.test.ts'],
    timeout: 30000, // 30 seconds timeout for git operations
  },
});