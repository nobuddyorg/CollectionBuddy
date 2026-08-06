import { expect, type Page } from '@playwright/test';

/**
 * Opens the catalogue on a named category.
 *
 * Which category the app opens on is not something a test should assume: with
 * nothing remembered it takes the alphabetically first, and it remembers the
 * last one chosen -- so it depends on the seed data and on whatever ran
 * before. Every test that cares says which one it means.
 *
 * The strip of categories is collapsed once one is selected, so this opens it
 * first. Category names are the user's own words rather than translations,
 * which is why the tab can be named directly.
 */
export async function openCategory(page: Page, name: string) {
  await page.goto('', { waitUntil: 'networkidle' });

  // Wait for the categories to have arrived before asking anything about the
  // strip. `isVisible()` answers immediately rather than waiting, so asking
  // it too early reports "not collapsed" for a strip that simply is not there
  // yet -- and the tab that would have been clicked never appears.
  await expect(page.getByTestId('selected-category')).not.toBeEmpty();

  const tab = page.getByRole('tab', { name, exact: true });
  if (!(await tab.isVisible())) {
    await page.getByTestId('expand-categories').click();
  }
  await tab.click();

  // The strip collapses the moment one is chosen, taking the tabs with it --
  // so what confirms the choice is the heading it collapses to, not the tab
  // that no longer exists. Then wait for the grid to have refetched.
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
 * Polled rather than read once, because the grid is two waits away from any
 * keystroke: the search box debounces, and then the query has to come back.
 * Sleeping for "long enough" instead is how a suite becomes slow and flaky at
 * the same time -- too short on a loaded CI runner, too long on every other
 * run.
 */
export async function expectTitles(page: Page, expected: string[]) {
  await expect.poll(() => visibleTitles(page)).toEqual(expected);
}
