// Publish to the Stryker dashboard only when the API key is available (CI on
// nobuddyorg/CollectionBuddy). Local runs and key-less CI keep the offline reporters.
const reporters = ['html', 'clear-text', 'progress'];
if (process.env.STRYKER_DASHBOARD_API_KEY) reporters.push('dashboard');

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  reporters,
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  // project/version are auto-detected from the CI git context (badge tracks main).
  dashboard: {
    reportType: 'full',
  },
  // Stryker copies the project into a sandbox before mutating it, and a
  // symlink is not a file it can copy -- so the directory the end-to-end
  // server builds to put out/ under the base path has to be excluded, or a
  // mutation run started while that server is up dies on ENOTSUP. The rest is
  // output nobody needs a copy of.
  ignorePatterns: [
    '.e2e-serve',
    'out',
    '.next',
    'coverage',
    'reports',
    'test-results',
    'playwright-report',
  ],
  // Every file here pairs pure exported logic with a `Stryker disable all`
  // region around whatever I/O it sits next to, so what is scored is the part
  // that carries the risk. Adding a file means first drawing that line in it.
  mutate: [
    'src/app/data/items.ts',
    'src/app/components/ItemList/Pagination.tsx',
    'src/app/components/ItemList/useItemImages.tsx',
    'src/app/components/ItemList/optimistic.ts',
    'src/app/components/ItemList/paging.ts',
    'src/app/components/ItemList/imageCache.ts',
    'src/app/components/Map/usePlaces.tsx',
    'src/app/components/Map/useCurrentLocation.ts',
    'src/app/components/Coin/size.ts',
    'src/app/components/CenteredModal/getFocusable.ts',
    'src/app/components/CenteredModal/useEscapeToClose.tsx',
    'src/app/useTheme.ts',
    'src/app/components/ItemForm/usePhoton.tsx',
    'src/app/i18n/I18nProvider.tsx',
  ],
  thresholds: {
    high: 100,
    low: 90,
    break: 90,
  },
};

export default config;
