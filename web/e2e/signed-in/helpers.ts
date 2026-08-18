import { expect, type Page } from '@playwright/test';

/**
 * Opens the catalogue on a named category.
 *
 * Which category opens by default depends on seed data and prior selection,
 * so every test that cares names one explicitly rather than assuming.
 */
export async function openCategory(page: Page, name: string) {
  await page.goto('', { waitUntil: 'networkidle' });

  // `isVisible()` answers immediately rather than waiting, so this must wait
  // for the strip to have loaded before checking whether it's collapsed.
  await expect(page.getByTestId('selected-category')).not.toBeEmpty();

  const tab = page.getByRole('tab', { name, exact: true });
  if (!(await tab.isVisible())) {
    await page.getByTestId('expand-categories').click();
  }
  await tab.click();

  // The strip collapses on selection, taking the tab with it, so the
  // heading confirms the choice instead. Then wait for the grid to refetch.
  await expect(page.getByTestId('selected-category')).toHaveText(name);
  await expect(page.getByTestId('item-card').first()).toBeVisible();
}

/** The titles currently on the page, in the order the grid shows them. */
export async function visibleTitles(page: Page) {
  return page
    .getByTestId('item-card')
    .getByRole('heading', { level: 3 })
    .allTextContents();
}

/**
 * Waits for the grid to be showing exactly these titles, in this order.
 *
 * Polled rather than read once: the grid is two async waits away from any
 * keystroke (debounce, then query), so a fixed sleep would be either flaky or slow.
 */
export async function expectTitles(page: Page, expected: string[]) {
  await expect.poll(() => visibleTitles(page)).toEqual(expected);
}
