import { test as base, expect } from '../fixture';

/** Fails when the page throws or logs an error, which a passing assertion could otherwise mask. */
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
