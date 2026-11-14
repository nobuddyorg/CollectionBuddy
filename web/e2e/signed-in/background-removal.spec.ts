import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Locator, type Page } from '@playwright/test';

import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
import { themeAttribute } from '../helpers';
import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { blurryPhoto, uniqueName } from './helpers';
import { context, seededEntryId, storedObjects } from './rls/helpers';
import type { PageTree } from '../pages';

// Background removal runs for real, in its worker on the real runtime; only the 87 MB model is swapped for a stand-in.
test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

const MODEL = '**/models/isnet-general-use-fp16.onnx';
// ISNet's input and output, predicting just the photo's red channel: 231 bytes, built with onnx.helper (one Slice node).
const RED_CHANNEL_MODEL = readFileSync(
  resolve(process.cwd(), 'e2e/fixtures/red-channel.onnx'),
);
const PHOTO = resolve(process.cwd(), 'public/logo.png');
const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';
const NO_BACKDROP = 'rgba(0, 0, 0, 0)';

/** A red disc on a dark table, drawn by the browser: the stand-in model sees exactly the disc. */
async function itemPhoto(page: Page, path: string): Promise<string> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#202020';
    context.fillRect(0, 0, 640, 480);
    context.fillStyle = '#ff2000';
    context.beginPath();
    context.arc(320, 240, 150, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png');
  });
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return path;
}

/** A stored photo as drawn: its size, and how opaque the middle of its top, right, bottom and left edges is. */
async function edgesOf(image: Locator) {
  return image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const { naturalWidth: width, naturalHeight: height } = element;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.drawImage(element, 0, 0);
    const alphaAt = (x: number, y: number) =>
      context.getImageData(x, y, 1, 1).data[3];
    const [midX, midY] = [Math.floor(width / 2), Math.floor(height / 2)];
    return {
      width,
      height,
      edges: [
        alphaAt(midX, 0),
        alphaAt(width - 1, midY),
        alphaAt(midX, height - 1),
        alphaAt(0, midY),
      ],
    };
  });
}

/** Every request for the model, served from the stand-in. */
async function serveStandInModel(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.context().route(MODEL, (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      body: RED_CHANNEL_MODEL,
      contentType: 'application/octet-stream',
    });
  });
  return requests;
}

async function turnOnBackgroundRemoval(app: PageTree, page: Page) {
  await app.account.do.open();
  await app.account.do.toggleBackgroundRemoval();
  await expect(app.account.locators.backgroundRemoval.toggle).toBeChecked();
  await page.keyboard.press('Escape');
}

