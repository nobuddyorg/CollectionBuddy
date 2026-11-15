import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import {
  apiAs,
  context,
  editorShare,
  entryFiledBy,
  expiredWindow,
  ownedCategoryId,
  ownerEntryIn,
  removeFiledEntry,
  share,
  unshare,
  viewerShare,
} from './helpers';

// SECURITY DEFINER bypasses RLS, so the RPC's own read-access check is what any cat_id meets.
const [seeded] = itemsIn(SEED.searchCategory);

// search_category_entries is the app's search since 0038; search_category_items answers the previous bundle until it goes, so both meet every case.
for (const rpc of [
  'search_category_entries',
  'search_category_items',
] as const) {
  test.describe(`${rpc} (the search RPC)`, () => {
    async function searchIn(search: {
      token: string;
      categoryId: string;
      term: string;
    }): Promise<{ titles: string[]; error: unknown }> {
      const { data, error } = await apiAs(search.token).rpc(rpc, {
        cat_id: search.categoryId,
        like_pattern: `%${search.term}%`,
        page_from: 0,
        page_to: 9,
      });
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
      const shareId = await viewerShare(token, categoryId);

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
      const shareId = await share({
        token,
        categoryId,
        invitedEmail: SEED.other.email,
        window: expiredWindow(),
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
      const shareId = await viewerShare(token, categoryId);

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

    // The photographs ride along with RLS bypassed, so each identity must get exactly what the images policy lets it read.
    test("a searched entry carries exactly the photograph records the caller may read directly, the grantee's included", async () => {
      const { token, userId, otherToken } = context();
      const title = 'rls-search-photographed-entry';
      const { categoryId, itemId } = await ownerEntryIn({
        token,
        userId,
        category: SEED.searchCategory,
        title,
      });
      const { error: photoError } = await apiAs(token)
        .from('images')
        .insert(
          [1, 2].map((n) => ({
            item_id: itemId,
            path_full: `${userId}/${itemId}/rls-search-${n}.webp`,
          })),
        );
      expect(photoError).toBeNull();
      const shareId = await viewerShare(token, categoryId);

      // The RPC's own rows next to what a plain, RLS-scoped read hands the same identity.
      const carriedAndDirect = async (caller: string) => {
        const { data, error } = await apiAs(caller).rpc(
          'search_category_items',
          {
            cat_id: categoryId,
            like_pattern: `%${title}%`,
            page_from: 0,
            page_to: 9,
          },
        );
        expect(error).toBeNull();
        const { data: direct, error: directError } = await apiAs(caller)
          .from('images')
          .select('id, item_id, path_full, path_thumb')
          .eq('item_id', itemId)
          .order('created_at')
          .order('id');
        expect(directError).toBeNull();
        return {
          carried: (data ?? []).flatMap(
            (row: { images: unknown[] }) => row.images,
          ),
          direct,
        };
      };

      try {
        for (const caller of [token, otherToken]) {
          const { carried, direct } = await carriedAndDirect(caller);
          expect(direct).toHaveLength(2);
          expect(carried).toEqual(direct);
        }

        await unshare(token, shareId);
        const revoked = await carriedAndDirect(otherToken);
        expect(revoked).toEqual({ carried: [], direct: [] });
      } finally {
        await unshare(token, shareId);
        await apiAs(token).from('items').delete().eq('id', itemId);
      }
    });

    // The asymmetry editor-share.spec.ts asserts; the RPC must reproduce it despite bypassing RLS.
    test('owning the collection does not surface, through search, an entry the editor filed into it', async () => {
      const { token, userId, otherToken } = context();
      const categoryId = await ownedCategoryId({
        token,
        userId,
        name: SEED.searchCategory,
      });
      const shareId = await editorShare(token, categoryId);
      const itemId = await entryFiledBy(
        { token: otherToken, categoryId },
        'rls-search-invisible-entry',
      );

      try {
        const { titles, error } = await searchIn({
          token,
          categoryId,
          term: 'rls-search-invisible-entry',
        });
        expect(error).toBeNull();
        expect(titles).toEqual([]);
      } finally {
        await unshare(token, shareId);
        await removeFiledEntry({
          token,
          otherToken,
          categoryId,
          itemId,
          paths: [],
        });
      }
    });

    // i.user_id = auth.uid() covers the editor's own entry, though they hold no read grant on the category.
    test('an editor finds, through search, an entry it filed into the shared collection itself', async () => {
      const { token, userId, otherToken } = context();
      const categoryId = await ownedCategoryId({
        token,
        userId,
        name: SEED.searchCategory,
      });
      const shareId = await editorShare(token, categoryId);
      const itemId = await entryFiledBy(
        { token: otherToken, categoryId },
        'rls-search-editor-own-entry',
      );

      try {
        const { titles, error } = await searchIn({
          token: otherToken,
          categoryId,
          term: 'rls-search-editor-own-entry',
        });
        expect(error).toBeNull();
        expect(titles).toContain('rls-search-editor-own-entry');
      } finally {
        await unshare(token, shareId);
        await removeFiledEntry({
          token,
          otherToken,
          categoryId,
          itemId,
          paths: [],
        });
      }
    });
  });
}

// The map's "Show in list" (0038): a place and no text at all, so the function's own access check is all that stands in the way.
test.describe('search_category_entries narrowed to one place', () => {
  async function atPlace(search: {
    token: string;
    categoryId: string;
    place: string;
  }): Promise<{ titles: string[]; error: unknown }> {
    const { data, error } = await apiAs(search.token).rpc(
      'search_category_entries',
      {
        cat_id: search.categoryId,
        at_place: search.place,
        page_from: 0,
        page_to: 9,
      },
    );
    return {
      titles: (data ?? []).map((row: { title: string }) => row.title),
      error,
    };
  }

  /** An entry of the owner's at a place no seeded entry shares. */
  async function placedEntry(token: string, userId: string) {
    const place = `Ortsprobe ${crypto.randomUUID()}`;
    const title = `Am Ort ${crypto.randomUUID()}`;
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.searchCategory,
      title,
    });
    const { error } = await apiAs(token)
      .from('items')
      .update({ place })
      .eq('id', itemId);
    if (error) throw error;
    return { categoryId, itemId, place, title };
  }

  async function removeEntry(token: string, itemId: string) {
    const { error } = await apiAs(token)
      .from('items')
      .delete()
      .eq('id', itemId);
    if (error) throw error;
  }

  test('finds exactly the entries at that place, for the owner and a viewer alike', async () => {
    const { token, userId, otherToken } = context();
    const entry = await placedEntry(token, userId);
    try {
      const own = await atPlace({ token, ...entry });
      expect(own.error).toBeNull();
      expect(own.titles).toEqual([entry.title]);

      const shareId = await viewerShare(token, entry.categoryId);
      try {
        const viewer = await atPlace({ token: otherToken, ...entry });
        expect(viewer.error).toBeNull();
        expect(viewer.titles).toEqual([entry.title]);
      } finally {
        await unshare(token, shareId);
      }
    } finally {
      await removeEntry(token, entry.itemId);
    }
  });

  test('gives a caller with no grant nothing at the place, not an error', async () => {
    const { token, userId, otherToken } = context();
    const entry = await placedEntry(token, userId);
    try {
      const stranger = await atPlace({ token: otherToken, ...entry });
      expect(stranger.error).toBeNull();
      expect(stranger.titles).toEqual([]);
    } finally {
      await removeEntry(token, entry.itemId);
    }
  });

  test('matches the place exactly, never as a search: part of it finds nothing', async () => {
    const { token, userId } = context();
    const entry = await placedEntry(token, userId);
    try {
      const partial = await atPlace({
        token,
        ...entry,
        place: entry.place.slice(0, 9),
      });
      expect(partial.error).toBeNull();
      expect(partial.titles).toEqual([]);
    } finally {
      await removeEntry(token, entry.itemId);
    }
  });
});
