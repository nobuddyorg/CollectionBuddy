import { defineConfig, devices } from '@playwright/test';

import { EXPORT_BASE_PATH } from './next.config';

// One suite, two targets. Unset, it builds nothing and serves the local
// export; with E2E_BASE_URL it runs against a deployed site, which is how the
// post-deploy job checks the real thing at its real origin (#246).
//
// Everything in e2e/ therefore has to hold for a *signed-out* visitor: these
// runs have no Supabase session, and the production one must not be able to
// write anything to a live database. Signed-in journeys need the local stack,
// which is its own piece of work.
const PORT = Number(process.env.E2E_PORT ?? 4173);

// Trailing slash on purpose: Playwright resolves a relative goto() against
// this, and without it the last segment -- the base path -- is dropped. Tests
// navigate with relative paths ('', 'login/') for the same reason.
const localURL = `http://127.0.0.1:${PORT}${EXPORT_BASE_PATH}/`;
const baseURL = process.env.E2E_BASE_URL ?? localURL;
const isRemote = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  // A page that only fails one run in ten is a page that fails for a tenth of
  // visitors; retries would hide exactly the flake worth knowing about. The
  // remote target is the exception -- there, a retry distinguishes a broken
  // deploy from a dropped connection.
  retries: isRemote ? 2 : 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? // `github` annotates the failing line in the PR diff; `html` is what
      // the workflow keeps as an artifact when a run goes red, since a
      // failure in a browser is a great deal easier to read as a trace than
      // as a stack.
      [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The app is mobile-first and most of its layout bugs have been phone-only
    // (#242, #251, #264), so a phone viewport is a target rather than a
    // variation.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
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
