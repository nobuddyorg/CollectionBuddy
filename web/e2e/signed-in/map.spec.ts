import { expect, test } from './test';

import { expectTitles, openCategory } from './helpers';

// The map draws a pin per distinct place, from coordinates stored on the item
// at entry time -- the seed carries them, so nothing here calls the geocoder
// and no run depends on a free public service being up.
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

  // Two of the three coins have a place; the third is deliberately without
  // one, and the map is not the place to notice it.
  test('draws a pin for each entry that has a place', async ({ page }) => {
    await openMap(page);
    await expect(pins(page)).toHaveCount(2);
  });

  // The regression #241 was filed for: the map narrowed by category and
  // nothing else, so a search cut the grid down and left every pin standing.
  test('narrows with the search, as the grid does', async ({ page }) => {
    await page.getByTestId('search-input').fill('Silberdenar');
    await expectTitles(page, ['Silberdenar']);

    await openMap(page);
    await expect(pins(page)).toHaveCount(1);
  });

  // Same threshold as the list, or a two-character search would filter one
  // view and not the other.
  test('ignores a search too short for the list to use', async ({ page }) => {
    await page.getByTestId('search-input').fill('si');
    // Below the threshold, so the grid is untouched -- and so is the map.
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
