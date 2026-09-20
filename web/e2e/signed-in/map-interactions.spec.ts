import { expect, test } from './test';

import { openCategory } from './helpers';

// map.spec.ts counts pins; this is what happens when one is pressed, and
// the one control that needs something no unit test has -- a browser with
// a location to give.
test.use({
  locale: 'en-GB',
  geolocation: { latitude: 52.52, longitude: 13.405 },
  permissions: ['geolocation'],
});

type Page = import('@playwright/test').Page;

const pins = (page: Page) => page.locator('.leaflet-marker-icon');

test.describe('the map, up close', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, 'Münzen');
    await page.getByTestId('open-map').click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  // The popup is built as DOM rather than markup, precisely so a collector's
  // own text is never parsed as HTML -- so it is worth reading back.
  test('names the place and its entries when a pin is pressed', async ({
    page,
  }) => {
    await pins(page).first().click();

    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(/Rome|Florence/);
    await expect(popup).toContainText(/Silberdenar|Goldgulden/);
  });

  test('puts the collector on the map when asked where they are', async ({
    page,
  }) => {
    await expect(pins(page)).toHaveCount(2);

    await page
      .getByRole('button', { name: 'Zoom to current location' })
      .click();

    // The seeded pins plus one for here.
    await expect(pins(page)).toHaveCount(3);
    await pins(page).last().click();
    await expect(page.locator('.leaflet-popup-content')).toContainText(
      'You are here',
    );
  });

  test('frames every pin again after zooming somewhere else', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: 'Zoom to current location' })
      .click();
    await expect(pins(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Show all locations' }).click();
    // Framing is a viewport change, not a data change: every pin the
    // collection has is still drawn afterwards.
    await expect(pins(page)).toHaveCount(3);
  });
});
