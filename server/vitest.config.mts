import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // all integration tests share one database, so run files one at a time
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://crm:crm@localhost:5433/crm_test?schema=public',
      JWT_SECRET: 'test-secret',
    },
  },
});