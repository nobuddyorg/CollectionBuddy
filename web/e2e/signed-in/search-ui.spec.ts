import { expect, test } from './test';

import { itemsIn } from './fixtures';
import { expectTitles } from './helpers';

// search.spec.ts asks what a term matches; this is the interface around it
// -- what it says while typing, what it offers when nothing matched, and
// the two ways back to the whole collection.
test.use({ locale: 'en-GB' });

const allCoins = itemsIn('Münzen').map((item) => item.title);

test.describe('the search box', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open('Münzen');
  });

  // Announced rather than shown: the grid is the visible answer, so the
  // count exists for a screen reader that cannot see it change.
  test('announces how many entries a term matched', async ({ on, page }) => {
    const status = on(page).catalogue.locators.texts.searchStatus;

    await on(page).catalogue.do.search('Silberdenar');
    await expect(status).toHaveText('1 result');

    await on(page).catalogue.do.search('si');
    await expect(status).toHaveText('Keep typing to search');
  });

  test('clears back to the whole collection from its own button', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('Silberdenar');
    await expectTitles(page, ['Silberdenar']);

    await on(page).catalogue.do.clearSearch();
    await expect(on(page).catalogue.locators.inputs.search).toHaveValue('');
    await expectTitles(page, allCoins);
  });

  // The empty state is its own screen, and the way out of it is a second
  // clear button that only exists there.
  test('offers a way out when nothing matched', async ({ on, page }) => {
    await on(page).catalogue.do.search('zzzznothing');
    await expect(on(page).catalogue.locators.texts.emptyTitle).toHaveText(
      'No results for "zzzznothing"',
    );

    await on(page).catalogue.locators.buttons.clearSearchFromEmptyState.click();
    await expectTitles(page, allCoins);
  });
});
