import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PIA Tracker E2E and a11y/Lighthouse tests.
 *
 * ## Test environments
 *
 * Tests run against a docker-compose'd backend + frontend served by Vite preview.
 * Set BASE_URL to override (e.g. `BASE_URL=http://localhost:5173 npm run e2e`).
 *
 * ## Remote debugging port
 *
 * Lighthouse integration requires Chrome to expose its CDP endpoint.  All
 * Chromium launches therefore include `--remote-debugging-port=9222`.  When
 * running multiple workers, ensure each worker uses a distinct port (set via
 * `LIGHTHOUSE_PORT` env if needed); in CI the default single-worker run is fine.
 *
 * ## Workers
 *
 * Lighthouse tests are serial (1 worker) because they share a fixed CDP port.
 * Other E2E tests may run with multiple workers against isolated DB schemas.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    // Expose CDP so playwright-lighthouse can connect
    launchOptions: {
      args: [
        '--remote-debugging-port=9222',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
