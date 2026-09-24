import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import { apiAs, context, ownedCategoryId, share, unshare } from './helpers';

// SECURITY DEFINER bypasses RLS, so the RPC's own read-access check is what any cat_id meets.
const [seeded] = itemsIn(SEED.searchCategory);

test.describe('search_category_items (the search RPC)', () => {
  async function searchIn(search: {
    token: string;
    categoryId: string;
    term: string;
  }): Promise<{ titles: string[]; error: unknown }> {
    const { data, error } = await apiAs(search.token).rpc(
      'search_category_items',
      {
        cat_id: search.categoryId,
        like_pattern: `%${search.term}%`,
        page_from: 0,
        page_to: 9,
      },
    );
    return {
      titles: (data ?? []).map((row: { title: string }) => row.title),
      error,
    };
  }

  test('an owner searches their own category and finds a matching title', async () => {
    const { token, userId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.searchCategory,
    });

    const { titles, error } = await searchIn({
      token,
      categoryId,
      term: seeded.title,
    });

    expect(error).toBeNull();
    expect(titles).toContain(seeded.title);
  });

  test('a term matching nothing in the category returns an empty page, not an error', async () => {
    const { token, userId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.searchCategory,
    });

    const { titles, error } = await searchIn({
      token,
      categoryId,
      term: 'zzzznothing',
    });

    expect(error).toBeNull();
    expect(titles).toEqual([]);
  });

  // A real category, not theirs, and a term that matches in it: only the function's own check empties this.
  test('searching a category the caller has no relationship to returns nothing, not an error', async () => {
    const { token, otherToken, otherUserId } = context();
    const categoryId = await ownedCategoryId({
      token: otherToken,
      userId: otherUserId,
      name: SEED.other.category,
    });

    const { titles, error } = await searchIn({
      token,
      categoryId,
      term: SEED.other.item,
    });

    expect(error).toBeNull();
    expect(titles).toEqual([]);
  });

  test('an active grant opens search the same as it opens a plain read', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.searchCategory,
    });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });

    try {
      const { titles, error } = await searchIn({
        token: otherToken,
        categoryId,
        term: seeded.title,
      });
      expect(error).toBeNull();
      expect(titles).toContain(seeded.title);
    } finally {
      await unshare(token, shareId);
    }
  });

  test('an expired grant is refused for search, exactly like no grant at all', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.searchCategory,
    });
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
      window: { createdAt, expiresAt },
    });

    try {
      const { titles, error } = await searchIn({
        token: otherToken,
        categoryId,
        term: seeded.title,
      });
      expect(error).toBeNull();
      expect(titles).toEqual([]);
    } finally {
      await unshare(token, shareId);
    }
  });

  // The entry is still there, so this proves the grant stopped working rather than the row vanishing.
  test('revoking the grant closes search again, with the entry still there', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.searchCategory,
    });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });

    const opened = await searchIn({
      token: otherToken,
      categoryId,
      term: seeded.title,
    });
    expect(opened.titles).toContain(seeded.title);

    await unshare(token, shareId);

    const { titles, error } = await searchIn({
      token: otherToken,
      categoryId,
      term: seeded.title,
    });
    expect(error).toBeNull();
    expect(titles).toEqual([]);

    // Satisfiable as the owner: the entry itself was never touched.
    const stillThere = await searchIn({
      token,
      categoryId,
      term: seeded.title,
    });
    expect(stillThere.titles).toContain(seeded.title);
  });

  // The asymmetry editor-share.spec.ts asserts; the RPC must reproduce it despite bypassing RLS.
  test('owning the collection does not surface, through search, an entry the editor filed into it', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.searchCategory,
    });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
      role: 'editor',
    });

    const { data: mine } = await apiAs(otherToken)
      .from('items')
      .insert({ user_id: otherUserId, title: 'rls-search-invisible-entry' })
      .select('id')
      .single();

    try {
      await apiAs(otherToken)
        .from('item_categories')
        .insert({ item_id: mine!.id, category_id: categoryId });

      const { titles, error } = await searchIn({
        token,
        categoryId,
        term: 'rls-search-invisible-entry',
      });
      expect(error).toBeNull();
      expect(titles).toEqual([]);
    } finally {
      await unshare(token, shareId);
      await apiAs(otherToken).from('items').delete().eq('id', mine!.id);
    }
  });

  // i.user_id = auth.uid() covers the editor's own entry, though they hold no read grant on the category.
  test('an editor finds, through search, an entry it filed into the shared collection itself', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.searchCategory,
    });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
      role: 'editor',
    });

    const { data: mine } = await apiAs(otherToken)
      .from('items')
      .insert({ user_id: otherUserId, title: 'rls-search-editor-own-entry' })
      .select('id')
      .single();

    try {
      await apiAs(otherToken)
        .from('item_categories')
        .insert({ item_id: mine!.id, category_id: categoryId });

      const { titles, error } = await searchIn({
        token: otherToken,
        categoryId,
        term: 'rls-search-editor-own-entry',
      });
      expect(error).toBeNull();
      expect(titles).toContain('rls-search-editor-own-entry');
    } finally {
      await unshare(token, shareId);
      await apiAs(otherToken).from('items').delete().eq('id', mine!.id);
    }
  });
});