test.describe('background removal', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
  });

  test('keeps its explanation behind the info button in the account menu', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.account.do.open();
    const { hint } = app.account.locators.backgroundRemoval;

    await expect(hint).toBeHidden();
    await app.account.do.toggleBackgroundRemovalHint();
    await expect(hint).toBeVisible();
    await app.account.do.toggleBackgroundRemovalHint();
    await expect(hint).toBeHidden();
  });

  test('is off by default: a photo uploads as before, and nothing of the model loads', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const fetched: string[] = [];
    page.context().on('request', (request) => {
      if (/\/models\/|ort-wasm/.test(request.url()))
        fetched.push(request.url());
    });
    const title = uniqueName('Mit Hintergrund');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);

      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
      await expect(app.backgroundRemoval()).toHaveCount(0);
      expect(fetched).toEqual([]);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('shows the cut-out beside the original and stores the accepted one with a transparent background', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    await turnOnBackgroundRemoval(app, page);
    const title = uniqueName('Ohne Hintergrund');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(
        await itemPhoto(page, testInfo.outputPath('item.png')),
      );

      const review = app.backgroundRemoval;
      await expect(review.locators.original).toBeVisible();
      await expect(review.locators.cutout).toBeVisible({ timeout: ARRIVES });
      await expect(review.locators.buttons.useCutout).toBeEnabled();
      await expectNoSeriousA11yViolations(page, testInfo);
      await review.do.useCutout();

      await expect(review()).toHaveCount(0);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
      // A clear margin round the disc: the middle of every edge, where a tight crop would touch it, is see-through, not white.
      expect((await edgesOf(card.locators.images)).edges).toEqual([0, 0, 0, 0]);

      // On the theme's own surface by default; on the chosen colour, in either theme, once one is chosen.
      await expect(card.locators.images).toHaveCSS(
        'background-color',
        NO_BACKDROP,
      );
      for (const [backdrop, colour] of [
        ['black', BLACK],
        ['white', WHITE],
      ] as const) {
        await app.account.do.open();
        await app.account.do.choosePhotoBackdrop(backdrop);
        await page.keyboard.press('Escape');
        for (const colorScheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme });
          await expect.poll(() => themeAttribute(page)).toBe(colorScheme);
          await expect(card.locators.images).toHaveCSS(
            'background-color',
            colour,
          );
        }
      }
      await card.do.openImage();
      await expect(app.viewer.locators.photo).toHaveCSS(
        'background-color',
        WHITE,
      );
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('keeps the original when that is chosen, cut-out or not', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    await turnOnBackgroundRemoval(app, page);
    const title = uniqueName('Original');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(
        await itemPhoto(page, testInfo.outputPath('item.png')),
      );
      await expect(
        app.backgroundRemoval.locators.buttons.keepOriginal,
      ).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(app.backgroundRemoval()).toHaveCount(0);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('reviews several photos one after the other, then uploads each as decided', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    await turnOnBackgroundRemoval(app, page);
    const title = uniqueName('Mehrere Fotos');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto([
        await itemPhoto(page, testInfo.outputPath('first.png')),
        await itemPhoto(page, testInfo.outputPath('second.png')),
      ]);

      const review = app.backgroundRemoval;
      await expect(review.locators.progress).toHaveText('Photo 1 of 2');
      await expect(review.locators.cutout).toBeVisible({ timeout: ARRIVES });
      await review.do.useCutout();

      await expect(review.locators.progress).toHaveText('Photo 2 of 2');
      await expect(review.locators.cutout).toBeVisible({ timeout: ARRIVES });
      await review.do.keepOriginal();

      await expect(review()).toHaveCount(0);
      await expect(card.locators.images).toHaveCount(2, { timeout: ARRIVES });
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('closing the review drops the photos still waiting', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    await turnOnBackgroundRemoval(app, page);
    const title = uniqueName('Abgebrochen');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto([
        await itemPhoto(page, testInfo.outputPath('first.png')),
        await itemPhoto(page, testInfo.outputPath('second.png')),
      ]);
      await expect(app.backgroundRemoval.locators.progress).toHaveText(
        'Photo 1 of 2',
      );

      await app.backgroundRemoval.do.cancel();

      await expect(app.backgroundRemoval()).toHaveCount(0);
      await expect(card.locators.images).toHaveCount(0);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('warns about a blurry photo in the review too, and stores nothing once it is skipped', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    await turnOnBackgroundRemoval(app, page);
    const title = uniqueName('Unscharf mit Freisteller');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(
        await blurryPhoto(page, testInfo.outputPath('blurry.png')),
      );

      const review = app.backgroundRemoval;
      await expect(review.locators.blurWarning).toBeVisible({
        timeout: ARRIVES,
      });
      await review.do.skip();

      await expect(review()).toHaveCount(0);
      await expect(card.locators.images).toHaveCount(0);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('removes the background of a photo already stored, and keeps it where it was', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    const { token, userId } = context();
    const title = uniqueName('Nachträglich');
    // A stored object's name, from a signed URL: its uuid base is the same for both sizes.
    const baseOf = (url: string | null) =>
      new URL(url!).pathname.split('/').pop()!.split('.')[0];
    const storedBases = async (itemId: string) =>
      (await storedObjects(token, `${userId}/${itemId}`)).map(
        (object) => object.name.split('.')[0],
      );
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await seededEntryId({ token, ownerId: userId, title });
      await card.do.uploadPhoto([
        await itemPhoto(page, testInfo.outputPath('item.png')),
        PHOTO,
      ]);
      await expect(card.locators.images).toHaveCount(2, { timeout: ARRIVES });
      const cover = baseOf(
        await card.locators.images.first().getAttribute('src'),
      );
      const second = baseOf(
        await card.locators.images.nth(1).getAttribute('src'),
      );

      await turnOnBackgroundRemoval(app, page);
      await card.do.openImage();
      await app.viewer.do.removeBackground();
      await expect(app.viewer()).toHaveCount(0);
      const review = app.backgroundRemoval;
      await expect(review.locators.cutout).toBeVisible({ timeout: ARRIVES });
      await review.do.useCutout();
      await expect(review()).toHaveCount(0);

      // The old pair gone, a new pair in its stead, the second photo untouched.
      await expect
        .poll(() => storedBases(itemId), { timeout: ARRIVES })
        .not.toContain(cover);
      const bases = await storedBases(itemId);
      expect(bases).toHaveLength(4);
      expect(bases).toContain(second);
      // Still the cover, now the cut-out; still second, the photo that was.
      await expect(card.locators.images).toHaveCount(2);
      await expect
        .poll(async () =>
          baseOf(await card.locators.images.first().getAttribute('src')),
        )
        .not.toBe(cover);
      expect(
        baseOf(await card.locators.images.nth(1).getAttribute('src')),
      ).toBe(second);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // Turbopack boots every worker from one script whose URL fragment Chrome reuses, so the first photo job must not decide the next.
  test('cut out again, a stored cut-out keeps its outline and its size: the margin is not doubled, nothing is eaten', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    await turnOnBackgroundRemoval(app, page);
    const title = uniqueName('Zweimal freigestellt');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto(
        await itemPhoto(page, testInfo.outputPath('item.png')),
      );
      await expect(app.backgroundRemoval.locators.cutout).toBeVisible({
        timeout: ARRIVES,
      });
      await app.backgroundRemoval.do.useCutout();
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
      await card.do.openImage();
      const once = await edgesOf(app.viewer.locators.photo);
      const firstSrc = await app.viewer.locators.photo.getAttribute('src');

      await app.viewer.do.removeBackground();
      await expect(app.backgroundRemoval.locators.cutout).toBeVisible({
        timeout: ARRIVES,
      });
      await app.backgroundRemoval.do.useCutout();
      await expect(app.backgroundRemoval()).toHaveCount(0);
      await expect
        .poll(() => card.locators.images.getAttribute('src'), {
          timeout: ARRIVES,
        })
        .not.toBe(firstSrc);
      await card.do.openImage();
      const twice = await edgesOf(app.viewer.locators.photo);

      expect(twice.edges).toEqual([0, 0, 0, 0]);
      // Re-encoding may move the faint rim by a pixel; a doubled margin or an eaten edge moves it by dozens.
      expect(Math.abs(twice.width - once.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(twice.height - once.height)).toBeLessThanOrEqual(2);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('still cuts out a photo after a plain upload in the same page', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await serveStandInModel(page);
    const plainTitle = uniqueName('Erst mit Hintergrund');
    const cutoutTitle = uniqueName('Dann ohne Hintergrund');
    try {
      await app.catalogue.do.addEntry(plainTitle);
      const plainCard = app.catalogue.card(plainTitle);
      await plainCard.do.uploadPhoto(PHOTO);
      await expect(plainCard.locators.images).toBeVisible({ timeout: ARRIVES });

      await turnOnBackgroundRemoval(app, page);
      await app.catalogue.do.addEntry(cutoutTitle);
      const cutoutCard = app.catalogue.card(cutoutTitle);
      await cutoutCard.do.uploadPhoto(
        await itemPhoto(page, testInfo.outputPath('item.png')),
      );

      const review = app.backgroundRemoval;
      await expect(review.locators.cutout).toBeVisible({ timeout: ARRIVES });
      await review.do.useCutout();

      await expect(review()).toHaveCount(0);
      await expect(cutoutCard.locators.images).toBeVisible({
        timeout: ARRIVES,
      });
    } finally {
      await removeEntriesTitled(plainTitle);
      await removeEntriesTitled(cutoutTitle);
    }
  });

  test('downloads the model ahead of time only when asked to', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const requests = await serveStandInModel(page);

    await turnOnBackgroundRemoval(app, page);
    await app.account.do.open();
    expect(requests).toEqual([]);
    // Off the account button, whose hover state is outside this feature; cards measured mid-fade read as a false positive.
    await page.mouse.move(0, 0);
    await expect(app.catalogue.locators.cards.first()).toHaveCSS(
      'opacity',
      '1',
    );
    await expectNoSeriousA11yViolations(page, testInfo);

    await app.account.do.downloadModel();

    await expect(app.account.locators.backgroundRemoval.progress).toHaveText(
      'Model downloaded',
    );
    expect(requests).toHaveLength(1);
  });

  // The ready state lives in page memory; the model itself lives in Cache Storage, which a reload keeps.
  test('still knows the model is downloaded after a reload', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const requests = await serveStandInModel(page);
    await turnOnBackgroundRemoval(app, page);
    await app.account.do.open();
    await app.account.do.downloadModel();
    await expect(app.account.locators.backgroundRemoval.progress).toHaveText(
      'Model downloaded',
    );

    await page.reload();
    await app.account.do.open();

    await expect(app.account.locators.backgroundRemoval.progress).toHaveText(
      'Model downloaded',
    );
    await expect(app.account.locators.backgroundRemoval.download).toHaveCount(
      0,
    );
    expect(requests).toHaveLength(1);
  });
});
