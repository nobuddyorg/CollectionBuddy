import { expect, test } from '../test';
import { SEED } from '../fixtures';
import {
  anonApi,
  apiAs,
  context,
  editorShare,
  ownedCategoryId,
  unshare,
  viewerShare,
} from './helpers';

// Entries and their link in one transaction, as the caller: a refused link must take its entry with it.
test.describe('create_items_in_category (creating an entry)', () => {
  function createIn(creation: {
    token: string;
    categoryId: string;
    titles: string[];
  }) {
    return apiAs(creation.token).rpc('create_items_in_category', {
      target_category_id: creation.categoryId,
      entries: creation.titles.map((title) => ({ title })),
    });
  }

  /** What the caller's own rows hold under a title: an entry in no category still reads back to its owner. */
  async function ownEntriesTitled(token: string, title: string) {
    const { data, error } = await apiAs(token)
      .from('items')
      .select('id, user_id, item_categories(category_id)')
      .eq('title', title);
    if (error) throw error;
    return data;
  }

  async function removeEntriesTitled(token: string, title: string) {
    const { error } = await apiAs(token)
      .from('items')
      .delete()
      .eq('title', title);
    if (error) throw error;
  }

  function ownerCategory() {
    const { token, userId } = context();
    return ownedCategoryId({ token, userId, name: SEED.createCategory });
  }

  test('an owner creates an entry filed in their own category', async () => {
    const { token, userId } = context();
    const categoryId = await ownerCategory();
    const title = 'rls-create-owner-entry';

    try {
      const { error } = await createIn({ token, categoryId, titles: [title] });
      expect(error).toBeNull();

      const entries = await ownEntriesTitled(token, title);
      expect(entries).toHaveLength(1);
      expect(entries[0].user_id).toBe(userId);
      expect(entries[0].item_categories).toEqual([{ category_id: categoryId }]);
    } finally {
      await removeEntriesTitled(token, title);
    }
  });

  test('one entry the database refuses takes the rest of its batch with it', async () => {
    const { token } = context();
    const categoryId = await ownerCategory();
    const title = 'rls-create-batch-survivor';

    try {
      const { error } = await createIn({
        token,
        categoryId,
        titles: [title, '   '],
      });
      expect(error).toMatchObject({
        code: '23502',
        message:
          'null value in column "title" of relation "items" violates not-null constraint',
      });
      expect(await ownEntriesTitled(token, title)).toEqual([]);
    } finally {
      await removeEntriesTitled(token, title);
    }
  });

  // The two-request create left exactly this behind: the caller's own entry, in no category.
  test('a caller with no grant is refused, and left with no entry in no category', async () => {
    const { otherToken } = context();
    const categoryId = await ownerCategory();
    const title = 'rls-create-stranger-entry';

    try {
      const { error } = await createIn({
        token: otherToken,
        categoryId,
        titles: [title],
      });
      expect(error).toMatchObject({
        code: 'P0001',
        message: 'cross-tenant assignment is not allowed',
      });
      expect(await ownEntriesTitled(otherToken, title)).toEqual([]);
    } finally {
      await removeEntriesTitled(otherToken, title);
    }
  });

  test('a viewer is refused, and left with no entry in no category', async () => {
    const { token, otherToken } = context();
    const categoryId = await ownerCategory();
    const title = 'rls-create-viewer-entry';
    const shareId = await viewerShare(token, categoryId);

    try {
      const { error } = await createIn({
        token: otherToken,
        categoryId,
        titles: [title],
      });
      expect(error).toMatchObject({
        code: 'P0001',
        message: 'cross-tenant assignment is not allowed',
      });
      expect(await ownEntriesTitled(otherToken, title)).toEqual([]);
    } finally {
      await unshare(token, shareId);
      await removeEntriesTitled(otherToken, title);
    }
  });

  test("an editor creates an entry in the shared category, and it is the editor's row", async () => {
    const { token, otherToken, otherUserId } = context();
    const categoryId = await ownerCategory();
    const title = 'rls-create-editor-entry';
    const shareId = await editorShare(token, categoryId);

    try {
      const { error } = await createIn({
        token: otherToken,
        categoryId,
        titles: [title],
      });
      expect(error).toBeNull();

      const entries = await ownEntriesTitled(otherToken, title);
      expect(entries).toHaveLength(1);
      expect(entries[0].user_id).toBe(otherUserId);
      expect(entries[0].item_categories).toEqual([{ category_id: categoryId }]);
    } finally {
      // Removed while the grant still gives the editor write access to it.
      await removeEntriesTitled(otherToken, title);
      await unshare(token, shareId);
    }
  });

  // EXECUTE is revoked from anon, so the refusal comes before the body runs.
  test('a visitor with no session cannot call it at all', async () => {
    const categoryId = await ownerCategory();

    const { error } = await anonApi().rpc('create_items_in_category', {
      target_category_id: categoryId,
      entries: [{ title: 'rls-create-anon-entry' }],
    });

    expect(error?.code).toBe('42501');
  });
});
