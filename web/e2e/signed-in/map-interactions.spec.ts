import { expect, test } from './test';

import type { PageTree } from '../pages';
// map.spec.ts counts pins; this is what happens when one is pressed, and
// what the map does with a browser that has a location to give.
test.use({ locale: 'en-GB' });

async function openMap(app: PageTree) {
  await app.categories.do.open('Münzen');
  await app.map.do.open();
}

test.describe('the map, up close', () => {
  // The popup is built as DOM rather than markup, precisely so a collector's
  // own text is never parsed as HTML -- so it is worth reading back.
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
});

test.describe('the map, with a location to show', () => {
  test.use({
    geolocation: { latitude: 52.52, longitude: 13.405 },
    permissions: ['geolocation'],
  });

  // Permission already granted means no prompt to raise, so the marker
  // arrives with the map rather than waiting to be asked for.
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

  test('frames every pin again after zooming somewhere else', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await openMap(app);
    await expect(app.map.locators.pins).toHaveCount(3);

    await app.map.do.zoomToLocation();
    // Waited for, not assumed: that button awaits a position fix before it
    // moves the map, so framing sent straight after can land first and be
    // undone by the zoom arriving late.
    await expect(app.map.locators.pins.first()).not.toBeInViewport();

    await app.map.do.frameAllPins();

    // What framing promises: the pins are back on screen, not merely back
    // in the document after the zoom moved away from them.
    await expect(app.map.locators.pins).toHaveCount(3);
    await expect(app.map.locators.pins.first()).toBeInViewport();
  });
});
