import { resolve } from 'node:path';

import { expect, type Page } from '@playwright/test';

import { createPageTree } from '../pages';

export const uniqueName = (what: string) => `${what} ${Date.now()}`;

// A real photograph: the compressor decodes what it is given, and a canvas cannot draw a fake PNG.
export const PHOTO = resolve(process.cwd(), 'public/logo.png');

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
