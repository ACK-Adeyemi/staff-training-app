import { defineConfig } from 'vitest/config';

const pkg = (name: string, environment: 'node' | 'jsdom', root: string) => ({
  test: { name, root, environment, include: ['src/**/*.test.{ts,tsx}'] },
});

export default defineConfig({
  test: {
    projects: [
      pkg('domain', 'node', 'packages/domain'),
      pkg('data', 'node', 'packages/data'),
      pkg('content', 'node', 'packages/content'),
      pkg('seed', 'node', 'packages/seed'),
      pkg('ui', 'jsdom', 'packages/ui'),
      pkg('web', 'jsdom', 'apps/web'),
      { test: { name: 'scripts', root: 'scripts', environment: 'node', include: ['*.test.ts'], testTimeout: 60_000 } },
    ],
  },
});
