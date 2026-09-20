import { expect, test } from './test';

import { SEED } from './fixtures';
import { expectTitles, visibleTitles } from './helpers';

// Writes are where RLS has to permit as well as forbid: a policy that stopped
// allowing an ordinary insert would fail here, and nowhere else in the suite.
test.use({ locale: 'en-GB' });

// Each test creates and removes its own entry, so the seeded collection is
// unchanged before and after and tests can run in any order.
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('adding and removing entries', () => {
  // Its own collection: spec files run in parallel against one database, so
  // writing into a collection another file is counting would fail both at
  // random.
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.scratchCategory);
  });

  test('adds an entry and puts it at the front', async ({ on, page }) => {
    const title = uniqueTitle('Taler');
    try {
      await on(page).catalogue.do.addEntry(title);

      const titles = await visibleTitles(page);
      expect(titles[0]).toBe(title);
    } finally {
      // In `finally` so a failed assertion above doesn't leave the entry
      // behind to throw off the next test's count of the collection.
      await on(page).catalogue.do.removeEntry(title);
    }
  });

  test('keeps what was typed into it', async ({ on, page }) => {
    const title = uniqueTitle('Dukat');
    try {
      await on(page).catalogue.do.addEntry(title, 'Geprägt in Venedig.');

      await expect(
        on(page).catalogue.card(title).locators.description,
      ).toHaveText('Geprägt in Venedig.');
    } finally {
      await on(page).catalogue.do.removeEntry(title);
    }
  });

  test('finds a new entry by searching for it', async ({ on, page }) => {
    const title = uniqueTitle('Dublone');
    try {
      await on(page).catalogue.do.addEntry(title);

      await on(page).catalogue.do.search(title);
      await expectTitles(page, [title]);

      await on(page).catalogue.do.search('');
    } finally {
      await on(page).catalogue.do.removeEntry(title);
    }
  });

  test('leaves the entry alone when the deletion is cancelled', async ({
    on,
    page,
  }) => {
    const title = uniqueTitle('Sesterz');
    try {
      await on(page).catalogue.do.addEntry(title);

      await on(page).catalogue.card(title).do.delete();
      await on(page).confirm.do.cancel();
      await expect(on(page).catalogue.card(title)()).toBeVisible();
    } finally {
      await on(page).catalogue.do.removeEntry(title);
    }
  });

  test('edits an entry in place', async ({ on, page }) => {
    const title = uniqueTitle('Groschen');
    const renamed = `${title} (renamed)`;
    // Tracks the entry's current title, so cleanup deletes the right card
    // whether the rename below ran or not.
    let currentTitle = title;
    try {
      await on(page).catalogue.do.addEntry(title);

      await on(page).catalogue.card(title).do.edit();
      await on(page).form.do.fill({ title: renamed });
      await on(page).form.do.submit();

      await expect(on(page).catalogue.card(renamed)()).toBeVisible();
      currentTitle = renamed;
    } finally {
      await on(page).catalogue.do.removeEntry(currentTitle);
    }
  });

  // The database trims/collapses whitespace on write, and the app merges
  // back the returned row rather than guessing what was stored.
  test('stores a title as the database normalises it', async ({ on, page }) => {
    const title = uniqueTitle('Batzen');
    try {
      await on(page).catalogue.do.addEntry(`   ${title}   `);

      await expect(on(page).catalogue.card(title).locators.title).toHaveText(
        title,
      );
    } finally {
      await on(page).catalogue.do.removeEntry(title);
    }
  });
});
