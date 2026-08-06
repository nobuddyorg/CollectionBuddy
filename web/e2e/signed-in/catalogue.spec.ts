import { expect, test } from '@playwright/test';

import { SEED, itemsIn } from './fixtures';
import { expectTitles, openCategory, visibleTitles } from './helpers';

// The first tests to see the app signed in. Everything below goes through the
// real Postgres and the real row-level security -- what is asserted is not
// that a component renders, but that the query behind it came back with the
// right rows for the right user.
test.use({ locale: 'en-GB' });

test.describe('the catalogue', () => {
  test('opens signed in rather than bouncing to the login page', async ({
    page,
  }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  // Newest first, which is what puts a just-created entry at the top of the
  // page rather than at the end of it.
  test('shows a category exactly, newest first', async ({ page }) => {
    await openCategory(page, 'Münzen');
    await expectTitles(
      page,
      itemsIn('Münzen').map((item) => item.title),
    );
  });

  test('keeps another category to itself', async ({ page }) => {
    await openCategory(page, 'Münzen');
    expect(await visibleTitles(page)).not.toContain('Blaue Mauritius');

    await openCategory(page, 'Briefmarken');
    await expectTitles(page, ['Blaue Mauritius']);
  });

  test('shows an entry with its description, place and tags', async ({
    page,
  }) => {
    await openCategory(page, 'Münzen');
    const denarius = SEED.items.find((item) => item.title === 'Silberdenar')!;
    const card = page
      .getByTestId('item-card')
      .filter({ hasText: denarius.title });

    await expect(card.getByText(denarius.description)).toBeVisible();
    await expect(
      card.getByText(denarius.place!, { exact: true }),
    ).toBeVisible();
    for (const tag of denarius.tags) {
      await expect(card.getByText(tag, { exact: true })).toBeVisible();
    }
  });

  // An entry with no photograph gets an empty mount rather than no image area
  // at all, so every card in the stack has the same silhouette.
  test('gives an unphotographed entry the same shape as the rest', async ({
    page,
  }) => {
    await openCategory(page, 'Münzen');
    const cards = page.getByTestId('item-card');
    const heights = await cards.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).getBoundingClientRect().height),
    );
    expect(new Set(heights).size).toBe(1);
  });
});
