import { expect, test } from './test';

import { SEED } from './fixtures';
import { openCategory } from './helpers';

// Everything on an entry besides its title: the tag chips and the place
// autocomplete, filled in through the real form. The geocoder is a third
// party and is always faked (TEST_STRATEGY.md §6); what is real here is
// that the coordinates it hands back survive the round trip to Postgres,
// which the map at the end is what proves.
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

async function deleteEntry(page: Page, title: string) {
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await card.getByTestId('delete-entry').click();
  await page.getByTestId('confirm-accept').click();
  await expect(card).toHaveCount(0);
}

test.describe('an entry with a place and tags', () => {
  test.beforeEach(async ({ page }) => {
    await fakeGeocoder(page);
    await openCategory(page, SEED.detailCategory);
  });

  test('is filled in through the form and keeps what was picked', async ({
    page,
  }) => {
    const title = uniqueTitle('Beschriftet');
    try {
      await page.getByTestId('new-entry').click();
      await page.getByTestId('item-title').fill(title);

      const place = page.getByRole('combobox', { name: 'City (e.g. Cologne)' });
      await place.fill('Bremen');
      // The picked option's label, not the typed text, is what is stored.
      await page.getByRole('option').first().click();
      await expect(place).toHaveValue('Bremen, Germany');

      const tags = page.getByRole('textbox', {
        name: 'Enter tags… (Enter/Comma)',
      });
      await tags.fill('hansestadt');
      await tags.press('Enter');
      await tags.fill('weserstadt');
      await tags.press(',');
      // The same tag twice is refused rather than duplicated.
      await tags.fill('hansestadt');
      await tags.press('Enter');
      await expect(page.getByLabel('Remove tag hansestadt')).toHaveCount(1);

      await page.getByLabel('Remove tag weserstadt').click();
      await expect(page.getByLabel('Remove tag weserstadt')).toHaveCount(0);

      await page.getByTestId('item-submit').click();

      const card = page.getByTestId('item-card').filter({ hasText: title });
      await expect(card.getByText('Bremen, Germany')).toBeVisible();
      await expect(card.getByText('hansestadt', { exact: true })).toBeVisible();
      await expect(card.getByText('weserstadt')).toHaveCount(0);

      // The one assertion only a real database can make: the coordinates
      // the geocoder returned were stored, not just the name beside them.
      await page.getByTestId('open-map').click();
      await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
    } finally {
      await page.keyboard.press('Escape');
      await deleteEntry(page, title);
    }
  });

  test('drops a tag with Backspace when the field is empty', async ({
    page,
  }) => {
    const title = uniqueTitle('Rückwärts');
    try {
      await page.getByTestId('new-entry').click();
      await page.getByTestId('item-title').fill(title);

      const tags = page.getByRole('textbox', {
        name: 'Enter tags… (Enter/Comma)',
      });
      await tags.fill('vorher');
      await tags.press('Enter');
      await expect(page.getByLabel('Remove tag vorher')).toHaveCount(1);

      await tags.press('Backspace');
      await expect(page.getByLabel('Remove tag vorher')).toHaveCount(0);

      await page.getByTestId('item-submit').click();
      const card = page.getByTestId('item-card').filter({ hasText: title });
      await expect(card.getByText('vorher')).toHaveCount(0);
    } finally {
      await deleteEntry(page, title);
    }
  });

  // Every dismissal of the form routes through one guard, so a stray tap
  // cannot lose an edit more easily than pressing Cancel would.
  test('asks before throwing away a half-written entry', async ({ page }) => {
    await page.getByTestId('new-entry').click();
    await page.getByTestId('item-title').fill('Halb getippt');

    await page.keyboard.press('Escape');
    await expect(page.getByText('Discard your changes?')).toBeVisible();

    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('item-title')).toHaveValue('Halb getippt');

    await page.keyboard.press('Escape');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('item-title')).toHaveCount(0);
  });
});
