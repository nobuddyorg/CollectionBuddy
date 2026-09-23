import { MUTATE_TARGETS } from './mutation-targets.mjs';

// The dashboard reporter needs CI's API key; `json` feeds scripts/mutation-summary.mjs.
const reporters = ['html', 'clear-text', 'progress', 'json'];
if (process.env.STRYKER_DASHBOARD_API_KEY) reporters.push('dashboard');

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  reporters,
  // A vitest config without the `github-actions` reporter: a killed mutant is not a real test failure.
  vitest: {
    configFile: 'vitest.mutation.config.mts',
  },
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  // project/version come from the CI git context.
  dashboard: {
    reportType: 'full',
  },
  // The sandbox copy cannot copy a symlink; the e2e server's out/ symlink dies on ENOTSUP.
  ignorePatterns: [
    '.e2e-serve',
    'out',
    '.next',
    'coverage',
    'reports',
    'test-results',
    'playwright-report',
  ],
  // A mutant covered by hundreds of tests runs the whole suite; the 5s default reported honest failures as timeouts.
  timeoutMS: 20_000,
  // Shared with vitest.config.mts's per-file coverage floors so the two lists cannot drift.
  mutate: MUTATE_TARGETS,
  // Blind to non-mutated, non-test files, so main forces a full run.
  incremental: true,
  // One below the measured 100, so a single new equivalent mutant cannot block unrelated work.
  thresholds: {
    high: 100,
    low: 99,
    break: 99,
  },
};

export default config;
