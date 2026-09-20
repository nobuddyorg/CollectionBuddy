import { resolve } from 'node:path';

import { expect, test } from './test';

import { SEED } from './fixtures';
import { openCategory } from './helpers';

// photos.spec.ts proves a photograph is stored and drawn; this is what a
// collector does with it afterwards -- opening it full size and walking a
// carousel that only exists once two are attached.
test.use({ locale: 'en-GB' });

// Two real uploads before the first assertion, same as photos.spec.ts.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

type Page = import('@playwright/test').Page;

const PHOTO = resolve(process.cwd(), 'public/logo.png');
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

async function deleteEntry(page: Page, title: string) {
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await card.getByTestId('delete-entry').click();
  await page.getByTestId('confirm-accept').click();
  await expect(card).toHaveCount(0);
}

test.describe('looking at a photograph full size', () => {
  test('opens, walks both ways between two, and closes on Escape', async ({
    page,
  }) => {
    await openCategory(page, SEED.viewerCategory);

    const title = uniqueTitle('Angeschaut');
    try {
      await page.getByTestId('new-entry').click();
      await page.getByTestId('item-title').fill(title);
      await page.getByTestId('item-submit').click();

      const card = page.getByTestId('item-card').filter({ hasText: title });
      await expect(card).toBeVisible();

      const upload = card.getByTestId('upload-photo').first();
      await upload.setInputFiles(PHOTO);
      await expect(card.locator('img')).toHaveCount(1, { timeout: ARRIVES });
      await upload.setInputFiles(PHOTO);
      await expect(card.locator('img')).toHaveCount(2, { timeout: ARRIVES });

      await card.locator('img').first().click();
      const viewer = page.getByRole('dialog', { name: 'Full size image' });
      await expect(viewer).toBeVisible();
      await expect(viewer.getByText('1 / 2')).toBeVisible();

      // Arrow keys and the buttons drive the same carousel.
      await page.keyboard.press('ArrowRight');
      await expect(viewer.getByText('2 / 2')).toBeVisible();
      await viewer.getByRole('button', { name: 'Previous image' }).click();
      await expect(viewer.getByText('1 / 2')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
    } finally {
      await deleteEntry(page, title);
    }
  });
});
