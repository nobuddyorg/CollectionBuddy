import { expect, test } from './test';

// #341: category create/rename/delete had no e2e journey at all. A
// throwaway category, unique per run, so this can run alongside every other
// spec without touching the collections they read or write -- the same
// reasoning SEED's own scratch categories already follow.
test.use({ locale: 'en-GB' });

test.describe('managing categories', () => {
  test('creates, renames and deletes a category through the interface', async ({
    page,
  }) => {
    const name = `E2E Category ${Date.now()}`;
    const renamed = `${name} (renamed)`;

    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('selected-category')).not.toBeEmpty();

    // The panel is collapsed once a category is chosen, same as
    // openCategory relies on -- opening it is what reveals the create/
    // rename/delete controls at all.
    await page.getByTestId('expand-categories').click();

    await page.getByLabel('New category').fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Creating a category selects it and collapses the panel back down
    // (CategorySelect/index.tsx), the same transition choosing a tab does.
    await expect(page.getByTestId('selected-category')).toHaveText(name);

    await page.getByTestId('expand-categories').click();
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();

    await page.getByLabel('Rename').fill(renamed);
    await page.getByRole('button', { name: 'Save name', exact: true }).click();

    // Rename doesn't collapse the panel, so the tab it renamed is still on
    // screen to read back -- the row the DB returned, not just the value
    // this typed in.
    await expect(page.getByTestId('selected-category')).toHaveText(renamed);
    await expect(
      page.getByRole('tab', { name: renamed, exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    // Empty -- no entries were ever created under it -- so this is the
    // unqualified confirmation, not the entry-count warning.
    await expect(
      page.getByText(`Delete "${renamed}"? This cannot be undone.`),
    ).toBeVisible();
    await page.getByTestId('confirm-accept').click();

    // Deleting selects whatever category is left, which is a different id
    // than the one just removed -- the same selection-changed transition
    // that created it collapses the panel back down again.
    await expect(page.getByTestId('selected-category')).not.toHaveText(renamed);
    await page.getByTestId('expand-categories').click();
    await expect(
      page.getByRole('tab', { name: renamed, exact: true }),
    ).not.toBeVisible();
  });
});
