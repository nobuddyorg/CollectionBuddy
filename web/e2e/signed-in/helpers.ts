import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, type Page } from '@playwright/test';

import { createPageTree } from '../pages';

export const uniqueName = (what: string) => `${what} ${Date.now()}`;

// A real photograph: the compressor decodes what it is given, and a canvas cannot draw a fake PNG.
export const PHOTO = resolve(process.cwd(), 'public/logo.png');

// A second real image, for a pick of more than one.
export const OTHER_PHOTO = resolve(process.cwd(), 'public/icon-192-v2.png');

/** Shapes and text drawn by the browser, then blurred 4 px: well under the blur threshold, as a defocused photo is. */
export async function blurryPhoto(page: Page, path: string): Promise<string> {
  const dataUrl = await page.evaluate(() => {
    const sharp = document.createElement('canvas');
    sharp.width = 640;
    sharp.height = 480;
    const drawing = sharp.getContext('2d')!;
    drawing.fillStyle = '#e8e0d0';
    drawing.fillRect(0, 0, 640, 480);
    drawing.fillStyle = '#8a5a20';
    drawing.beginPath();
    drawing.arc(320, 240, 150, 0, Math.PI * 2);
    drawing.fill();
    drawing.fillStyle = '#111';
    drawing.font = 'bold 40px sans-serif';
    drawing.fillText('1 MARK 1921', 200, 250);
    const blurred = document.createElement('canvas');
    blurred.width = 640;
    blurred.height = 480;
    const soft = blurred.getContext('2d')!;
    soft.filter = 'blur(4px)';
    soft.drawImage(sharp, 0, 0);
    return blurred.toDataURL('image/png');
  });
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return path;
}

// Below the test timeout, so a slow upload fails with its own message instead of a bare timeout.
export const PHOTO_ARRIVES = 45_000;

export const GEOCODER = 'https://photon.komoot.io/**';

/** Answers every Photon search with these features. */
export async function answerGeocoder(page: Page, features: unknown[]) {
  await page.route(GEOCODER, (route) => route.fulfill({ json: { features } }));
}

export function photonFeature(name: string, coordinates: [number, number]) {
  return { properties: { name }, geometry: { type: 'Point', coordinates } };
}

/** The titles currently on the page, in the order the grid shows them. */
export async function visibleTitles(page: Page) {
  return createPageTree(page).catalogue.locators.cardTitles.allTextContents();
}

/** Polled: the grid is two async waits (debounce, then query) away from any keystroke. */
export async function expectTitles(page: Page, expected: string[]) {
  await expect.poll(() => visibleTitles(page)).toEqual(expected);
}
