import { expect, type Page } from '@playwright/test';

export type PageProblems = { errors: string[]; console: string[] };

/** Call before the first navigation -- listeners attached later miss everything from page load. */
export function collectPageProblems(page: Page): PageProblems {
  const problems: PageProblems = { errors: [], console: [] };
  page.on('pageerror', (error) => problems.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.console.push(message.text());
  });
  return problems;
}

/** Console errors are held to the same standard as thrown ones. */
export function expectNoPageProblems(problems: PageProblems) {
  expect(problems.errors, 'uncaught errors').toEqual([]);
  expect(problems.console, 'console errors').toEqual([]);
}

/** Whether the document is wider than the window that has to show it (sideways scroll). */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

export function cssVar(page: Page, name: string) {
  return page.evaluate(
    (prop) =>
      getComputedStyle(document.documentElement).getPropertyValue(prop).trim(),
    name,
  );
}
