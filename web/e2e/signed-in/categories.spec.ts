import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
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

  // Arrows only move focus: each selection loads a collection, so only Enter picks one.
  test('walks the strip by keyboard without closing it, then opens a collection with Enter', async ({
    on,
    page,
  }, testInfo) => {
    const categories = on(page).categories;
    await categories.do.open('Münzen');

    await categories.locators.buttons.expand.focus();
    await page.keyboard.press('Enter');
    await expect(categories.locators.buttons.collapse).toBeFocused();

    // The strip is one Tab stop, and it sits on the selected collection.
    await page.keyboard.press('Tab');
    await expect(categories.tab('Münzen')).toBeFocused();

    // Read once the strip is open: the list is fixed until this page reloads it.
    const names = await categories.locators.tabNames.allTextContents();
    const next = names[(names.indexOf('Münzen') + 1) % names.length];

    await page.keyboard.press('ArrowRight');
    await expect(categories.tab(next)).toBeFocused();
    await expect(categories.locators.selected).toHaveText('Münzen');

    await page.keyboard.press('End');
    await expect(categories.tab(names[names.length - 1])).toBeFocused();
    await page.keyboard.press('Home');
    await expect(categories.tab(names[0])).toBeFocused();
    await expect(categories.locators.selected).toHaveText('Münzen');
    await expectNoSeriousA11yViolations(page, testInfo);

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(categories.locators.selected).toHaveText(
      names[names.length - 1],
    );
    await expect(categories.locators.tabs).toHaveCount(0);
    await expect(categories.locators.buttons.expand).toBeFocused();
  });
});
