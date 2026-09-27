import { mergeConfig } from 'vitest/config';
import type { VitestPluginContext } from 'vitest/node';

import baseConfig from './vitest.config.mts';

// Stryker filters tests by their space-joined suite path; Vitest 5 matches names joined by ' > ', so every filtered mutant run ran nothing.
const strykerTestNameSeparator = {
  name: 'stryker-test-name-separator',
  configureVitest({ project }: VitestPluginContext) {
    let pattern = project.config.testNamePattern;
    Object.defineProperty(project.config, 'testNamePattern', {
      get: () => pattern,
      set: (value: RegExp | undefined) => {
        pattern =
          value &&
          new RegExp(value.source.replaceAll(' ', '(?: | > )'), value.flags);
      },
      configurable: true,
      enumerable: true,
    });
  },
};

export default mergeConfig(baseConfig, {
  plugins: [strykerTestNameSeparator],
  test: {
    // Vitest auto-adds its `github-actions` reporter under GITHUB_ACTIONS; a killed mutant is an expected failure, not an annotation.
    reporters: ['dot'],
  },
});
