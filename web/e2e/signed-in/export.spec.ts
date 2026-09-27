import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { expect, test } from './test';
import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
// exportCategory.test.ts covers the logic; only a browser proves a download a real extractor opens.
test.use({ locale: 'en-GB' });

const PHOTO = resolve(process.cwd(), 'public/logo.png');
const ARRIVES = 30_000;
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('exporting a category', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.exportCategory);
  });

  test('downloads an archive containing the manifest, the CSV and the photograph', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Exportstück');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.categories.do.exportCollection(),
      ]);

      const zipPath = await download.path();
      if (!zipPath) throw new Error('the export did not save a file to disk');

      const listing = execFileSync('unzip', ['-l', zipPath], {
        encoding: 'utf8',
      });
      expect(listing).toContain('collection.json');
      expect(listing).toContain('collection.csv');
      expect(listing).toMatch(/photos\/\d+-[^/]+\/1\.\w+/);

      // Entries live under one root folder, so the member name needs a wildcard.
      const manifestJson = execFileSync(
        'unzip',
        ['-p', zipPath, '*/collection.json'],
        { encoding: 'utf8' },
      );
      const manifest: {
        items: { title: string; photos: string[] }[];
      } = JSON.parse(manifestJson);
      const entry = manifest.items.find((item) => item.title === title);
      expect(entry).toBeTruthy();
      expect(entry?.photos).toHaveLength(1);

      const csv = execFileSync('unzip', ['-p', zipPath, '*/collection.csv'], {
        encoding: 'utf8',
      });
      expect(csv).toContain(title);
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
