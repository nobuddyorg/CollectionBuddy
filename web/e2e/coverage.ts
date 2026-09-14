import { test as base } from '@playwright/test';
import MCR from 'monocart-coverage-reports';

/**
 * Every project in playwright.config.ts (`chromium`, `mobile`, `signed-in`)
 * runs on a Chromium engine, and Playwright's Coverage API only exists there
 * (it talks to the browser over CDP) -- so this is the one instrumentation-free
 * way to get real JS/CSS coverage out of the e2e suite. No Istanbul/babel
 * build step needed.
 */
const mcr = MCR({
  name: 'CollectionBuddy e2e coverage',
  outputDir: 'coverage-e2e',
  reports: ['v8', 'console-summary'],
  // The static export's own bundle, not the vendor chunks (React, Leaflet,
  // Supabase) bundled alongside it.
  entryFilter: '**/_next/**',
});

export const test = base.extend<{ autoCoverage: void }>({
  autoCoverage: [
    async ({ page, browserName }, use) => {
      const collect = browserName === 'chromium';
      if (collect) {
        await Promise.all([
          page.coverage.startJSCoverage({ resetOnNavigation: false }),
          page.coverage.startCSSCoverage({ resetOnNavigation: false }),
        ]);
      }

      await use();

      if (collect) {
        const [jsCoverage, cssCoverage] = await Promise.all([
          page.coverage.stopJSCoverage(),
          page.coverage.stopCSSCoverage(),
        ]);
        await mcr.add([...jsCoverage, ...cssCoverage]);
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';

/**
 * Merges every worker's coverage (each `add()` above persists to
 * `outputDir`'s cache, not just this process's memory) into one report.
 * Called once from globalTeardown, after every project has finished.
 */
export async function generateCoverageReport() {
  await mcr.generate();
}
