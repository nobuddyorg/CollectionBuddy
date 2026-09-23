import { defineConfig, devices } from '@playwright/test';

import { EXPORT_BASE_PATH } from './next.config';
import { AUTH_STATE_PATH } from './e2e/signed-in/fixtures';

// Unset, the suite serves the local export; with E2E_BASE_URL it runs read-only against a deployed site.
const PORT = Number(process.env.E2E_PORT ?? 4173);

// Trailing slash: a relative goto() resolves against this, and without it the base path segment is dropped.
const localURL = `http://127.0.0.1:${PORT}${EXPORT_BASE_PATH}/`;
const baseURL = process.env.E2E_BASE_URL ?? localURL;
const isRemote = Boolean(process.env.E2E_BASE_URL);

// Signed-in projects exist only with a local stack, so `npm run e2e` alone needs nothing installed.
const localStack = Boolean(process.env.E2E_SUPABASE_URL);

export default defineConfig({
  testDir: './e2e',
  // Merges every worker's coverage (e2e/coverage.ts) into one report once every project has finished.
  globalTeardown: './e2e/global-teardown.ts',
  // No retries locally, they hide flakes; remotely one distinguishes a broken deploy from a dropped connection.
  retries: isRemote ? 2 : 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? // html is kept as an artifact for the trace; json feeds ci.yml's job-summary step and nothing else.
      [
        ['github'],
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'playwright-results.json' }],
      ]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testDir: './e2e/public',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile-first app, and most layout bugs have been phone-only: a target, not a variation.
    {
      name: 'mobile',
      testDir: './e2e/public',
      use: { ...devices['Pixel 7'] },
    },
    // The only non-Chromium engine; coverage collection skips it, every other assertion runs here too.
    {
      name: 'firefox',
      testDir: './e2e/public',
      use: { ...devices['Desktop Firefox'] },
    },
    ...(localStack
      ? [
          {
            name: 'setup',
            testDir: './e2e',
            testMatch: /signed-in\.setup\.ts/,
          },
          {
            name: 'signed-in',
            testDir: './e2e/signed-in',
            dependencies: ['setup'],
            use: {
              ...devices['Desktop Chrome'],
              // The session the setup project minted, loaded per test so no test can leave another signed out.
              storageState: AUTH_STATE_PATH,
            },
          },
        ]
      : []),
  ],
  webServer: isRemote
    ? undefined
    : {
        command: `node scripts/serve-export.mjs ${PORT} ${EXPORT_BASE_PATH}`,
        url: localURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
