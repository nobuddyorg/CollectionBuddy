import { test as base } from '@playwright/test';
import MCR from 'monocart-coverage-reports';

// Playwright's Coverage API is Chromium-only (CDP); the fixture skips collection on other engines.
const mcr = MCR({
  name: 'CollectionBuddy e2e coverage',
  outputDir: 'coverage-e2e',
  reports: ['v8', 'console-summary', 'markdown-summary'],
  // The export's own bundle, not the service worker registered alongside it.
  entryFilter: '**/_next/**',
  // Needs E2E_COVERAGE_SOURCEMAPS (next.config.ts); without source maps the bundle has no `src/app` paths.
  sourceFilter: '**/src/app/**',
});

// Floors ~3pp under a measured `npm run e2e:local` run; raised by hand, never lowered (CLAUDE.md).
const LOCAL_STACK_COVERAGE_THRESHOLDS = {
  statements: 76,
  branches: 65,
  functions: 79,
  lines: 81,
};

// Only the local-stack run is gated: it is the one run with source maps and every project. A deployed bundle has no source maps, so its numbers are minified-line counts.
const COVERAGE_THRESHOLDS: Partial<typeof LOCAL_STACK_COVERAGE_THRESHOLDS> =
  process.env.E2E_SUPABASE_URL ? LOCAL_STACK_COVERAGE_THRESHOLDS : {};

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

// Called once from globalTeardown; each worker's `add()` persisted to `outputDir`, and throwing here fails the whole run.
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
