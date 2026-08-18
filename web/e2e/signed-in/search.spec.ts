import { test } from './test';

import { itemsIn } from './fixtures';
import { expectTitles, openCategory } from './helpers';

// Search runs through a hand-built PostgREST `or=()` filter (buildSearchFilter).
// Unit tests cover the string it produces; only a real database can confirm
// what that string actually matches.
test.use({ locale: 'en-GB' });

const allCoins = itemsIn('Münzen').map((item) => item.title);

async function search(page: import('@playwright/test').Page, term: string) {
  await page.getByTestId('search-input').fill(term);
}

test.describe('searching a collection', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, 'Münzen');
  });

  test('narrows to a title', async ({ page }) => {
    await search(page, 'Silberdenar');
    await expectTitles(page, ['Silberdenar']);
  });

  test('matches on a description', async ({ page }) => {
    await search(page, 'Lilie');
    await expectTitles(page, ['Goldgulden']);
  });

  test('matches on a place', async ({ page }) => {
    await search(page, 'Florence');
    await expectTitles(page, ['Goldgulden']);
  });

  test('matches on a tag', async ({ page }) => {
    await search(page, 'silber');
    await expectTitles(page, ['Silberdenar']);
  });

  test('is case-insensitive', async ({ page }) => {
    await search(page, 'SILBERDENAR');
    await expectTitles(page, ['Silberdenar']);
  });

  // Below three characters a trigram index can't seed a scan, so the app
  // deliberately skips filtering rather than showing nothing.
  test('leaves the list alone for a term of two characters', async ({
    page,
  }) => {
    await search(page, 'si');
    await expectTitles(page, allCoins);
  });

  test('says so when nothing matches', async ({ page }) => {
    await search(page, 'zzzznothing');
    await expectTitles(page, []);
  });

  test('restores the collection when the search is cleared', async ({
    page,
  }) => {
    await search(page, 'Silberdenar');
    await expectTitles(page, ['Silberdenar']);

    await search(page, '');
    await expectTitles(page, allCoins);
  });

  // A percent sign is a LIKE wildcard and a comma is a delimiter in
  // PostgREST's `or=()` grammar; both must be escaped before the query is built.
  test('treats a percent sign as text rather than a wildcard', async ({
    page,
  }) => {
    await search(page, '100%');
    await expectTitles(page, []);
  });

  test('survives a comma without the query falling apart', async ({ page }) => {
    await search(page, 'Rom,e');
    await expectTitles(page, []);
  });

  test('survives a quote and a parenthesis', async ({ page }) => {
    await search(page, 'say "hi" (please)');
    await expectTitles(page, []);
  });

  // Searching does not change which collection is open.
  test('stays within the category', async ({ page }) => {
    await search(page, 'Mauritius');
    await expectTitles(page, []);
  });
});
