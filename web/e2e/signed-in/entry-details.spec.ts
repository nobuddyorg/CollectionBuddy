import { expect, test } from './test';

import { SEED } from './fixtures';
// The geocoder is always faked; what is real is that its coordinates survive the round trip to Postgres.
test.use({ locale: 'en-GB' });

type Page = import('@playwright/test').Page;

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

/** One hit, shaped the way Photon answers, with coordinates to keep. */
const BREMEN = {
  features: [
    {
      properties: {
        osm_id: 424432,
        city: 'Bremen',
        state: 'Bremen',
        country: 'Germany',
      },
      geometry: { type: 'Point', coordinates: [8.8017, 53.0793] },
    },
  ],
};

async function fakeGeocoder(page: Page) {
  await page.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({ json: BREMEN }),
  );
}

test.describe('an entry with a place and tags', () => {
  test.beforeEach(async ({ on, page }) => {
    await fakeGeocoder(page);
    await on(page).categories.do.open(SEED.detailCategory);
  });

  test('is filled in through the form and keeps what was picked', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Beschriftet');
    try {
      await app.catalogue.do.openEntryForm();
      await app.form.do.fill({ title });

      await app.form.do.pickPlace('Bremen');
      // The picked option's label, not the typed text, is what is stored.
      await expect(app.form.locators.inputs.place).toHaveValue(
        'Bremen, Germany',
      );

      await app.form.do.addTag('hansestadt');
      await app.form.do.addTag('weserstadt', ',');
      // The same tag twice is refused rather than duplicated.
      await app.form.do.addTag('hansestadt');
      await expect(app.form.tag('hansestadt')).toHaveCount(1);

      await app.form.do.removeTag('weserstadt');
      await expect(app.form.tag('weserstadt')).toHaveCount(0);

      await app.form.do.submit();

      const card = app.catalogue.card(title);
      await expect(card.locators.place).toHaveText('Bremen, Germany');
      await expect(card.locators.tags).toHaveText(['hansestadt']);

      // Only a real database can show the coordinates were stored, not just the name beside them.
      await app.map.do.open();
      await expect(app.map.locators.pins).toHaveCount(1);
    } finally {
      await page.keyboard.press('Escape');
      await app.catalogue.do.removeEntry(title);
    }
  });

  test('drops a tag with Backspace when the field is empty', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Rückwärts');
    try {
      await app.catalogue.do.openEntryForm();
      await app.form.do.fill({ title });

      await app.form.do.addTag('vorher');
      await expect(app.form.tag('vorher')).toHaveCount(1);

      await app.form.do.removeLastTag();
      await expect(app.form.tag('vorher')).toHaveCount(0);

      await app.form.do.submit();
      await expect(app.catalogue.card(title).locators.tags).toHaveCount(0);
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });

  // Every dismissal of the form routes through one guard, so a stray tap cannot lose an edit.
  test('asks before throwing away a half-written entry', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.catalogue.do.openEntryForm();
    await app.form.do.fill({ title: 'Halb getippt' });

    await page.keyboard.press('Escape');
    await expect(app.confirm.locators.message).toContainText(
      'Discard your changes?',
    );

    await app.confirm.do.cancel();
    await expect(app.form.locators.inputs.title).toHaveValue('Halb getippt');

    await page.keyboard.press('Escape');
    await app.confirm.do.accept();
    await expect(app.form.locators.inputs.title).toHaveCount(0);
  });

  // The edit modal is the one caller with a Cancel button, and it goes through the same guard.
  test('leaves an entry alone when an edit is cancelled', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Unverändert');
    try {
      await app.catalogue.do.addEntry(title);

      await app.catalogue.card(title).do.edit();
      await app.form.do.pickPlace('Bremen');

      await app.form.do.cancel();
      await app.confirm.do.accept();

      await expect(app.form.locators.inputs.title).toHaveCount(0);
      await expect(app.catalogue.card(title).locators.place).toHaveCount(0);
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });
});
