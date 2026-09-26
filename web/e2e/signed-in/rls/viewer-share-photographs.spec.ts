import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import {
  apiAs,
  context,
  ownedCategoryId,
  ownerEntryIn,
  share,
  unshare,
} from './helpers';

// The viewer grant extended to photographs, on both surfaces, and withdrawn with it.
test.describe('a category shared with another collector', () => {
  // Photos extend the grant through item_categories; the object's path never contains the grantee's uid.
  test('a shared photograph can be read through the grant, and stops the moment it is revoked', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.viewerPhotoCategory,
    });
    const { data: item } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', userId)
      .eq('title', itemsIn(SEED.viewerPhotoCategory)[0].title)
      .single();
    const path = `${userId}/${item!.id}/rls-share-probe.webp`;

    const { error: uploadError } = await apiAs(token)
      .storage.from('item-images')
      .upload(path, new Blob(['probe'], { type: 'image/webp' }));
    expect(uploadError).toBeNull();

    try {
      const shareId = await share({
        token,
        categoryId,
        invitedEmail: SEED.other.email,
      });
      try {
        const { data, error } = await apiAs(otherToken)
          .storage.from('item-images')
          .createSignedUrl(path, 60);
        expect(error).toBeNull();
        expect(data).not.toBeNull();
      } finally {
        await unshare(token, shareId);
      }

      // The grant is gone; the object is not, so this is the revocation itself being checked.
      const { data: after, error: afterError } = await apiAs(otherToken)
        .storage.from('item-images')
        .createSignedUrl(path, 60);
      expect(after).toBeNull();
      expect(afterError).not.toBeNull();
    } finally {
      await apiAs(token).storage.from('item-images').remove([path]);
    }
  });

  test('a photograph cannot be signed through an expired grant, nor from the owner’s unshared category', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.viewerPhotoCategory,
    });
    const idOf = async (title: string) => {
      const { data } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .eq('title', title)
        .single();
      return data!.id;
    };
    const shared = `${userId}/${await idOf(itemsIn(SEED.viewerPhotoCategory)[0].title)}/rls-expiry-probe.webp`;
    const sibling = `${userId}/${await idOf(itemsIn('Briefmarken')[0].title)}/rls-sibling-probe.webp`;
    const storage = apiAs(token).storage.from('item-images');
    for (const path of [shared, sibling]) {
      const { error } = await storage.upload(
        path,
        new Blob(['probe'], { type: 'image/webp' }),
      );
      expect(error).toBeNull();
    }
    const sign = (path: string) =>
      apiAs(otherToken).storage.from('item-images').createSignedUrl(path, 60);

    try {
      const expiredId = await share({
        token,
        categoryId,
        invitedEmail: SEED.other.email,
        window: {
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      });
      try {
        const { data, error } = await sign(shared);
        expect(data).toBeNull();
        expect(error).not.toBeNull();
      } finally {
        await unshare(token, expiredId);
      }

      const activeId = await share({
        token,
        categoryId,
        invitedEmail: SEED.other.email,
      });
      try {
        // The grant is live, so the refusal below is its scope, not its absence.
        expect((await sign(shared)).error).toBeNull();
        const { data, error } = await sign(sibling);
        expect(data).toBeNull();
        expect(error).not.toBeNull();
      } finally {
        await unshare(token, activeId);
      }
    } finally {
      await storage.remove([shared, sibling]);
    }
  });

  // The images select policy joins through item_categories by item_id rather than parsing a path.
  test('a shared photograph record can be read through the grant, and stops the moment it is revoked', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.viewerPhotoCategory,
    });
    const { data: item } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', userId)
      .eq('title', itemsIn(SEED.viewerPhotoCategory)[0].title)
      .single();

    const { data: planted, error: insertError } = await apiAs(token)
      .from('images')
      .insert({
        item_id: item!.id,
        path_full: `${userId}/${item!.id}/rls-share-images-probe.webp`,
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();

    try {
      const shareId = await share({
        token,
        categoryId,
        invitedEmail: SEED.other.email,
      });
      try {
        const { data } = await apiAs(otherToken)
          .from('images')
          .select('id')
          .eq('id', planted!.id);
        expect(data).toHaveLength(1);
      } finally {
        await unshare(token, shareId);
      }

      // The grant is gone; the row is not, so this is the revocation itself being checked.
      const { data: after } = await apiAs(otherToken)
        .from('images')
        .select('id')
        .eq('id', planted!.id);
      expect(after).toEqual([]);
    } finally {
      await apiAs(token).from('images').delete().eq('id', planted!.id);
    }
  });

  // Each surface is its own delete policy; the link's delete also sweeps the orphaned entry (delete_item_if_orphan).
  test('neither a stranger nor a viewer removes a photograph, its record or the entry’s link', async () => {
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.viewerPhotoCategory,
      title: 'rls-viewer-remove-probe',
    });
    const path = `${userId}/${itemId}/rls-viewer-remove-probe.webp`;
    const owner = apiAs(token);
    const other = apiAs(otherToken);
    let shareId = '';

    const removalsRefused = async () => {
      const { data: removedObjects } = await other.storage
        .from('item-images')
        .remove([path]);
      expect(removedObjects ?? []).toEqual([]);
      const { data: removedRecord } = await other
        .from('images')
        .delete()
        .eq('item_id', itemId)
        .select('id');
      expect(removedRecord).toEqual([]);
      const { data: unlinked } = await other
        .from('item_categories')
        .delete()
        .eq('item_id', itemId)
        .select('item_id');
      expect(unlinked).toEqual([]);

      // Read back as the owner: all three are still there.
      const { data: after } = await owner
        .from('items')
        .select('images(path_full),item_categories(category_id)')
        .eq('id', itemId)
        .single();
      expect(after).toEqual({
        images: [{ path_full: path }],
        item_categories: [{ category_id: categoryId }],
      });
      const { error: signError } = await owner.storage
        .from('item-images')
        .createSignedUrl(path, 60);
      expect(signError).toBeNull();
    };

    try {
      const { error: uploadError } = await owner.storage
        .from('item-images')
        .upload(path, new Blob(['probe'], { type: 'image/webp' }));
      expect(uploadError).toBeNull();
      const { error: recordError } = await owner
        .from('images')
        .insert({ item_id: itemId, path_full: path });
      expect(recordError).toBeNull();

      await removalsRefused();

      shareId = await share({
        token,
        categoryId,
        invitedEmail: SEED.other.email,
      });
      // Satisfiable: the viewer reads the record, the link and the bytes, so an empty delete is the delete policy.
      const { data: seen } = await other
        .from('items')
        .select('images(id),item_categories(item_id)')
        .eq('id', itemId)
        .single();
      expect(seen!.images).toHaveLength(1);
      expect(seen!.item_categories).toHaveLength(1);
      expect(
        (await other.storage.from('item-images').createSignedUrl(path, 60))
          .error,
      ).toBeNull();

      await removalsRefused();
    } finally {
      if (shareId) await unshare(token, shareId);
      await owner.storage.from('item-images').remove([path]);
      await owner.from('items').delete().eq('id', itemId);
    }
  });

  // An own-prefix upload names the entry in its second segment, so it is refused under an entry the caller may only read (0021).
  test('a viewer cannot add a photograph to a shared entry, on either surface', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.viewerPhotoCategory,
      title: 'rls-viewer-add-probe',
    });
    const path = `${otherUserId}/${itemId}/rls-viewer-add-probe.webp`;
    const viewer = apiAs(otherToken);
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });

    try {
      const { data: seen } = await viewer
        .from('items')
        .select('id')
        .eq('id', itemId);
      expect(seen).toHaveLength(1);

      const { error: uploadError } = await viewer.storage
        .from('item-images')
        .upload(path, new Blob(['probe'], { type: 'image/webp' }));
      expect(uploadError).not.toBeNull();

      const { data: record, error: recordError } = await viewer
        .from('images')
        .insert({ item_id: itemId, path_full: path })
        .select('id');
      expect(record).toBeNull();
      expect(recordError).not.toBeNull();

      // Its own prefix, so listable to it: empty is the refused upload, not a hidden object.
      const { data: listed } = await viewer.storage
        .from('item-images')
        .list(`${otherUserId}/${itemId}`);
      expect(listed ?? []).toEqual([]);
      const { data: records } = await apiAs(token)
        .from('images')
        .select('id')
        .eq('item_id', itemId);
      expect(records).toEqual([]);
    } finally {
      await unshare(token, shareId);
      await viewer.storage.from('item-images').remove([path]);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });
});
