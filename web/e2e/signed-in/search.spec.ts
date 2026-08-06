import { test } from '@playwright/test';

import { itemsIn } from './fixtures';
import { expectTitles, openCategory } from './helpers';

// Search runs in Postgres, through a hand-built PostgREST `or=()` filter with
// its own escaping (see buildSearchFilter). Unit tests hold the string it
// produces; only a real database can say whether that string means what it
// was meant to mean.
test.use({ locale: 'en-GB' });

const allCoins = itemsIn('Münzen').map((item) => item.title);

// Typing only. What follows is waited for by expectTitles, which polls --
// the box debounces and then the query has to come back.
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

  // Four columns are searched together, and a term that only ever matched
  // titles would not notice the other three going missing.
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

  // Below three characters a trigram index cannot seed a scan, so the app
  // deliberately does not filter -- showing everything rather than nothing.
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
  // PostgREST's own `or=()` grammar. Both are escaped before the query is
  // built; unescaped, the first matches everything and the second is parsed
  // as extra filter conditions -- which PostgREST rejects outright.
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
