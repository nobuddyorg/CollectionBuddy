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

// Hand-typed places carry no coordinates, so the map looks each one up and
// draws its pin as that answer lands: pins arrive one place at a time.
const LOOKED_UP: Record<string, [number, number]> = {
  Aachen: [6.0839, 50.7753],
  Bonn: [7.0982, 50.7374],
  Dresden: [13.7373, 51.0504],
};

test.describe('a map whose places are still being looked up', () => {
  test('ends with exactly one pin per place as the lookups land', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const name = `E2E Landkarte ${Date.now()}`;
    // No suggestions while typing, so each place is stored as typed.
    await page.route('https://photon.komoot.io/**', (route) =>
      route.fulfill({ json: { features: [] } }),
    );

    await page.goto('', { waitUntil: 'networkidle' });
    await expect(app.categories.locators.selected).not.toBeEmpty();
    await app.categories.do.create(name);
    try {
      for (const place of Object.keys(LOOKED_UP)) {
        const title = `Fund in ${place}`;
        await app.catalogue.do.openEntryForm();
        await app.form.do.fill({ title });
        await app.form.locators.inputs.place.fill(place);
        await app.form.do.submit();
        await expect(app.catalogue.card(title).locators.place).toHaveText(
          place,
        );
      }

      await page.unroute('https://photon.komoot.io/**');
      await page.route('https://photon.komoot.io/**', (route) => {
        const q = new URL(route.request().url()).searchParams.get('q') ?? '';
        const coordinates = LOOKED_UP[q];
        return route.fulfill({
          json: {
            features: coordinates
              ? [
                  {
                    properties: { name: q },
                    geometry: { type: 'Point', coordinates },
                  },
                ]
              : [],
          },
        });
      });

      await app.map.do.open();
      await expect(app.map.locators.pins).toHaveCount(3);
    } finally {
      await page.keyboard.press('Escape');
      await app.categories.do.delete();
      await app.confirm.do.accept();
    }
  });
});
