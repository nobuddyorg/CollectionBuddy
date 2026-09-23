import { expect, test } from './test';

import { SEED, itemsIn } from './fixtures';
import { expectTitles, visibleTitles } from './helpers';

// Runs against the real Postgres and real row-level security, not a mock.
test.use({ locale: 'en-GB' });

test.describe('the catalogue', () => {
  test('opens signed in rather than bouncing to the login page', async ({
    on,
    page,
  }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(on(page).catalogue.locators.inputs.search).toBeVisible();
  });

  test('shows a category exactly, newest first', async ({ on, page }) => {
    await on(page).categories.do.open('Münzen');
    await expectTitles(
      page,
      itemsIn('Münzen').map((item) => item.title),
    );
  });

  test('keeps another category to itself', async ({ on, page }) => {
    await on(page).categories.do.open('Münzen');
    expect(await visibleTitles(page)).not.toContain('Blaue Mauritius');

    await on(page).categories.do.open('Briefmarken');
    await expectTitles(page, ['Blaue Mauritius']);
  });

  test('shows an entry with its description, place and tags', async ({
    on,
    page,
  }) => {
    await on(page).categories.do.open('Münzen');
    const denarius = SEED.items.find((item) => item.title === 'Silberdenar')!;
    const card = on(page).catalogue.card(denarius.title);

    await expect(card.locators.description).toHaveText(denarius.description);
    await expect(card.locators.place).toHaveText(denarius.place!);
    await expect(card.locators.tags).toHaveText([...denarius.tags]);
  });

  // An unphotographed entry keeps an empty image area, so every card has the same silhouette.
  test('gives an unphotographed entry the same shape as the rest', async ({
    on,
    page,
  }) => {
    await on(page).categories.do.open('Münzen');
    const heights = await on(page).catalogue.locators.cards.evaluateAll(
      (nodes) =>
        nodes.map(
          (node) => (node as HTMLElement).getBoundingClientRect().height,
        ),
    );
    expect(new Set(heights).size).toBe(1);
  });
});
