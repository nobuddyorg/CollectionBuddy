import { type Locator } from '@playwright/test';

import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import {
  itemPhoto,
  PHOTO,
  PHOTO_ARRIVES,
  tiltedCardPhoto,
  uniqueName,
} from './helpers';
import { context, seededEntryId, storedObjects } from './rls/helpers';
import type { PageTree } from '../pages';

// A rotation re-encodes and re-uploads for real, in the photo worker.
test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });

/** The shown photo as stored: its size, and how opaque its top-left corner is. */
async function storedShape(photo: Locator) {
  return photo.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const drawing = canvas.getContext('2d')!;
    drawing.drawImage(element, 0, 0);
    return {
      width: element.naturalWidth,
      height: element.naturalHeight,
      corner: drawing.getImageData(0, 0, 1, 1).data[3],
    };
  });
}

/** What the collector stored under one entry, both sizes of each photo. */
async function objectsOf(title: string) {
  const { token, userId } = context();
  const itemId = await seededEntryId({ token, ownerId: userId, title });
  const objects = await storedObjects(token, `${userId}/${itemId}`);
  return objects.map((object) => object.name);
}

async function photographed(app: PageTree, title: string, photos: string[]) {
  await app.catalogue.do.addEntry(title);
  const card = app.catalogue.card(title);
  for (const [index, photo] of photos.entries()) {
    await card.do.uploadPhoto(photo);
    await expect(card.locators.images).toHaveCount(index + 1, {
      timeout: PHOTO_ARRIVES,
    });
  }
  return card;
}

test.describe('rotating a stored photo', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.viewerCategory);
  });

  test('a quarter turn swaps its sides, replaces it in place and keeps it the cover', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Gedreht');
    try {
      const landscape = await itemPhoto(
        page,
        testInfo.outputPath('landscape.png'),
      );
      const card = await photographed(app, title, [landscape, PHOTO]);
      const before = await objectsOf(title);
      expect(before).toHaveLength(4);

      await card.do.openImage();
      await expect(app.viewer.locators.position).toHaveText('1 / 2');
      expect(await storedShape(app.viewer.locators.photo)).toMatchObject({
        width: 640,
        height: 480,
      });

      await app.viewer.do.rotate();
      await expectNoSeriousA11yViolations(page, testInfo);
      await app.viewer.do.rotateRight();
      await expect(app.viewer.locators.photo).toHaveCSS(
        'transform',
        // translate(-50%, -50%) rotate(90deg), as a matrix
        /^matrix\(0, 1, -1, 0, /,
      );
      await app.viewer.do.saveRotation();

      await expect(app.viewer.locators.position).toHaveText('1 / 2');
      expect(await storedShape(app.viewer.locators.photo)).toMatchObject({
        width: 480,
        height: 640,
      });
      // Both of the original's objects went; both of the turned one's came.
      const after = await objectsOf(title);
      expect(after).toHaveLength(4);
      expect(after.filter((name) => before.includes(name))).toHaveLength(2);

      // Still first, so still the cover, after a reload too.
      await page.reload({ waitUntil: 'networkidle' });
      await app.catalogue.card(title).do.openImage();
      await expect(app.viewer.locators.position).toHaveText('1 / 2');
      expect(await storedShape(app.viewer.locators.photo)).toMatchObject({
        width: 480,
        height: 640,
      });
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('a free angle, set by keyboard, crops an opaque photo to what stays covered', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Schräg');
    try {
      const landscape = await itemPhoto(
        page,
        testInfo.outputPath('landscape.png'),
      );
      const card = await photographed(app, title, [landscape]);
      await card.do.openImage();

      await app.viewer.do.rotate();
      await app.viewer.do.nudgeAngle(50);
      await expect(app.viewer.locators.rotation.angleValue).toHaveText('5°');
      await expect(app.viewer.locators.rotation.angle).toHaveAttribute(
        'aria-valuetext',
        '5°',
      );
      await app.viewer.do.saveRotation();

      // (640·cos5 − 480·sin5) / cos10 = 604.9, (480·cos5 − 640·sin5) / cos10 = 428.9
      const shape = await storedShape(app.viewer.locators.photo);
      expect(shape.width).toBeGreaterThanOrEqual(603);
      expect(shape.width).toBeLessThanOrEqual(605);
      expect(shape.height).toBeGreaterThanOrEqual(427);
      expect(shape.height).toBeLessThanOrEqual(429);
      expect(shape.corner).toBe(255);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('Straighten squares a tilted cut-out, keeping its corners see-through, and then has nothing left to offer', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const title = uniqueName('Begradigt');
    try {
      const tilted = await tiltedCardPhoto(page, {
        path: testInfo.outputPath('tilted.png'),
        tilt: 8,
      });
      const card = await photographed(app, title, [tilted]);
      await card.do.openImage();

      await app.viewer.do.rotate();
      await app.viewer.do.straighten();
      const angle = Number(
        await app.viewer.locators.rotation.angle.inputValue(),
      );
      expect(angle).toBeGreaterThan(-8.5);
      expect(angle).toBeLessThan(-7.5);
      await expect(app.viewer.locators.rotation.straighten).toBeDisabled();
      await app.viewer.do.saveRotation();

      // Kept whole: 640·cos8 + 480·sin8 = 700.6 by 640·sin8 + 480·cos8 = 564.4.
      const shape = await storedShape(app.viewer.locators.photo);
      expect(shape.width).toBeGreaterThanOrEqual(700);
      expect(shape.width).toBeLessThanOrEqual(702);
      expect(shape.height).toBeGreaterThanOrEqual(564);
      expect(shape.height).toBeLessThanOrEqual(566);
      expect(shape.corner).toBe(0);

      await app.viewer.do.rotate();
      // The photo is read before Save can be enabled; only then is there nothing to straighten.
      await app.viewer.do.rotateRight();
      await expect(app.viewer.locators.rotation.save).toBeEnabled();
      await expect(app.viewer.locators.rotation.straighten).toHaveCount(0);
      await app.viewer.do.cancelRotation();
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
      const landscape = await itemPhoto(
        page,
        testInfo.outputPath('landscape.png'),
      );
      const card = await photographed(app, title, [landscape]);
      const before = await objectsOf(title);
      await card.do.openImage();
      const original = await app.viewer.locators.photo.getAttribute('src');

      await app.viewer.do.rotate();
      await app.viewer.do.rotateLeft();
      await app.viewer.do.cancelRotation();
      await expect(app.viewer.locators.rotation.controls).toHaveCount(0);

      await app.viewer.do.rotate();
      await app.viewer.do.rotateLeft();
      await page.keyboard.press('Escape');
      await expect(app.viewer.locators.rotation.controls).toHaveCount(0);
      await expect(app.viewer()).toBeVisible();

      await expect(app.viewer.locators.photo).toHaveAttribute('src', original!);
      expect(await objectsOf(title)).toEqual(before);
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
