import { execFileSync } from 'node:child_process';

import { expect, test } from './test';
import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { PHOTO, PHOTO_ARRIVES, uniqueName } from './helpers';
// exportCategory.test.ts covers the logic; only a browser proves a download a real extractor opens.
test.use({ locale: 'en-GB' });

// The default 30s sits below PHOTO_ARRIVES, so a slow upload would end in a bare test timeout.
test.describe.configure({ timeout: 120_000 });

test.describe('exporting a category', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.exportCategory);
  });

  test('downloads an archive containing the manifest, the CSV and the photograph', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueName('Exportstück');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      const zipPath = await app.categories.do.downloadExport();

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
