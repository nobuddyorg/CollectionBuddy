import { createClient } from '@supabase/supabase-js';

import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import { apiAs, context } from './helpers';

// A photograph is two surfaces, the images row and the object's bytes; neither of another collector's is reachable.
test.describe('one collection cannot reach another', () => {
  // Storage has its own policies, scoped by the first path segment (owner id).
  test('their photographs cannot be listed', async () => {
    const { token, otherUserId } = context();

    const { data } = await apiAs(token)
      .storage.from('item-images')
      .list(otherUserId);
    expect(data ?? []).toEqual([]);
  });

  test('nothing can be written under their prefix', async () => {
    const { token, otherUserId } = context();

    const { error } = await apiAs(token)
      .storage.from('item-images')
      .upload(`${otherUserId}/planted.webp`, new Blob(['x']));
    expect(error).not.toBeNull();
  });

  // No item row exists for this object, so no shared policy can match: only the owner-only ones apply.
  test('only the owner lists, signs and removes an object under their prefix', async () => {
    const { token, userId, otherToken } = context();
    const folder = `${userId}/${crypto.randomUUID()}`;
    const path = `${folder}/rls-owner-only-probe.webp`;
    const owner = apiAs(token).storage.from('item-images');
    const other = apiAs(otherToken).storage.from('item-images');

    try {
      const { error: uploadError } = await owner.upload(
        path,
        new Blob(['probe'], { type: 'image/webp' }),
      );
      expect(uploadError).toBeNull();

      const { data: ownList } = await owner.list(folder);
      expect(ownList?.map((object) => object.name)).toEqual([
        'rls-owner-only-probe.webp',
      ]);
      const { error: ownSignError } = await owner.createSignedUrl(path, 60);
      expect(ownSignError).toBeNull();

      const { data: theirList } = await other.list(folder);
      expect(theirList ?? []).toEqual([]);
      const { error: theirSignError } = await other.createSignedUrl(path, 60);
      expect(theirSignError).not.toBeNull();
      const { data: theirRemoved } = await other.remove([path]);
      expect(theirRemoved ?? []).toEqual([]);
      const { error: theirUploadError } = await other.upload(
        `${folder}/planted.webp`,
        new Blob(['x'], { type: 'image/webp' }),
      );
      expect(theirUploadError).not.toBeNull();

      const { data: ownRemoved } = await owner.remove([path]);
      expect(ownRemoved?.map((object) => object.name)).toEqual([path]);
    } finally {
      await owner.remove([path]);
    }
  });

  // The images table is its own surface beside storage.objects; no seed plants a row, so this does.
  test('their photograph records cannot be listed', async () => {
    const { token, otherToken, otherUserId } = context();

    const { data: theirItem } = await apiAs(otherToken)
      .from('items')
      .select('id')
      .eq('title', SEED.other.item)
      .single();

    const { data: planted, error: insertError } = await apiAs(otherToken)
      .from('images')
      .insert({
        item_id: theirItem!.id,
        path_full: `${otherUserId}/${theirItem!.id}/rls-images-probe.webp`,
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();

    try {
      const { data } = await apiAs(token)
        .from('images')
        .select('id')
        .eq('item_id', theirItem!.id);
      expect(data).toEqual([]);
    } finally {
      await apiAs(otherToken).from('images').delete().eq('id', planted!.id);
    }
  });

  // tg_images_enforce re-derives ownership from the item, so this is refused outright, not refiled.
  test('an images row cannot be inserted for their item', async () => {
    const { token, otherToken } = context();

    const { data: theirItem } = await apiAs(otherToken)
      .from('items')
      .select('id')
      .eq('title', SEED.other.item)
      .single();

    // A conforming path (item id as second segment), so the trigger is the only thing left to refuse this.
    const { data, error } = await apiAs(token)
      .from('images')
      .insert({
        item_id: theirItem!.id,
        path_full: `planted/${theirItem!.id}/planted.webp`,
      })
      .select('id');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  // A record steers the owner's deletes, so it may only name paths whose item-id segment is its own item.
  for (const [shape, path] of [
    [
      'naming another item',
      '{uid}/99999999-9999-9999-9999-999999999999/x.webp',
    ],
    ['that does not parse at all', 'planted.webp'],
    ['reaching outside the bucket', '../../etc/passwd'],
  ] as const) {
    test(`a photograph record cannot claim a path ${shape}`, async () => {
      const { token, userId } = context();

      const { data: mine } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .eq('title', itemsIn('Münzen')[0].title)
        .single();

      const { data, error } = await apiAs(token)
        .from('images')
        .insert({
          item_id: mine!.id,
          path_full: path.replace('{uid}', userId),
        })
        .select('id');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    test(`a photograph record cannot claim a thumbnail ${shape}`, async () => {
      const { token, userId } = context();

      const { data: mine } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .eq('title', itemsIn('Münzen')[0].title)
        .single();

      const { data, error } = await apiAs(token)
        .from('images')
        .insert({
          item_id: mine!.id,
          path_full: `${userId}/${mine!.id}/rls-thumb-probe.webp`,
          path_thumb: path.replace('{uid}', userId),
        })
        .select('id');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  }

  // EXECUTE is revoked from PUBLIC, so anon is refused before the body runs; signed in, it still parses.
  test('a visitor with no session cannot call storage_item_id', async () => {
    const { token } = context();
    const anon = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const itemId = '00000000-0000-4000-8000-000000000000';
    const path = `owner/${itemId}/photo.webp`;

    const { data, error, status } = await anon.rpc('storage_item_id', { path });
    expect(data).toBeNull();
    expect(error!.code).toBe('42501');
    expect(status).toBe(401);

    const signedIn = await apiAs(token).rpc('storage_item_id', { path });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data).toBe(itemId);
  });

  test('a visitor with no session can list no photographs', async () => {
    const { otherUserId } = context();
    const anon = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const { data } = await anon.storage.from('item-images').list(otherUserId);
    expect(data ?? []).toEqual([]);
  });

  // item_categories and images carry no update policy and no update grant, so 42501, not an empty result.
  test('a photograph record cannot be updated, not even your own', async () => {
    const { token, userId } = context();

    const { data: item } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', userId)
      .eq('title', itemsIn('Münzen')[0].title)
      .single();
    const { data: planted } = await apiAs(token)
      .from('images')
      .insert({
        item_id: item!.id,
        path_full: `${userId}/${item!.id}/rls-images-update-probe.webp`,
      })
      .select('id')
      .single();

    try {
      const { data, error } = await apiAs(token)
        .from('images')
        .update({ path_thumb: 'rewritten' })
        .eq('id', planted!.id)
        .select('id');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
    } finally {
      await apiAs(token).from('images').delete().eq('id', planted!.id);
    }
  });

  // Signing a path known to exist proves the policy refuses it; list() returning [] would not.
  test('a known photograph of theirs cannot be signed', async () => {
    const { token, otherToken, otherUserId } = context();

    const path = `${otherUserId}/rls-signed-url-probe.webp`;
    // Typed Blob: the bucket restricts allowed_mime_types, and an untyped one would be refused on that alone.
    const { error: uploadError } = await apiAs(otherToken)
      .storage.from('item-images')
      .upload(path, new Blob(['probe'], { type: 'image/webp' }));
    expect(uploadError).toBeNull();

    try {
      const { data, error } = await apiAs(token)
        .storage.from('item-images')
        .createSignedUrl(path, 60);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    } finally {
      await apiAs(otherToken).storage.from('item-images').remove([path]);
    }
  });
});
