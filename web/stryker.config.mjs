import { MUTATE_TARGETS } from './mutation-targets.mjs';

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
