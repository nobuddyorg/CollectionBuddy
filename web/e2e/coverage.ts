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
  reports: ['v8', 'console-summary', 'markdown-summary'],
  // The static export's own bundle, not e.g. the service worker registered
  // alongside it.
  entryFilter: '**/_next/**',
  // Only meaningful once E2E_COVERAGE_SOURCEMAPS unpacks a chunk's original
  // sources (next.config.ts): without it, every vendor library bundled
  // alongside app code (Supabase, Leaflet, React) would swamp the report.
  sourceFilter: '**/src/app/**',
});

/**
 * A floor, not a target -- see TEST_STRATEGY.md and CLAUDE.md's coverage
 * guardrail. Measured from a full local run of the signed-out suite alone
 * (chromium + mobile, e2e/public), the smaller of the two suites that feed
 * this report, with a margin below what it actually achieved:
 * statements 16.43%, branches 6.87%, functions 14.16%, lines 43.34%. The
 * signed-in suite (npm run e2e:local) touches far more of the app and
 * clears this easily; it shares the same floor rather than a tighter one
 * of its own because this sandbox has no Supabase/Docker to measure it
 * against for real, and a guessed number is worse than none (see
 * "Measure, don't assume" in CLAUDE.md). Raise by hand once a real run
 * reports a higher achieved number -- never lower it to make a change fit.
 */
const COVERAGE_THRESHOLDS = {
  statements: 15,
  branches: 6,
  functions: 13,
  lines: 42,
};

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
 * `outputDir`'s cache, not just this process's memory) into one report, then
 * gates on COVERAGE_THRESHOLDS. Called once from globalTeardown, after every
 * project has finished -- throwing here fails the whole Playwright run, the
 * same as a failed test would.
 */
export async function generateCoverageReport() {
  const results = await mcr.generate();
  if (!results) return;

  const failures = Object.entries(COVERAGE_THRESHOLDS)
    .map(([metric, floor]) => {
      const pct =
        results.summary[metric as keyof typeof COVERAGE_THRESHOLDS]?.pct;
      return typeof pct === 'number' && pct < floor
        ? `${metric}: ${pct.toFixed(2)}% is below the ${floor}% floor`
        : null;
    })
    .filter((failure) => failure !== null);

  if (failures.length > 0) {
    throw new Error(
      `e2e coverage dropped below its floor:\n${failures.join('\n')}`,
    );
  }
}
