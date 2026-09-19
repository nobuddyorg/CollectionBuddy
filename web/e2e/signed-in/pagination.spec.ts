import { expect, test } from './test';

import { SEED } from './fixtures';
import { expectTitles, openCategory, visibleTitles } from './helpers';

// paging.ts has the arithmetic; this is that the grid asks a page at a time.
test.use({ locale: 'en-GB' });

test.describe('a collection larger than one page', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, SEED.pagingCategory);
  });

  test('shows a page at a time and walks between them', async ({ page }) => {
    const pager = page.getByRole('navigation', { name: 'Pagination' });

    await expect(page.getByTestId('item-card')).toHaveCount(9);
    // Newest first, and the seed goes in oldest first.
    expect((await visibleTitles(page))[0]).toBe('Schaustück 11');

    await pager.getByRole('button', { name: 'Next', exact: true }).click();
    // The remainder: an off-by-one would repeat or skip an entry here.
    await expectTitles(page, ['Schaustück 02', 'Schaustück 01']);
    await expect(
      pager.getByRole('button', { name: 'Page 2', exact: true }),
    ).toHaveAttribute('aria-current', 'page');

    await pager.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page.getByTestId('item-card')).toHaveCount(9);
  });

  // Paging follows what the search left, not what the collection holds.
  test('stops paging when a search narrows it to one page', async ({
    page,
  }) => {
    await page.getByTestId('search-input').fill('Schaustück 01');
    await expectTitles(page, ['Schaustück 01']);
    await expect(
      page.getByRole('navigation', { name: 'Pagination' }),
    ).toHaveCount(0);
  });
});
