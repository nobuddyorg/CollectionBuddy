import { expect, test } from './test';

// Throwaway category, unique per run, so this can run alongside every other
// spec without touching the collections they read or write.
test.use({ locale: 'en-GB' });

test.describe('managing categories', () => {
  test('creates, renames and deletes a category through the interface', async ({
    page,
  }) => {
    const name = `E2E Category ${Date.now()}`;
    const renamed = `${name} (renamed)`;

    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('selected-category')).not.toBeEmpty();

    // Panel starts collapsed; expanding it reveals the create/rename/delete controls.
    await page.getByTestId('expand-categories').click();

    await page.getByLabel('New collection').fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Creating a category selects it and collapses the panel back down.
    await expect(page.getByTestId('selected-category')).toHaveText(name);

    await page.getByTestId('expand-categories').click();
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();

    await page.getByLabel('Rename').fill(renamed);
    await page.getByRole('button', { name: 'Save name', exact: true }).click();

    // Rename doesn't collapse the panel, so this reads back the row the DB
    // returned rather than just the typed value.
    await expect(page.getByTestId('selected-category')).toHaveText(renamed);
    await expect(
      page.getByRole('tab', { name: renamed, exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    // Category is empty, so this is the unqualified confirmation, not the
    // entry-count warning.
    await expect(page.getByText(`Delete "${renamed}"?`)).toBeVisible();
    await page.getByTestId('confirm-accept').click();

    // Deleting selects whatever category is left, which collapses the panel again.
    await expect(page.getByTestId('selected-category')).not.toHaveText(renamed);
    await page.getByTestId('expand-categories').click();
    await expect(
      page.getByRole('tab', { name: renamed, exact: true }),
    ).not.toBeVisible();
  });
});
