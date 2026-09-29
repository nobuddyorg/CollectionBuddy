import { expect, test } from './test';

import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { PHOTO, PHOTO_ARRIVES, uniqueName } from './helpers';
import { apiAs, context, seededEntryId } from './rls/helpers';
// photos.spec.ts proves a photograph is stored; this opens it full size and walks the carousel.
test.use({ locale: 'en-GB' });

// Two real uploads before the first assertion, same as photos.spec.ts.
test.describe.configure({ timeout: 120_000 });

async function photoCount(token: string, itemId: string) {
  const { count, error } = await apiAs(token)
    .from('images')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', itemId);
  if (error) throw error;
  return count ?? 0;
}

test.describe('looking at a photograph full size', () => {
  test('opens, walks both ways between two, and closes on Escape', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueName('Angeschaut');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, {
        timeout: PHOTO_ARRIVES,
      });
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(2, {
        timeout: PHOTO_ARRIVES,
      });

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
      await removeEntriesTitled(title);
    }
  });

  // #785: the keyboard belonged to every open dialog, so Escape on the confirm closed the viewer too.
  test('a confirmation raised from it takes Escape and the arrows, and it stays open', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueName('Gestapelt');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, {
        timeout: PHOTO_ARRIVES,
      });
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(2, {
        timeout: PHOTO_ARRIVES,
      });

      await card.do.openImage();
      await app.viewer.do.deleteImage();
      await expect(app.confirm()).toBeVisible();

      // The photograph behind the question must stay the one it asks about.
      await page.keyboard.press('ArrowRight');
      await expect(app.viewer.locators.position).toHaveText('1 / 2');

      await page.keyboard.press('Escape');
      await expect(app.confirm()).toHaveCount(0);
      await expect(app.viewer()).toBeVisible();
      await expect(app.viewer.locators.position).toHaveText('1 / 2');

      await page.keyboard.press('Escape');
      await expect(app.viewer()).toHaveCount(0);
      await expect(card.locators.images).toHaveCount(2);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // #785: hidden with its last photograph, the viewer used to pop back open once Undo brought it back.
  test('closes for good once its only photograph is deleted, Undo included', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueName('Einzelstück');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, {
        timeout: PHOTO_ARRIVES,
      });

      await card.do.openImage();
      await app.viewer.do.deleteImage();
      await app.confirm.do.accept();
      await expect(app.viewer()).toHaveCount(0);
      await expect(card.locators.images).toHaveCount(0);

      await app.toast.do.undo();
      await expect(card.locators.images).toHaveCount(1);
      await expect(app.viewer()).toHaveCount(0);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // A card signs only the five photographs it shows; the rest are signed once the carousel opens.
  test('shows a photograph past the card once the carousel reaches it', async ({
    on,
    page,
  }) => {
    test.setTimeout(240_000);
    const app = on(page);
    const { token, userId } = context();
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueName('Sechsfach');
    try {
      await app.catalogue.do.addEntry(title);
      // Past five the card shows no more plates, so each upload is awaited by its photograph row instead.
      const itemId = await seededEntryId({ token, ownerId: userId, title });
      for (let upload = 1; upload <= 6; upload++) {
        // The control stays disabled until the card has shown the last one.
        await expect(
          app.catalogue.card(title).locators.uploadInput,
        ).toBeEnabled({ timeout: PHOTO_ARRIVES });
        await app.catalogue.card(title).do.uploadPhoto(PHOTO);
        await expect
          .poll(() => photoCount(token, itemId), { timeout: PHOTO_ARRIVES })
          .toBe(upload);
      }

      // A fresh page read, so nothing past the card is signed yet.
      await app.categories.do.open(SEED.viewerCategory);
      const card = app.catalogue.card(title);
      await expect(card.locators.images).toHaveCount(5, {
        timeout: PHOTO_ARRIVES,
      });

      await card.do.openImage();
      for (let step = 0; step < 5; step++)
        await page.keyboard.press('ArrowRight');
      await expect(app.viewer.locators.position).toHaveText('6 / 6');
      await expect(app.viewer.locators.photo).toHaveAttribute(
        'src',
        /\/object\/sign\//,
      );
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
