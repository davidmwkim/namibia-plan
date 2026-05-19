// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js',
      'tests/golden/**/*.test.js',
      'tests/contract/**/*.test.js',
      'tests/api/**/*.test.js',
      'tests/smoke/**/*.test.js'
    ],
    exclude: ['tests/e2e/**', 'tests/ui/**', 'node_modules/**'],
    testTimeout: 10000
  }
});
