import { resolve } from 'node:path';

// Not './test': both cases here drive the app into `toast.reportError`,
// which logs to the console by design, and that spec's `quietConsole`
// fixture treats a console error as a failure.
import { expect, test } from '../coverage';

import { SEED } from './fixtures';
import { openCategory } from './helpers';

// The paths a collector only sees when something outside the app breaks:
// the geocoder being down, and an upload that does not arrive. Both are
// injected at the network boundary, so the app's own code runs for real.
test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });

type Page = import('@playwright/test').Page;

const PHOTO = resolve(process.cwd(), 'public/logo.png');
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

async function deleteEntry(page: Page, title: string) {
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await card.getByTestId('delete-entry').click();
  await page.getByTestId('confirm-accept').click();
  await expect(card).toHaveCount(0);
}

test.describe('when something outside the app fails', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, SEED.failureCategory);
  });

  // The geocoder is somebody else's service; the form has to stay usable
  // when it is down rather than blocking an entry that needs no lookup.
  test('a hand-typed place is still saved with the geocoder down', async ({
    page,
  }) => {
    await page.route('https://photon.komoot.io/**', (route) =>
      route.fulfill({ status: 503, body: '' }),
    );

    const title = uniqueTitle('Ohne Geocoder');
    try {
      await page.getByTestId('new-entry').click();
      await page.getByTestId('item-title').fill(title);

      const place = page.getByRole('combobox', { name: 'City (e.g. Cologne)' });
      await place.fill('Entenhausen');
      await expect(page.getByText('Place search failed.')).toBeVisible();

      await page.getByTestId('item-submit').click();
      const card = page.getByTestId('item-card').filter({ hasText: title });
      await expect(
        card.getByText('Entenhausen', { exact: true }),
      ).toBeVisible();
    } finally {
      await deleteEntry(page, title);
    }
  });

  // A photograph that never reaches storage must say so and leave the
  // entry alone, rather than showing a picture that is not there.
  test('a photograph that cannot be stored is reported, not pretended', async ({
    page,
  }) => {
    const title = uniqueTitle('Upload kaputt');
    try {
      await page.getByTestId('new-entry').click();
      await page.getByTestId('item-title').fill(title);
      await page.getByTestId('item-submit').click();

      const card = page.getByTestId('item-card').filter({ hasText: title });
      await expect(card).toBeVisible();

      await page.route('**/storage/v1/object/**', (route) =>
        route.fulfill({ status: 500, json: { message: 'nope' } }),
      );
      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);

      // Filtered, not bare: Next renders an empty route announcer that is
      // also an alert. What matters is that this message is one too, so it
      // is read out rather than quietly posted as a status.
      await expect(
        page.getByRole('alert').filter({ hasText: 'Could not upload this' }),
      ).toBeVisible();
      await expect(card.locator('img')).toHaveCount(0);
    } finally {
      await page.unroute('**/storage/v1/object/**');
      await deleteEntry(page, title);
    }
  });
});
