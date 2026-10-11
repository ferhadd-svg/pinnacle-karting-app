import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one test database, so run files sequentially.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
