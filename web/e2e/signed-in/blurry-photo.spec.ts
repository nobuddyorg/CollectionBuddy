import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { PHOTO, PHOTO_ARRIVES, blurryPhoto, uniqueName } from './helpers';
import { context, seededEntryId, storedObjects } from './rls/helpers';

// The check runs for real, in the photo worker; only the photo is drawn blurry on purpose.
test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });

test.describe('a blurry photo', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
  });

  test('is shown with a warning before it uploads, and is stored once kept anyway', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Verwackelt');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(
        await blurryPhoto(page, testInfo.outputPath('blurry.png')),
      );

      const review = app.blurReview;
      await expect(review.locators.warning).toBeVisible();
      await expect(review.locators.preview).toBeVisible();
      await expect(review.locators.buttons.keep).toBeFocused();
      await expect(card.locators.images).toHaveCount(0);
      await expectNoSeriousA11yViolations(page, testInfo);

      await review.do.keep();

      await expect(review()).toHaveCount(0);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('stores nothing once skipped', async ({ on, page }, testInfo) => {
    const app = on(page);
    const { token, userId } = context();
    const title = uniqueName('Übersprungen');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await seededEntryId({ token, ownerId: userId, title });
      await card.do.uploadPhoto(
        await blurryPhoto(page, testInfo.outputPath('blurry.png')),
      );

      await app.blurReview.do.skip();

      await expect(app.blurReview()).toHaveCount(0);
      await expect(card.locators.images).toHaveCount(0);
      expect(await storedObjects(token, `${userId}/${itemId}`)).toEqual([]);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('does not hold up the sharp photos picked with it', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Gemischt');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto([
        PHOTO,
        await blurryPhoto(page, testInfo.outputPath('blurry.png')),
      ]);
      await app.blurReview.do.skip();

      await expect(card.locators.images).toHaveCount(1, {
        timeout: PHOTO_ARRIVES,
      });
      await expect(app.blurReview()).toHaveCount(0);
    } finally {
      await removeEntriesTitled(title);
    }
  });
});

test.describe('a sharp photo', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
  });

  test('uploads with no question asked', async ({ on, page }) => {
    const app = on(page);
    const title = uniqueName('Scharf');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);

      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });
      await expect(app.blurReview()).toHaveCount(0);
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
