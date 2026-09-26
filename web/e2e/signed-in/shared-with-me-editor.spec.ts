import { resolve } from 'node:path';

import { expect, test } from './test';

import { removeEntriesTitled, removeGranteeWrites } from './cleanup';
import { AUTH_STATE_PATH, OTHER_AUTH_STATE_PATH, SEED } from './fixtures';
import { apiAs, context, editorShare, ownerEntryIn } from './rls/helpers';

// The editor's side, in their own session; rls/editor-share*.spec.ts has what the policies allow.
test.use({ storageState: OTHER_AUTH_STATE_PATH, locale: 'en-GB' });

// Two real uploads and a second browser do not reliably fit the default 30s under parallel load.
test.describe.configure({ timeout: 120_000 });
// Below the test timeout, so a slow upload fails with its own message instead of a bare timeout.
const ARRIVES = 45_000;

// A real photograph: the compressor decodes what it is given, and a canvas cannot draw a fake PNG.
const PHOTO = resolve(process.cwd(), 'public/logo.png');

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

/** What the grantee stored under one entry: its uploads land under its own prefix, whoever owns the entry. */
async function granteeObjects(itemId: string) {
  const { otherToken, otherUserId } = context();
  const { data, error } = await apiAs(otherToken)
    .storage.from('item-images')
    .list(`${otherUserId}/${itemId}`);
  if (error) throw error;
  return data.map((object) => object.name);
}

async function granteeItemId(title: string) {
  const { otherToken, otherUserId } = context();
  const { data, error } = await apiAs(otherToken)
    .from('items')
    .select('id')
    .eq('user_id', otherUserId)
    .eq('title', title)
    .single();
  if (error) throw error;
  return data.id;
}

test.describe('a collection shared with you to edit', () => {
  test('takes new, edited and deleted entries with photographs, shows the owner, and shuts once demoted', async ({
    on,
    page,
    browser,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    const ownerTitle = uniqueTitle('Tauschobjekt');
    const renamed = `${ownerTitle} (edited)`;
    const filedTitle = uniqueTitle('Mitgebracht');
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.editorJourneyCategory,
      title: ownerTitle,
    });
    const shareId = await editorShare(token, categoryId);

    try {
      await app.categories.do.open(SEED.editorJourneyCategory);
      await expect(app.catalogue.locators.buttons.newEntry).toBeEnabled();

      await app.catalogue.do.addEntry(filedTitle);
      const filed = app.catalogue.card(filedTitle);
      await filed.do.uploadPhoto(PHOTO);
      await expect(filed.locators.images).toBeVisible({ timeout: ARRIVES });
      const filedId = await granteeItemId(filedTitle);
      expect(await granteeObjects(filedId)).toHaveLength(2);

      // The owner's entry, photographed under the editor's prefix: one taken from the entry, Storage refuses.
      await app.catalogue.card(ownerTitle).do.edit();
      await app.form.do.fill({ title: renamed });
      await app.form.do.submit();
      const edited = app.catalogue.card(renamed);
      await expect(edited.locators.title).toHaveText(renamed);
      await edited.do.uploadPhoto(PHOTO);
      await expect(edited.locators.images).toBeVisible({ timeout: ARRIVES });
      expect(await granteeObjects(itemId)).toHaveLength(2);

      const ownerContext = await browser.newContext({
        storageState: AUTH_STATE_PATH,
        locale: 'en-GB',
      });
      try {
        const owner = on(await ownerContext.newPage());
        await owner.categories.do.open(SEED.editorJourneyCategory);
        const ownersCard = owner.catalogue.card(renamed);
        await expect(ownersCard.locators.images).toBeVisible({
          timeout: ARRIVES,
        });
        await expect(ownersCard.locators.images).toHaveAttribute(
          'src',
          /token=/,
        );
      } finally {
        await ownerContext.close();
      }

      await app.catalogue.do.removeEntry(filedTitle);
      await app.toast.do.commitDeletion('items');
      expect(await granteeObjects(filedId)).toEqual([]);

      await expect(edited.locators.buttons.edit).toHaveCount(1);
      const { error } = await apiAs(token)
        .from('category_shares')
        .update({ role: 'viewer' })
        .eq('id', shareId);
      if (error) throw error;

      // UX only, on the next load; rls/editor-share.spec.ts shows the writes refused.
      await app.categories.do.open(SEED.editorJourneyCategory);
      await expect(edited.locators.images).toBeVisible({ timeout: ARRIVES });
      await expect(app.catalogue.locators.buttons.newEntry).toBeDisabled();
      await expect(edited.locators.buttons.edit).toHaveCount(0);
      await expect(edited.locators.buttons.delete).toHaveCount(0);
      await expect(edited.locators.buttons.deleteImage).toHaveCount(0);
      await expect(edited.locators.uploadInput).toHaveCount(0);
    } finally {
      // The grantee's bytes first: it can remove them only while the owner's entry still exists.
      await removeGranteeWrites({
        categoryId,
        titles: [ownerTitle, renamed, filedTitle],
      });
      await removeEntriesTitled(ownerTitle);
      await removeEntriesTitled(renamed);
    }
  });
});
