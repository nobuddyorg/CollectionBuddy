import { test as base, expect } from '@playwright/test';

/**
 * The signed-in suite's `test`, which additionally fails when the page throws
 * or logs an error -- catching session-only failures like a rejected query or
 * a failed upload that a passing assertion could otherwise mask.
 */
export const test = base.extend<{ quietConsole: void }>({
  quietConsole: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(`threw: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error')
          problems.push(`logged: ${message.text()}`);
      });

      await use();

      expect(problems, 'the page threw or logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
