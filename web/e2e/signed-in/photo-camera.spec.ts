import { expect, test } from './test';

import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { PHOTO, PHOTO_ARRIVES, uniqueName } from './helpers';
import { context, seededEntryId, storedObjects } from './rls/helpers';

test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });

test.describe('on a device with a mouse', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
  });

  test('only the file picker is offered, since no camera would open', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueName('Nur Dateien');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await expect(card.locators.uploadInput).toBeAttached();
      await expect(card.locators.cameraInput).toHaveCount(0);
    } finally {
      await removeEntriesTitled(title);
    }
  });
});

// A touch screen is what makes `capture` open a camera, so it is what offers the choice.
test.describe('on a touch device', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
  });

  test('an empty entry offers Take photo and Choose from files', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueName('Zweierlei');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await expect(card.locators.cameraInput).toHaveAttribute(
        'capture',
        'environment',
      );
      await expect(card.locators.uploadInput).not.toHaveAttribute('capture');
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('a photo taken with the camera is stored like a picked one', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    const title = uniqueName('Aufgenommen');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await seededEntryId({ token, ownerId: userId, title });

      await card.do.takePhoto(PHOTO);

      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });
      const stored = await storedObjects(token, `${userId}/${itemId}`);
      expect(stored).toHaveLength(2);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('the camera stays on offer once the entry has a photograph, to add the next', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueName('Noch eins');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.takePhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      await expect(card.locators.cameraInput).toBeAttached();
      await card.do.takePhoto(PHOTO);

      await expect(card.locators.images).toHaveCount(2, {
        timeout: PHOTO_ARRIVES,
      });
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
