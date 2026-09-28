import { test as base, expect } from '../fixture';

import { collectPageProblems, expectNoPageProblems } from '../helpers';

/** Fails when the page throws or logs an error, which a passing assertion could otherwise mask. */
export const test = base.extend<{ quietConsole: void }>({
  quietConsole: [
    async ({ page }, use) => {
      const problems = collectPageProblems(page);
      await use();
      expectNoPageProblems(problems);
    },
    { auto: true },
  ],
});

export { expect };
