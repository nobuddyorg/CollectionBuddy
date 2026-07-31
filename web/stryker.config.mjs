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
  mutate: [
    'src/app/data/items.ts',
    'src/app/components/ItemList/Pagination.tsx',
    'src/app/components/ItemList/useItemImages.tsx',
    'src/app/components/ItemList/optimistic.ts',
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
