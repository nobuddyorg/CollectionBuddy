import { expect, test } from './test';

import { expectTitles } from './helpers';

// Pin coordinates come from the seed data, not a geocoder, so no run depends
// on a public service being up.
test.use({ locale: 'en-GB' });

test.describe('the map', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open('Münzen');
  });

  test('draws a pin for each entry that has a place', async ({ on, page }) => {
    await on(page).map.do.open();
    await expect(on(page).map.locators.pins).toHaveCount(2);
  });

  test('narrows with the search, as the grid does', async ({ on, page }) => {
    await on(page).catalogue.do.search('Silberdenar');
    await expectTitles(page, ['Silberdenar']);

    await on(page).map.do.open();
    await expect(on(page).map.locators.pins).toHaveCount(1);
  });

  test('ignores a search too short for the list to use', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('si');
    await expect(on(page).catalogue.locators.cards).toHaveCount(3);

    await on(page).map.do.open();
    await expect(on(page).map.locators.pins).toHaveCount(2);
  });

  test('says there is nothing to show when the search matches no place', async ({
    on,
    page,
  }) => {
    await on(page).catalogue.do.search('zzzznothing');
    await expectTitles(page, []);

    await on(page).catalogue.do.openMap();
    await expect(on(page).map.locators.texts.empty).toHaveText(
      'No locations match your search.',
    );
  });

  test('shows only the other collection when that one is open', async ({
    on,
    page,
  }) => {
    await on(page).categories.do.open('Briefmarken');
    await on(page).map.do.open();
    await expect(on(page).map.locators.pins).toHaveCount(1);
  });
});
