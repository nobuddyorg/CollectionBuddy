import { expect, test } from './test';

import { removeCategoryNamed } from './cleanup';

// A throwaway category, unique per run, so no other spec's collection is touched.
test.use({ locale: 'en-GB' });

test.describe('managing categories', () => {
  test('creates, renames and deletes a category through the interface', async ({
    on,
    page,
  }) => {
    const name = `E2E Category ${Date.now()}`;
    const renamed = `${name} (renamed)`;
    const categories = on(page).categories;

    await page.goto('', { waitUntil: 'networkidle' });
    await expect(categories.locators.selected).not.toBeEmpty();

    // Creating a category selects it and collapses the panel back down.
    await categories.do.create(name);
    try {
      await categories.do.openPanel();
      await expect(categories.tab(name)).toBeVisible();

      // Rename does not collapse the panel, so this reads back the row the database returned.
      await categories.do.rename(renamed);
      await expect(categories.tab(renamed)).toBeVisible();

      await categories.do.delete();
      // The category is empty, so this is the unqualified confirmation, not the entry-count warning.
      await expect(on(page).confirm.locators.message).toHaveText(
        `Delete "${renamed}"?`,
      );
      await on(page).confirm.do.accept();

      // Deleting selects whatever category is left, which collapses the panel.
      await expect(categories.locators.selected).not.toHaveText(renamed);
      await categories.do.openPanel();
      await expect(categories.tab(renamed)).toHaveCount(0);
      await on(page).toast.do.commitDeletion('categories');
    } finally {
      // Both, whether the rename ran or not.
      await removeCategoryNamed(name);
      await removeCategoryNamed(renamed);
    }
  });
});
