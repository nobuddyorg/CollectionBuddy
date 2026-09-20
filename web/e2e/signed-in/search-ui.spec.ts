import { expect, test } from './test';

import { itemsIn } from './fixtures';
import { expectTitles, openCategory } from './helpers';

// search.spec.ts asks what a term matches; this is the interface around it
// -- what it says while typing, what it offers when nothing matched, and
// the two ways back to the whole collection.
test.use({ locale: 'en-GB' });

const allCoins = itemsIn('Münzen').map((item) => item.title);

test.describe('the search box', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, 'Münzen');
  });

  // Announced rather than shown: the grid is the visible answer, so the
  // count exists for a screen reader that cannot see it change.
  test('announces how many entries a term matched', async ({ page }) => {
    await page.getByTestId('search-input').fill('Silberdenar');
    await expect(page.getByText('1 result', { exact: true })).toBeAttached();

    await page.getByTestId('search-input').fill('e');
    await page.getByTestId('search-input').fill('si');
    await expect(
      page.getByText('Keep typing to search', { exact: true }),
    ).toBeAttached();
  });

  test('clears back to the whole collection from its own button', async ({
    page,
  }) => {
    await page.getByTestId('search-input').fill('Silberdenar');
    await expectTitles(page, ['Silberdenar']);

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByTestId('search-input')).toHaveValue('');
    await expectTitles(page, allCoins);
  });

  // The empty state is its own screen, and the way out of it is a second
  // clear button that only exists there.
  test('offers a way out when nothing matched', async ({ page }) => {
    await page.getByTestId('search-input').fill('zzzznothing');
    await expect(
      page.getByRole('heading', { name: 'No results for "zzzznothing"' }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Clear search', exact: true })
      .last()
      .click();
    await expectTitles(page, allCoins);
  });
});
