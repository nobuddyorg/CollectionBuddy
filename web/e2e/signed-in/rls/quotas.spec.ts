import { expect, test } from '../test';
import { SEED } from '../fixtures';
import { clearCollection, freshCollector } from '../collectors';
import {
  apiAs,
  context,
  ownedCategoryId,
  seededEntryId,
  share,
  unshare,
} from './helpers';

// Each over-the-limit write is one statement refused whole, so nothing persists for parallel specs to see.
test.describe('per-owner quotas', () => {
  test('a write that would pass 50,000 entries is refused, with the quota code', async () => {
    const { token } = context();

    const { error } = await apiAs(token)
      .from('items')
      .insert(Array.from({ length: 50_001 }, () => ({ title: 'q' })));

    expect(error?.code).toBe('PT507');
    expect(error?.message).toBe('entry quota of 50000 reached');
  });

  // The form and the import create entries through create_items_in_category; each entry is the caller's own row, so the caller's ceiling applies.
  test('entries created in a shared collection meet the caller’s own ceiling, owner and editor alike', async ({}, testInfo) => {
    test.setTimeout(120_000);
    // Collectors of their own, filled to just under the ceiling, so an app-sized batch crosses it without touching another spec.
    const { password } = SEED.entryQuota;
    const collector = async (role: string) => {
      const email = `e2e-entry-quota-${role}-${testInfo.parallelIndex}@collectionbuddy.test`;
      return freshCollector(email, password);
    };
    const owner = await collector('owner');
    const editor = await collector('editor');
    const fill = async (token: string) => {
      for (let batch = 0; batch < 5; batch += 1) {
        const { error } = await apiAs(token)
          .from('items')
          .insert(Array.from({ length: 9_990 }, () => ({ title: 'fill' })));
        if (error) throw error;
      }
    };

    const { data: category, error: categoryError } = await apiAs(owner.token)
      .from('categories')
      .insert({ name: 'quota-rpc-probe' })
      .select('id')
      .single();
    if (categoryError) throw categoryError;
    const shareId = await share({
      token: owner.token,
      categoryId: category.id,
      invitedEmail: editor.email,
      role: 'editor',
    });
    const create = (callerToken: string, count: number) =>
      apiAs(callerToken).rpc('create_items_in_category', {
        target_category_id: category.id,
        entries: Array.from({ length: count }, (_, i) => ({
          title: `quota-rpc ${i}`,
        })),
      });

    try {
      await fill(owner.token);
      await fill(editor.token);

      for (const callerToken of [owner.token, editor.token]) {
        const { error } = await create(callerToken, 51);
        expect(error?.code).toBe('PT507');
        expect(error?.message).toBe('entry quota of 50000 reached');
      }

      // 49,950 plus 50 is exactly the ceiling.
      const { error } = await create(editor.token, 50);
      expect(error).toBeNull();
      const { data: created } = await apiAs(editor.token)
        .from('items')
        .select('user_id')
        .like('title', 'quota-rpc %');
      expect(created).toHaveLength(50);
      expect(new Set(created!.map((item) => item.user_id))).toEqual(
        new Set([editor.userId]),
      );
    } finally {
      // The editor's entries go while the grant still gives it write access to them.
      const { error: editorError } = await apiAs(editor.token)
        .from('items')
        .delete()
        .eq('user_id', editor.userId);
      if (editorError) throw editorError;
      await unshare(owner.token, shareId);
      await clearCollection(owner.client, owner.userId);
    }
  });

  test('photographs that would pass 256 MiB are refused, however small the client says they are', async () => {
    const { otherToken, otherUserId } = context();
    const itemId = await seededEntryId({
      token: otherToken,
      ownerId: otherUserId,
      title: SEED.other.item,
    });

    // A row with nothing stored behind it counts as the bucket's 5 MiB cap, so 52 pass 256 MiB.
    const { error } = await apiAs(otherToken)
      .from('images')
      .insert(
        Array.from({ length: 52 }, (_, i) => ({
          item_id: itemId,
          path_full: `${otherUserId}/${itemId}/quota-probe-${i}.webp`,
          size_bytes: 1,
        })),
      );

    expect(error?.code).toBe('PT507');
    expect(error?.message).toBe('photo storage quota of 256 MiB reached');
  });

  test('a photograph and its thumbnail are recorded at the sizes Storage holds, not the size claimed', async () => {
    const { token, userId } = context();
    const { data: item } = await apiAs(token)
      .from('items')
      .insert({ title: `Quota size probe ${Date.now()}` })
      .select('id')
      .single();
    const path = `${userId}/${item!.id}/size-probe.png`;
    const thumbPath = `${userId}/${item!.id}/size-probe.thumb.png`;
    const bytes = new Uint8Array(1234);
    const thumbBytes = new Uint8Array(567);

    try {
      for (const [target, content] of [
        [path, bytes],
        [thumbPath, thumbBytes],
      ] as const) {
        const { error: uploadError } = await apiAs(token)
          .storage.from('item-images')
          .upload(target, new Blob([content], { type: 'image/png' }));
        expect(uploadError).toBeNull();
      }

      const { data: row, error } = await apiAs(token)
        .from('images')
        .insert({
          item_id: item!.id,
          path_full: path,
          path_thumb: thumbPath,
          size_bytes: 1,
        })
        .select('size_bytes, thumb_size_bytes')
        .single();

      expect(error).toBeNull();
      expect(row).toEqual({
        size_bytes: bytes.length,
        thumb_size_bytes: thumbBytes.length,
      });
    } finally {
      await apiAs(token).storage.from('item-images').remove([path, thumbPath]);
      await apiAs(token).from('items').delete().eq('id', item!.id);
    }
  });

  test('a write that would pass 1,000 categories is refused, with the quota code', async () => {
    const { otherToken } = context();

    const { error } = await apiAs(otherToken)
      .from('categories')
      .insert(
        Array.from({ length: 1001 }, (_, i) => ({ name: `quota-probe-${i}` })),
      );

    expect(error?.code).toBe('PT507');
    expect(error?.message).toBe('category quota of 1000 reached');
  });

  test('a write that would pass 1,000 shares is refused, with the quota code', async () => {
    const { otherToken, otherUserId } = context();
    const categoryId = await ownedCategoryId({
      token: otherToken,
      userId: otherUserId,
      name: SEED.other.category,
    });

    const { error } = await apiAs(otherToken)
      .from('category_shares')
      .insert(
        Array.from({ length: 1001 }, (_, i) => ({
          category_id: categoryId,
          invited_email: `quota-probe-${i}@collectionbuddy.test`,
        })),
      );

    expect(error?.code).toBe('PT507');
    expect(error?.message).toBe('share quota of 1000 reached');
  });

  test('an entry belongs to one collection: a second one is refused', async () => {
    const { otherToken } = context();
    const api = apiAs(otherToken);
    const { data: categories, error: categoriesError } = await api
      .from('categories')
      .insert([{ name: 'link-probe-home' }, { name: 'link-probe-second' }])
      .select('id');
    expect(categoriesError).toBeNull();
    const { data: item } = await api
      .from('items')
      .insert({ title: 'Link quota probe' })
      .select('id')
      .single();

    try {
      const [home, second] = categories!;
      const { error: homeError } = await api
        .from('item_categories')
        .insert({ item_id: item!.id, category_id: home.id });
      expect(homeError).toBeNull();

      const { error } = await api
        .from('item_categories')
        .insert({ item_id: item!.id, category_id: second.id });
      expect(error?.code).toBe('PT507');
      expect(error?.message).toBe('an entry belongs to one collection');
    } finally {
      await api
        .from('categories')
        .delete()
        .in(
          'id',
          categories!.map((category) => category.id),
        );
      await api.from('items').delete().eq('id', item!.id);
    }
  });

  test('text past its ceiling is refused, whatever the form would have allowed', async () => {
    const { token } = context();

    const { error } = await apiAs(token)
      .from('items')
      .insert({ title: 'Text probe', description: 'd'.repeat(10_001) });
    expect(error?.code).toBe('23514');

    const { error: tagError } = await apiAs(token)
      .from('items')
      .insert({ title: 'Tag probe', tags: ['short', 't'.repeat(101)] });
    expect(tagError?.code).toBe('23514');
  });
});
