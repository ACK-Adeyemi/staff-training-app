// Chunk 11 (BP-2, F-8, F-9, F-10). Runs against the production build served by `vite preview` at the base path.
// scripts/check.sh builds first. Each test gets a fresh browser context, so IndexedDB starts empty.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'dot',
  use: {
    baseURL: 'http://localhost:4173/staff-training-app/',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'pnpm --filter @sta/web preview --port 4173 --strictPort',
    url: 'http://localhost:4173/staff-training-app/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
