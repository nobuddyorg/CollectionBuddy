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

/** The document's scroll width beside the window's client width, for a sideways-scroll check. */
export async function documentWidths(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

export function rootComputedStyle(page: Page, property: string) {
  return page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    property,
  );
}

export function themeAttribute(page: Page) {
  return page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'),
  );
}
