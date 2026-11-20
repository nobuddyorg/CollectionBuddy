import { type Locator } from '@playwright/test';

import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { itemPhoto, PHOTO_ARRIVES, uniqueName } from './helpers';
import { context, seededEntryId, storedObjects } from './rls/helpers';
import type { PageTree } from '../pages';

// A hand-drawn crop re-encodes and re-uploads for real, in the photo worker; no model is involved.
test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });

/** The shown photo's stored size. */
async function storedSize(photo: Locator) {
  return photo.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    return { width: element.naturalWidth, height: element.naturalHeight };
  });
}

/** What the collector stored under one entry, both sizes of each photo. */
async function objectsOf(title: string) {
  const { token, userId } = context();
  const itemId = await seededEntryId({ token, ownerId: userId, title });
  const objects = await storedObjects(token, `${userId}/${itemId}`);
  return objects.map((object) => object.name);
}

/** A new entry with one 640 × 480 photo, opened full size. */
async function openedPhoto(
  app: PageTree,
  { title, photo }: { title: string; photo: string },
) {
  await app.catalogue.do.addEntry(title);
  const card = app.catalogue.card(title);
  await card.do.uploadPhoto(photo);
  await expect(card.locators.images).toHaveCount(1, { timeout: PHOTO_ARRIVES });
  await card.do.openImage();
  expect(await storedSize(app.viewer.locators.photo)).toEqual({
    width: 640,
    height: 480,
  });
}

test.describe('cropping a stored photo by hand', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.viewerCategory);
  });

  test('a corner dragged and the frame nudged by keyboard crop it at the card’s 4:3, in its place', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Von Hand');
    try {
      await openedPhoto(app, {
        title,
        photo: await itemPhoto(page, testInfo.outputPath('landscape.png')),
      });
      const before = await objectsOf(title);

      await app.viewer.do.cropByHand();
      await expectNoSeriousA11yViolations(page, testInfo);
      await expect(app.viewer.locators.manualCrop.lock).toBeChecked();
      await app.viewer.do.dragCropCorner('bottom-right', { x: -120, y: -40 });
      await app.viewer.do.nudgeCropFrame('ArrowLeft', 2);
      await app.viewer.do.saveCropByHand();

      const after = await storedSize(app.viewer.locators.photo);
      expect(after.width).toBeLessThan(576);
      expect(Math.abs(after.width / after.height - 4 / 3)).toBeLessThan(0.01);
      // The original's two objects went; the crop's two came.
      const replaced = await objectsOf(title);
      expect(replaced).toHaveLength(2);
      expect(replaced.filter((name) => before.includes(name))).toEqual([]);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('with the 4:3 lock off, keeps any shape the frame is dragged to', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Frei');
    try {
      await openedPhoto(app, {
        title,
        photo: await itemPhoto(page, testInfo.outputPath('landscape.png')),
      });

      await app.viewer.do.cropByHand();
      await app.viewer.do.toggleCropLock();
      await expect(app.viewer.locators.manualCrop.lock).not.toBeChecked();
      await app.viewer.do.dragCropCorner('top-left', { x: 150, y: 0 });
      await app.viewer.do.saveCropByHand();

      const after = await storedSize(app.viewer.locators.photo);
      // Narrowed, not shortened: no longer the photo's 4:3.
      expect(after.height).toBe(432);
      expect(after.width).toBeLessThan(500);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('Cancel and Escape leave the photo as it was', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Unverändert');
    try {
      await openedPhoto(app, {
        title,
        photo: await itemPhoto(page, testInfo.outputPath('landscape.png')),
      });
      const before = await objectsOf(title);
      const shown = await app.viewer.locators.photo.getAttribute('src');

      await app.viewer.do.cropByHand();
      await app.viewer.do.dragCropCorner('bottom-right', { x: -100, y: -100 });
      await app.viewer.do.cancelCropByHand();
      await app.viewer.do.cropByHand();
      await page.keyboard.press('Escape');

      await expect(app.viewer.locators.manualCrop.view).toHaveCount(0);
      await expect(app.viewer.locators.photo).toHaveAttribute('src', shown!);
      expect(await objectsOf(title)).toEqual(before);
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
