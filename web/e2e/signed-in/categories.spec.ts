import { expect, test } from './test';

// Throwaway category, unique per run, so this can run alongside every other
// spec without touching the collections they read or write.
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

    await categories.do.openPanel();
    await expect(categories.tab(name)).toBeVisible();

    // Rename doesn't collapse the panel, so this reads back the row the DB
    // returned rather than just the typed value.
    await categories.do.rename(renamed);
    await expect(categories.tab(renamed)).toBeVisible();

    await categories.do.delete();
    // Category is empty, so this is the unqualified confirmation, not the
    // entry-count warning.
    await expect(on(page).confirm.locators.message).toHaveText(
      `Delete "${renamed}"?`,
    );
    await on(page).confirm.do.accept();

    // Deleting selects whatever category is left, which collapses the panel.
    await expect(categories.locators.selected).not.toHaveText(renamed);
    await categories.do.openPanel();
    await expect(categories.tab(renamed)).toHaveCount(0);
  });
});
