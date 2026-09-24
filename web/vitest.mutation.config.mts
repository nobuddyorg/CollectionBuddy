import { mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.mts';

// Vitest auto-adds its `github-actions` reporter under GITHUB_ACTIONS; a killed mutant is an expected failure, not an annotation.
export default mergeConfig(baseConfig, {
  test: {
    reporters: ['dot'],
  },
});
