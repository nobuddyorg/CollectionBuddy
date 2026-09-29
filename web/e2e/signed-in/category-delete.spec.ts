import { expect, test } from './test';
import { removeCategoryNamed } from './cleanup';
import { PHOTO, PHOTO_ARRIVES, uniqueName } from './helpers';
import {
  apiAs,
  context,
  ownedCategoryId,
  seededEntryId,
  storedObjects,
} from './rls/helpers';

// The other half of categories.spec.ts: a collection with contents, whose photographs only the client sweeps.
test.use({ locale: 'en-GB' });

// A real upload before the delete even starts.
test.describe.configure({ timeout: 120_000 });

test.describe('deleting a collection that still holds things', () => {
  test('counts what it is about to destroy, and takes the photographs too', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    // Its own throwaway collection: nothing seeded is safe to delete out from under the suite.
    const name = uniqueName('E2E Vollgepackt');
    const title = uniqueName('Inhalt');

    await app.categories.do.load();
    await app.categories.do.create(name);
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await seededEntryId({ token, ownerId: userId, title });
      const prefix = `${userId}/${itemId}`;
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });
      expect(
        (await storedObjects(token, prefix)).map((object) => object.name),
      ).not.toEqual([]);

      await app.categories.do.delete();
      // Named and counted, not a bare "are you sure".
      await expect(app.confirm.locators.message).toContainText(
        `Delete "${name}"? Its one entry`,
      );
      await app.confirm.do.accept();

      await expect(app.categories.locators.selected).not.toHaveText(name);
      await app.toast.do.commitDeletion('categories');
      expect(
        (await storedObjects(token, prefix)).map((object) => object.name),
      ).toEqual([]);
    } finally {
      await removeCategoryNamed(name);
    }
  });

  test('writes a count of a thousand the way the locale does', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    const name = uniqueName('E2E Tausend');

    await app.categories.do.load();
    await app.categories.do.create(name);
    try {
      const categoryId = await ownedCategoryId({ token, userId, name });
      const { error } = await apiAs(token).rpc('create_items_in_category', {
        target_category_id: categoryId,
        entries: Array.from({ length: 1000 }, (_, index) => ({
          title: `Eintrag ${index}`,
        })),
      });
      if (error) throw error;

      await app.categories.do.delete();
      // en-GB groups thousands with a comma; "1000" would mean the raw number reached the screen.
      await expect(app.confirm.locators.message).toContainText(
        `Delete "${name}"? Its 1,000 entries`,
      );
      await app.confirm.do.accept();
      await app.toast.do.commitDeletion('categories');
    } finally {
      await removeCategoryNamed(name);
    }
  });

  // The delete waits out the undo window; undo inside it puts the collection back, selected, with nothing lost.
  test('can be taken back inside the undo window', async ({ on, page }) => {
    const app = on(page);
    const name = uniqueName('E2E Doch behalten');
    const title = uniqueName('Inhalt');

    await app.categories.do.load();
    await app.categories.do.create(name);
    try {
      await app.catalogue.do.addEntry(title);
      await app.categories.do.delete();
      await app.confirm.do.accept();
      await expect(app.categories.locators.selected).not.toHaveText(name);

      await app.toast.do.undo();
      await expect(app.categories.locators.selected).toHaveText(name);
      await expect(app.catalogue.card(title)()).toBeVisible();

      // Nothing was deleted, so it survives a trip to the database.
      await app.categories.do.open(name);
      await expect(app.catalogue.card(title)()).toBeVisible();
    } finally {
      await removeCategoryNamed(name);
    }
  });
});
