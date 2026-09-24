import { expect, test } from './test';

import type { PageTree } from '../pages';
// map.spec.ts counts pins; this is what happens when one is pressed, and with a location to give.
test.use({ locale: 'en-GB' });

async function openMap(app: PageTree) {
  await app.categories.do.open('Münzen');
  await app.map.do.open();
}

test.describe('the map, up close', () => {
  // The popup is built as DOM, not markup, so a collector's own text is never parsed as HTML.
  test('names the place and its entries when a pin is pressed', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await openMap(app);
    await expect(app.map.locators.pins).toHaveCount(2);
    await app.map.do.openPin();

    await expect(app.map.locators.popup).toBeVisible();
    await expect(app.map.locators.popup).toContainText(/Rome|Florence/);
    await expect(app.map.locators.popup).toContainText(
      /Silberdenar|Goldgulden/,
    );
  });

  // Leaflet's own zoom, not "zoom to me": that one awaits a position fix, which this would race.
  test('frames every pin again after zooming away from them', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await openMap(app);
    await expect(app.map.locators.pins).toHaveCount(2);
    await expect(app.map.locators.pins.first()).toBeInViewport();

    await app.map.do.zoomIn();
    await expect(app.map.locators.pins.first()).not.toBeInViewport();

    await app.map.do.frameAllPins();

    // What framing promises: the pins are back on screen, not merely in the document.
    await expect(app.map.locators.pins).toHaveCount(2);
    await expect(app.map.locators.pins.first()).toBeInViewport();
  });
});

test.describe('the map, with a location to show', () => {
  test.use({
    geolocation: { latitude: 52.52, longitude: 13.405 },
    permissions: ['geolocation'],
  });

  // Permission already granted, so the marker arrives with the map rather than after a prompt.
  test('puts the collector on the map beside the collection', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await openMap(app);
    await expect(app.map.locators.pins).toHaveCount(3);

    await app.map.locators.pins.last().click();
    await expect(app.map.locators.popup).toContainText('You are here');
  });

  // The position fix may land after the second tap; MapModal.test.tsx forces that order, geolocation cannot.
  test('keeps the later of two quick framing taps', async ({ on, page }) => {
    const app = on(page);
    await openMap(app);
    await expect(app.map.locators.pins).toHaveCount(3);

    await app.map.do.zoomToLocation();
    await app.map.do.frameAllPins();
    await expect(app.map.locators.buttons.zoomToLocation).toBeEnabled();

    await expect(app.map.locators.pins.first()).toBeInViewport();
  });
});
