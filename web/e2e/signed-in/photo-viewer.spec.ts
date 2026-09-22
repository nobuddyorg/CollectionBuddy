import { resolve } from 'node:path';

import { expect, test } from './test';

import { SEED } from './fixtures';
// photos.spec.ts proves a photograph is stored and drawn; this is what a
// collector does with it afterwards -- opening it full size and walking a
// carousel that only exists once two are attached.
test.use({ locale: 'en-GB' });

// Two real uploads before the first assertion, same as photos.spec.ts.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

const PHOTO = resolve(process.cwd(), 'public/logo.png');
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('looking at a photograph full size', () => {
  test('opens, walks both ways between two, and closes on Escape', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueTitle('Angeschaut');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, { timeout: ARRIVES });
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(2, { timeout: ARRIVES });

      await card.do.openImage();
      await expect(app.viewer()).toBeVisible();
      await expect(app.viewer.locators.position).toHaveText('1 / 2');

      // Arrow keys and the buttons drive the same carousel.
      await page.keyboard.press('ArrowRight');
      await expect(app.viewer.locators.position).toHaveText('2 / 2');
      await app.viewer.do.previous();
      await expect(app.viewer.locators.position).toHaveText('1 / 2');

      await page.keyboard.press('Escape');
      await expect(app.viewer()).toHaveCount(0);
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });

  // A card signs only the photographs it can show (hero and a strip of four);
  // the rest are signed once the carousel opens (#630).
  test('shows a photograph past the card once the carousel reaches it', async ({
    on,
    page,
  }) => {
    test.setTimeout(240_000);
    const app = on(page);
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueTitle('Sechsfach');
    try {
      await app.catalogue.do.addEntry(title);
      // Past five the card shows no more plates, so each upload is awaited
      // by the photograph row it ends with rather than by the grid.
      for (let upload = 0; upload < 6; upload++) {
        const recorded = page.waitForResponse(
          (response) =>
            response.url().includes('/rest/v1/images') &&
            response.request().method() === 'POST',
          { timeout: ARRIVES },
        );
        await app.catalogue.card(title).do.uploadPhoto(PHOTO);
        expect((await recorded).ok()).toBe(true);
      }

      // A fresh page read, so nothing past the card is signed yet.
      await app.categories.do.open(SEED.viewerCategory);
      const card = app.catalogue.card(title);
      await expect(card.locators.images).toHaveCount(5, { timeout: ARRIVES });

      await card.do.openImage();
      for (let step = 0; step < 5; step++)
        await page.keyboard.press('ArrowRight');
      await expect(app.viewer.locators.position).toHaveText('6 / 6');
      await expect(app.viewer.locators.photo).toHaveAttribute(
        'src',
        /\/object\/sign\//,
      );

      await page.keyboard.press('Escape');
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });
});
