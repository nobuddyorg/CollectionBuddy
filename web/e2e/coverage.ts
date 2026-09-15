import { test as base } from '@playwright/test';
import MCR from 'monocart-coverage-reports';

/**
 * Playwright's Coverage API only exists on Chromium (it talks to the browser
 * over CDP), which is an instrumentation-free way to get real JS/CSS
 * coverage out of most of the e2e suite -- no Istanbul/babel build step
 * needed. `firefox` (playwright.config.ts) is the one project it can't
 * cover; the fixture below just skips collection there rather than failing.
 */
const mcr = MCR({
  name: 'CollectionBuddy e2e coverage',
  outputDir: 'coverage-e2e',
  reports: ['v8', 'console-summary'],
  // The static export's own bundle, not e.g. the service worker registered
  // alongside it.
  entryFilter: '**/_next/**',
  // Only meaningful once E2E_COVERAGE_SOURCEMAPS unpacks a chunk's original
  // sources (next.config.ts): without it, every vendor library bundled
  // alongside app code (Supabase, Leaflet, React) would swamp the report.
  sourceFilter: '**/src/app/**',
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
