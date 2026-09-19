import { expect, test } from './test';

import { SEED, itemsIn } from './fixtures';
import { expectTitles, openCategory } from './helpers';

// The half fake I/O cannot reach: a real download, handed to a real input.
test.use({ locale: 'en-GB' });

// Two real round trips, past the 30s default under parallel load.
test.describe.configure({ timeout: 120_000 });

type Page = import('@playwright/test').Page;

async function expandPanel(page: Page) {
  const expand = page.getByTestId('expand-categories');
  if (await expand.isVisible()) await expand.click();
}

/** Removes a category through the panel, if it is still there to remove. */
async function removeCategory(page: Page, name: string) {
  await expandPanel(page);
  const tab = page.getByRole('tab', { name, exact: true });
  if ((await tab.count()) === 0) return;

  await tab.click();
  await expandPanel(page);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('selected-category')).not.toHaveText(name);
}

test.describe('importing an exported archive', () => {
  test('reads a collection back as a copy beside the original', async ({
    page,
  }) => {
    await openCategory(page, SEED.importCategory);
    await expandPanel(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-category').click(),
    ]);
    const archive = await download.path();
    if (!archive) throw new Error('the export did not save a file to disk');

    // Named the way a filesystem names a second copy, never overwriting.
    const copy = `${SEED.importCategory} (2)`;
    try {
      await page.getByTestId('import-file-input').setInputFiles(archive);

      // Importing selects the new collection, which collapses the panel.
      await expect(page.getByTestId('selected-category')).toHaveText(copy, {
        timeout: 60_000,
      });
      await expectTitles(
        page,
        itemsIn(SEED.importCategory).map((item) => item.title),
      );

      // Not just the titles: an entry arrives with what was around it.
      const card = page.getByTestId('item-card').first();
      await expect(card.getByText('Bremen', { exact: true })).toBeVisible();
      await expect(card.getByText('umzug', { exact: true })).toBeVisible();
    } finally {
      // In `finally`, so a failed assertion leaves no copy for the next run.
      await removeCategory(page, copy);
    }
  });
});
