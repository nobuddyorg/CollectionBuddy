import { expect, type Page } from '@playwright/test';

import { createPageTree } from '../pages';

/** The titles currently on the page, in the order the grid shows them. */
export async function visibleTitles(page: Page) {
  return createPageTree(page).catalogue.locators.cardTitles.allTextContents();
}

/** Polled: the grid is two async waits (debounce, then query) away from any keystroke. */
export async function expectTitles(page: Page, expected: string[]) {
  await expect.poll(() => visibleTitles(page)).toEqual(expected);
}
