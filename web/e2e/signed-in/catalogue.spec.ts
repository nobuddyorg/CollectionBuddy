import { expect, test } from './test';

import { SEED, titlesIn } from './fixtures';
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

  // Nothing is selected until the collections arrive; the first-run create and import controls must not stand in.
  test('holds placeholders, not create and import, while the collections load', async ({
    on,
    page,
  }) => {
    const categories = on(page).categories;
    const categoryList = (url: URL) =>
      url.pathname.endsWith('/rest/v1/categories');
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let listRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      listRequested = resolve;
    });
    await page.route(categoryList, async (route) => {
      listRequested();
      await released;
      await route.fallback();
    });
    try {
      await page.goto('');
      await requested;
      await expect(categories.locators.selected).toBeVisible();
      await expect(categories.locators.selected).toBeEmpty();
      await expect(categories.locators.inputs.newName).toHaveCount(0);
      await expect(categories.locators.inputs.importFile).toHaveCount(0);

      release();
      await expect(categories.locators.selected).not.toBeEmpty();
      await expect(categories.locators.buttons.expand).toBeVisible();
      await expect(categories.locators.inputs.newName).toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });

  test('shows a category exactly, newest first', async ({ on, page }) => {
    await on(page).categories.do.open('Münzen');
    await expectTitles(page, titlesIn('Münzen'));
  });

  // postgrest-js resolves an aborted read with an error; a switch mid-load must not call that a failed search.
  test('switches collection mid-load without reporting a failure', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    const itemList = (url: URL) =>
      url.pathname.endsWith('/rest/v1/item_categories');
    const hold = { armed: true };
    let listRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      listRequested = resolve;
    });
    // A held read never answers, so only the switch away can end it.
    await page.route(itemList, (route) => {
      if (!hold.armed) return route.fallback();
      listRequested();
    });
    try {
      await app.categories.do.openPanel();
      await app.categories.tab('Briefmarken').click();
      await requested;
      hold.armed = false;

      await app.categories.do.openPanel();
      await app.categories.tab('Münzen').click();

      await expectTitles(page, titlesIn('Münzen'));
      await expect(app.toast()).toHaveCount(0);
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
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
