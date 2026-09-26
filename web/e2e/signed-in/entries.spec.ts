import { expect, test } from './test';

import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { expectTitles, visibleTitles } from './helpers';

// Writes are where RLS has to permit as well as forbid; an insert policy gone too strict fails here.
test.use({ locale: 'en-GB' });

// Each test creates and removes its own entry, so the seeded collection is unchanged afterwards.
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('adding and removing entries', () => {
  // Its own collection: specs run in parallel, and writing into one another file counts fails both.
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
      // In finally, so a failed assertion does not leave the entry behind for the next test to count.
      await removeEntriesTitled(title);
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
      await removeEntriesTitled(title);
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
      await removeEntriesTitled(title);
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
      await removeEntriesTitled(title);
    }
  });

  test('edits an entry in place', async ({ on, page }) => {
    const title = uniqueTitle('Groschen');
    const renamed = `${title} (renamed)`;
    try {
      await on(page).catalogue.do.addEntry(title);

      await on(page).catalogue.card(title).do.edit();
      await on(page).form.do.fill({ title: renamed });
      await on(page).form.do.submit();

      await expect(on(page).catalogue.card(renamed)()).toBeVisible();
    } finally {
      // Both, whether the rename below ran or not.
      await removeEntriesTitled(title);
      await removeEntriesTitled(renamed);
    }
  });

  // The database trims whitespace on write, and the app shows the returned row rather than the typed one.
  test('stores a title as the database normalises it', async ({ on, page }) => {
    const title = uniqueTitle('Batzen');
    try {
      await on(page).catalogue.do.addEntry(`   ${title}   `);

      await expect(on(page).catalogue.card(title).locators.title).toHaveText(
        title,
      );
    } finally {
      await removeEntriesTitled(title);
    }
  });
});
