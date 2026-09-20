import { expect, type Page } from '@playwright/test';

import { createPageTree } from '../pages';

/** The titles currently on the page, in the order the grid shows them. */
export async function visibleTitles(page: Page) {
  return createPageTree(page).catalogue.locators.card.titles.allTextContents();
}

/**
 * Waits for the grid to be showing exactly these titles, in this order.
 *
 * Polled rather than read once: the grid is two async waits away from any
 * keystroke (debounce, then query), so a fixed sleep would be either flaky
 * or slow.
 */
export async function expectTitles(page: Page, expected: string[]) {
  await expect.poll(() => visibleTitles(page)).toEqual(expected);
}
