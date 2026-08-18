import { expect, test } from './test';

import { expectTitles, openCategory } from './helpers';

// Pin coordinates come from the seed data, not a geocoder, so no run depends
// on a public service being up.
test.use({ locale: 'en-GB' });

const pins = (page: import('@playwright/test').Page) =>
  page.locator('.leaflet-marker-icon');

async function openMap(page: import('@playwright/test').Page) {
  await page.getByTestId('open-map').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
}

test.describe('the map', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, 'Münzen');
  });

  test('draws a pin for each entry that has a place', async ({ page }) => {
    await openMap(page);
    await expect(pins(page)).toHaveCount(2);
  });

  test('narrows with the search, as the grid does', async ({ page }) => {
    await page.getByTestId('search-input').fill('Silberdenar');
    await expectTitles(page, ['Silberdenar']);

    await openMap(page);
    await expect(pins(page)).toHaveCount(1);
  });

  test('ignores a search too short for the list to use', async ({ page }) => {
    await page.getByTestId('search-input').fill('si');
    await expect(page.getByTestId('item-card')).toHaveCount(3);

    await openMap(page);
    await expect(pins(page)).toHaveCount(2);
  });

  test('says there is nothing to show when the search matches no place', async ({
    page,
  }) => {
    await page.getByTestId('search-input').fill('zzzznothing');
    await expectTitles(page, []);

    await page.getByTestId('open-map').click();
    await expect(
      page.getByText('No locations match your search.'),
    ).toBeVisible();
  });

  test('shows only the other collection when that one is open', async ({
    page,
  }) => {
    await openCategory(page, 'Briefmarken');
    await openMap(page);
    await expect(pins(page)).toHaveCount(1);
  });
});
