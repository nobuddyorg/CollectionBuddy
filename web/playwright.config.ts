import { defineConfig, devices } from '@playwright/test';

import { EXPORT_BASE_PATH } from './next.config';
import { AUTH_STATE_PATH } from './e2e/signed-in/fixtures';

// One suite, two targets. Unset, it serves the local export; with
// E2E_BASE_URL it runs against a deployed site. Everything in e2e/ has to
// hold for a *signed-out* visitor, so a production run stays read-only.
const PORT = Number(process.env.E2E_PORT ?? 4173);

// Trailing slash: Playwright resolves a relative goto() against this, and
// without it the last segment (the base path) is dropped.
const localURL = `http://127.0.0.1:${PORT}${EXPORT_BASE_PATH}/`;
const baseURL = process.env.E2E_BASE_URL ?? localURL;
const isRemote = Boolean(process.env.E2E_BASE_URL);

// Signed-in tests run only when a database is pointed at (a local
// `supabase start`), so `npm run e2e` alone stays runnable with nothing
// installed.
const localStack = Boolean(process.env.E2E_SUPABASE_URL);

export default defineConfig({
  testDir: './e2e',
  // Retries would hide the flake worth knowing about. The remote target is
  // the exception: there, a retry distinguishes a broken deploy from a
  // dropped connection.
  retries: isRemote ? 2 : 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? // `html` is kept as an artifact since a browser failure reads better
      // as a trace than a stack.
      [['github'], ['list'], ['html', { open: 'never' }]]
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
    // The app is mobile-first and most layout bugs have been phone-only, so
    // this is a target, not a variation.
    {
      name: 'mobile',
      testDir: './e2e/public',
      use: { ...devices['Pixel 7'] },
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
              // The session the setup project minted, loaded per test so
              // no test can leave another signed out.
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
