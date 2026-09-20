import { expect, test } from './test';

import { openCategory } from './helpers';

// map.spec.ts counts pins; this is what happens when one is pressed, and
// what the map does with a browser that has a location to give.
test.use({ locale: 'en-GB' });

type Page = import('@playwright/test').Page;

const pins = (page: Page) => page.locator('.leaflet-marker-icon');

async function openMap(page: Page) {
  await openCategory(page, 'Münzen');
  await page.getByTestId('open-map').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
}

test.describe('the map, up close', () => {
  // The popup is built as DOM rather than markup, precisely so a collector's
  // own text is never parsed as HTML -- so it is worth reading back.
  test('names the place and its entries when a pin is pressed', async ({
    page,
  }) => {
    await openMap(page);
    await expect(pins(page)).toHaveCount(2);
    await pins(page).first().click();

    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(/Rome|Florence/);
    await expect(popup).toContainText(/Silberdenar|Goldgulden/);
  });
});

test.describe('the map, with a location to show', () => {
  test.use({
    geolocation: { latitude: 52.52, longitude: 13.405 },
    permissions: ['geolocation'],
  });

  // Permission already granted means no prompt to raise, so the marker
  // arrives with the map rather than waiting to be asked for.
  test('puts the collector on the map beside the collection', async ({
    page,
  }) => {
    await openMap(page);
    await expect(pins(page)).toHaveCount(3);

    await pins(page).last().click();
    await expect(page.locator('.leaflet-popup-content')).toContainText(
      'You are here',
    );
  });

  test('frames every pin again after zooming somewhere else', async ({
    page,
  }) => {
    await openMap(page);
    await expect(pins(page)).toHaveCount(3);

    await page
      .getByRole('button', { name: 'Zoom to current location' })
      .click();
    await page.getByRole('button', { name: 'Show all locations' }).click();

    // What framing promises: the pins are back on screen, not merely back
    // in the document after the zoom moved away from them.
    await expect(pins(page)).toHaveCount(3);
    await expect(pins(page).first()).toBeInViewport();
  });
});
