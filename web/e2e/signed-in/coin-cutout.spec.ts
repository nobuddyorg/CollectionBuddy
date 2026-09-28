import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Page } from '@playwright/test';

import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import type { PageTree } from '../pages';

// The cut-out runs for real, in its worker on the real runtime; only the 87 MB model is swapped for a stand-in.
test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

const MODEL = '**/models/isnet-general-use-fp16.onnx';
// ISNet's input and output, predicting just the photo's red channel: 231 bytes, built with onnx.helper (one Slice node).
const RED_CHANNEL_MODEL = readFileSync(
  resolve(process.cwd(), 'e2e/fixtures/red-channel.onnx'),
);
const PHOTO = resolve(process.cwd(), 'public/logo.png');

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

/** A red coin on a dark table, drawn by the browser: the stand-in model sees exactly the coin. */
async function coinPhoto(page: Page, path: string): Promise<string> {
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

async function turnOnCoinCutout(app: PageTree, page: Page) {
  await app.account.do.open();
  await app.account.do.toggleCoinCutout();
  await expect(app.account.locators.coinCutout.toggle).toBeChecked();
  await page.keyboard.press('Escape');
}

test.describe('coin cut-out', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
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
    const title = uniqueTitle('Ohne Freistellung');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);

      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
      await expect(app.coinCutout()).toHaveCount(0);
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
    await turnOnCoinCutout(app, page);
    const title = uniqueTitle('Freigestellt');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(
        await coinPhoto(page, testInfo.outputPath('coin.png')),
      );

      const review = app.coinCutout;
      await expect(review.locators.original).toBeVisible();
      await expect(review.locators.cutout).toBeVisible({ timeout: ARRIVES });
      await expect(review.locators.buttons.useCutout).toBeEnabled();
      await expectNoSeriousA11yViolations(page, testInfo);
      await review.do.useCutout();

      await expect(review()).toHaveCount(0);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
      // Cropped to the coin, so the stored photo's corner lies outside it: see-through, not white.
      const cornerAlpha = await card.locators.images.evaluate(
        async (image: HTMLImageElement) => {
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, 1, 1).data[3];
        },
      );
      expect(cornerAlpha).toBe(0);
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
    await turnOnCoinCutout(app, page);
    const title = uniqueTitle('Original');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(
        await coinPhoto(page, testInfo.outputPath('coin.png')),
      );
      await expect(app.coinCutout.locators.buttons.keepOriginal).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(app.coinCutout()).toHaveCount(0);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('downloads the model ahead of time only when asked to', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    const requests = await serveStandInModel(page);

    await turnOnCoinCutout(app, page);
    await app.account.do.open();
    expect(requests).toEqual([]);
    await expectNoSeriousA11yViolations(page, testInfo);

    await app.account.do.downloadCoinModel();

    await expect(app.account.locators.coinCutout.progress).toHaveText(
      'Model downloaded',
    );
    expect(requests).toHaveLength(1);
  });
});
