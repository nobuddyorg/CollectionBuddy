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
 * guardrail. One per suite, since the two never run together and reach
 * wildly different amounts of the app: `npm run e2e` serves the built
 * export to a signed-out visitor, `npm run e2e:local` points the same
 * report at a real stack. A shared floor would be the signed-out one, and
 * the signed-in suite could then lose most of its coverage unnoticed.
 *
 * Each is a margin below what a real run achieved -- signed-out
 * 16.43/6.87/14.16/43.34 locally (chromium + mobile), signed-in
 * 79.38/68.37/82.50/84.82 in CI's e2e_local_stack job, which is the only
 * place that suite can run. The signed-in margin is ~3pp, against the
 * ~1pp these numbers have moved between runs of an unchanged suite; a
 * floor tighter than that buys nothing and fails green work. Raise by hand
 * once a real run reports a higher number -- never lower one to make a
 * change fit.
 */
const COVERAGE_THRESHOLDS = process.env.E2E_SUPABASE_URL
  ? { statements: 76, branches: 65, functions: 79, lines: 81 }
  : { statements: 15, branches: 6, functions: 13, lines: 42 };

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
