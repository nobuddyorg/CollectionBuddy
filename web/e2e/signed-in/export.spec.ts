import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { expect, test } from './test';
import { SEED } from './fixtures';
import { openCategory } from './helpers';

// Pagination, batching, and skip-on-failure are unit-tested with fake I/O in
// exportCategory.test.ts. Only a real browser can prove that clicking Export
// produces a download, and that a real, independent extractor can open it.
test.use({ locale: 'en-GB' });

const PHOTO = resolve(process.cwd(), 'public/logo.png');
const ARRIVES = 30_000;
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('exporting a category', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, SEED.exportCategory);
  });

  test('downloads an archive containing the manifest, the CSV and the photograph', async ({
    page,
  }) => {
    const title = uniqueTitle('Exportstück');

    await page.getByTestId('new-entry').click();
    await page.getByTestId('item-title').fill(title);
    await page.getByTestId('item-submit').click();
    const card = page.getByTestId('item-card').filter({ hasText: title });
    await expect(card).toBeVisible();

    await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
    await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });

    // The export button only exists in the open panel.
    await page.getByTestId('expand-categories').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-category').click(),
    ]);

    const zipPath = await download.path();
    if (!zipPath) throw new Error('the export did not save a file to disk');

    const listing = execFileSync('unzip', ['-l', zipPath], {
      encoding: 'utf8',
    });
    expect(listing).toContain('collection.json');
    expect(listing).toContain('collection.csv');
    expect(listing).toMatch(/photos\/\d+-[^/]+\/1\.\w+/);

    // Entries live under one root folder, so the member name needs a wildcard
    // rather than the bare file name.
    const manifestJson = execFileSync(
      'unzip',
      ['-p', zipPath, '*/collection.json'],
      { encoding: 'utf8' },
    );
    const manifest: {
      items: { title: string; photos: string[] }[];
    } = JSON.parse(manifestJson);
    const entry = manifest.items.find((i) => i.title === title);
    expect(entry).toBeTruthy();
    expect(entry?.photos).toHaveLength(1);

    const csv = execFileSync('unzip', ['-p', zipPath, '*/collection.csv'], {
      encoding: 'utf8',
    });
    expect(csv).toContain(title);

    await card.getByTestId('delete-entry').click();
    await page.getByTestId('confirm-accept').click();
    await expect(card).toHaveCount(0);
  });
});
