import { test as base, expect } from '@playwright/test';

/**
 * The signed-in suite's `test`, which additionally fails when the page throws
 * or logs an error.
 *
 * The signed-out suite has always done this -- it is how #258 was found -- but
 * the signed-in one did not, which left it blind to exactly the errors only a
 * session can produce: a rejected query, a failed upload, a React warning from
 * a state update after unmount. A test could watch a card appear and pass
 * while the console filled up behind it.
 *
 * Attached before navigation, because listeners hung afterwards miss
 * everything that happened during load, which is most of it.
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
