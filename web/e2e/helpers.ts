import { expect, type Page } from '@playwright/test';

export type PageProblems = { errors: string[]; console: string[] };

/**
 * Starts listening for the two things a page should never do: throw, or log an
 * error. Call before the first navigation -- listeners attached afterwards
 * miss everything that happened during load, which is most of it.
 */
export function collectPageProblems(page: Page): PageProblems {
  const problems: PageProblems = { errors: [], console: [] };
  page.on('pageerror', (error) => problems.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.console.push(message.text());
  });
  return problems;
}

/**
 * Console errors are held to the same standard as thrown ones. A failed image,
 * a rejected cookie, a React warning -- each was a real defect here at some
 * point (#258 was found exactly this way), and the only way a log stays worth
 * reading is if nothing is allowed to live in it.
 */
export function expectNoPageProblems(problems: PageProblems) {
  expect(problems.errors, 'uncaught errors').toEqual([]);
  expect(problems.console, 'console errors').toEqual([]);
}

/**
 * Whether the document is wider than the window that has to show it.
 *
 * Sideways scroll on a phone is the app's most repeated layout failure (#242,
 * #251, #264): something overflows, the whole page slides, and every other
 * element is fine on its own.
 */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** Reads a CSS custom property off :root as the browser resolves it. */
export function cssVar(page: Page, name: string) {
  return page.evaluate(
    (prop) =>
      getComputedStyle(document.documentElement).getPropertyValue(prop).trim(),
    name,
  );
}
