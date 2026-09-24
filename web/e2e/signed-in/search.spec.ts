import { test } from './test';

import { itemsIn } from './fixtures';
import { expectTitles } from './helpers';

// Unit tests cover the pattern sent to search_category_items; only a real database confirms what it matches.
test.use({ locale: 'en-GB' });

const allCoins = itemsIn('Münzen').map((item) => item.title);

test.describe('searching a collection', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open('Münzen');
  });

  test('narrows to a title', async ({ on, page }) => {
    await on(page).catalogue.do.search('Silberdenar');
    await expectTitles(page, ['Silberdenar']);
  });

  test('matches on a description', async ({ on, page }) => {
    await on(page).catalogue.do.search('Lilie');
    await expectTitles(page, ['Goldgulden']);
  });

  test('matches on a place', async ({ on, page }) => {
    await on(page).catalogue.do.search('Florence');
    await expectTitles(page, ['Goldgulden']);
  });

  test('matches on a tag', async ({ on, page }) => {
    await on(page).catalogue.do.search('silber');
    await expectTitles(page, ['Silberdenar']);
  });

  test('is case-insensitive', async ({ on, page }) => {
    await on(page).catalogue.do.search('SILBERDENAR');
    await expectTitles(page, ['Silberdenar']);
  });

  // Below three characters the app skips filtering, to limit how often a filtered category scan runs.
  test('leaves the list alone for a term of two characters', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('si');
    await expectTitles(page, allCoins);
  });

  test('says so when nothing matches', async ({ on, page }) => {
    await on(page).catalogue.do.search('zzzznothing');
    await expectTitles(page, []);
  });

  test('restores the collection when the search is cleared', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('Silberdenar');
    await expectTitles(page, ['Silberdenar']);

    await on(page).catalogue.do.search('');
    await expectTitles(page, allCoins);
  });

  // A percent sign is a LIKE wildcard; unescaped it would match everything rather than nothing.
  test('treats a percent sign as text rather than a wildcard', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('100%');
    await expectTitles(page, []);
  });

  test('survives a comma without the query falling apart', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('Rom,e');
    await expectTitles(page, []);
  });

  test('survives a quote and a parenthesis', async ({ on, page }) => {
    await on(page).catalogue.do.search('say "hi" (please)');
    await expectTitles(page, []);
  });

  // Searching does not change which collection is open.
  test('stays within the category', async ({ on, page }) => {
    await on(page).catalogue.do.search('Mauritius');
    await expectTitles(page, []);
  });
});
