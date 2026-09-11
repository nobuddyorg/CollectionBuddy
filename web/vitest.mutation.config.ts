import { mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config';

// Stryker re-runs the suite once per mutant, and a "failed" run is the
// expected, correct outcome of killing one -- that isn't a real test
// failure. Vitest still auto-adds its `github-actions` reporter whenever
// GITHUB_ACTIONS is set, so every kill became a workflow annotation and
// buried the mutation_test job's Actions summary under hundreds of expected
// failures. Stryker points at this file instead of vitest.config.ts (see
// stryker.config.mjs's `vitest.configFile`) so `npm test` itself keeps its
// real annotations.
export default mergeConfig(baseConfig, {
  test: {
    reporters: ['dot'],
  },
});
