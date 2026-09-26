import { expect, test } from './test';

import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { expectTitles, visibleTitles } from './helpers';

// paging.ts has the arithmetic; this is that the grid asks a page at a time.
test.use({ locale: 'en-GB' });

test.describe('a collection larger than one page', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.pagingCategory);
  });

  test('shows a page at a time and walks between them', async ({
    on,
    page,
  }) => {
    const catalogue = on(page).catalogue;

    await expect(catalogue.locators.cards).toHaveCount(9);
    // Newest first, and the seed goes in oldest first.
    expect((await visibleTitles(page))[0]).toBe('Schaustück 11');

    await catalogue.locators.buttons.nextPage.click();
    // The remainder: an off-by-one would repeat or skip an entry here.
    await expectTitles(page, ['Schaustück 02', 'Schaustück 01']);
    await expect(
      catalogue.locators.buttons.pageNumbers.filter({ hasText: /^2$/ }),
    ).toHaveAttribute('aria-current', 'page');

    await catalogue.locators.buttons.previousPage.click();
    await expect(catalogue.locators.cards).toHaveCount(9);

    // A numbered page is the other way in.
    await catalogue.locators.buttons.pageNumbers
      .filter({ hasText: /^2$/ })
      .click();
    await expectTitles(page, ['Schaustück 02', 'Schaustück 01']);
  });

  // Paging follows what the search left, not what the collection holds.
  test('stops paging when a search narrows it to one page', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('Schaustück 01');
    await expectTitles(page, ['Schaustück 01']);
    await expect(on(page).catalogue.locators.pagination).toHaveCount(0);
  });
});

test.describe('a delete that empties the last page', () => {
  // The clamp once stayed unwritten, so the entry that refilled page two sent the grid back there.
  test('keeps the grid on page one when a new entry refills page two', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = `Neuzugang ${Date.now()}`;
    await app.categories.do.open(SEED.sortingCategory);
    const secondPage = app.catalogue.locators.buttons.pageNumbers.filter({
      hasText: /^2$/,
    });
    const firstPage = app.catalogue.locators.buttons.pageNumbers.filter({
      hasText: /^1$/,
    });
    try {
      await secondPage.click();
      await expectTitles(page, ['Sortierstück 01']);

      await app.catalogue.do.removeEntry('Sortierstück 01');
      await app.toast.do.commitDeletion('items');
      await expect(app.catalogue.locators.pagination).toHaveCount(0);
      await expect(app.catalogue.locators.cards).toHaveCount(9);

      await app.catalogue.do.addEntry(title);
      await expect(firstPage).toHaveAttribute('aria-current', 'page');
      await expect(secondPage).not.toHaveAttribute('aria-current', 'page');
      expect((await visibleTitles(page))[0]).toBe(title);
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
