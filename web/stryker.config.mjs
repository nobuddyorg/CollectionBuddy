import { MUTATE_TARGETS } from './mutation-targets.mjs';

// Publish to the Stryker dashboard only when the API key is available (CI on
// nobuddyorg/CollectionBuddy). Local runs and key-less CI keep the offline reporters.
// `json` always runs -- scripts/mutation-summary.mjs reads reports/mutation/mutation.json
// to build the mutation_test job's Actions summary table.
const reporters = ['html', 'clear-text', 'progress', 'json'];
if (process.env.STRYKER_DASHBOARD_API_KEY) reporters.push('dashboard');

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  reporters,
  // Points Stryker's internal test runs at a vitest config with the noisy
  // `github-actions` reporter turned off -- see vitest.mutation.config.ts.
  vitest: {
    configFile: 'vitest.mutation.config.ts',
  },
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  // project/version are auto-detected from the CI git context (badge tracks main).
  dashboard: {
    reportType: 'full',
  },
  // Stryker copies the project into a sandbox before mutating it, and can't
  // copy a symlink -- the e2e server's out/ symlink has to be excluded or a
  // run started while that server is up dies on ENOTSUP.
  ignorePatterns: [
    '.e2e-serve',
    'out',
    '.next',
    'coverage',
    'reports',
    'test-results',
    'playwright-report',
  ],
  // See mutation-targets.mjs for what's in this list and why -- shared with
  // vitest.config.ts's per-file coverage floors so the two can't drift.
  mutate: MUTATE_TARGETS,
  thresholds: {
    high: 100,
    low: 90,
    break: 90,
  },
};

export default config;
