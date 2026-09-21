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
});
