import { expect, test } from '../test';
import { itemsIn } from '../fixtures';
import { apiAs, context, editorShare, ownerEntryIn, unshare } from './helpers';

// An editor's photographs, and the owner's prefix and objects that stay out of the editor's reach.
test.describe('a category shared at the editor role', () => {
  // A thumbnail naming the owner's photograph elsewhere is a path the owner's own client would delete.
  test('an editor cannot plant a thumbnail naming the owner’s photograph elsewhere', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      title: 'rls-editor-thumb-probe',
    });
    const shareId = await editorShare(token, categoryId);
    const { data: elsewhere } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', userId)
      .eq('title', itemsIn('Münzen')[0].title)
      .single();

    try {
      const { data, error } = await apiAs(otherToken)
        .from('images')
        .insert({
          item_id: itemId,
          path_full: `${otherUserId}/${itemId}/rls-thumb-plant.webp`,
          path_thumb: `${userId}/${elsewhere!.id}/victim.webp`,
        })
        .select('id');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    } finally {
      await unshare(token, shareId);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });

  // The images row and the object's bytes are separate policies with separate join paths.
  test('an editor photographs a shared entry, on both surfaces', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      title: 'rls-editor-photo-probe',
    });
    const shareId = await editorShare(token, categoryId);
    // An editor's upload lands under the editor's own uid prefix, the only path an insert policy admits.
    const path = `${otherUserId}/${itemId}/rls-editor-probe.webp`;

    try {
      const { error: uploadError } = await apiAs(otherToken)
        .storage.from('item-images')
        .upload(path, new Blob(['probe'], { type: 'image/webp' }));
      expect(uploadError).toBeNull();

      const { data: signed, error: signError } = await apiAs(otherToken)
        .storage.from('item-images')
        .createSignedUrl(path, 60);
      expect(signError).toBeNull();
      expect(signed).not.toBeNull();

      const { data: row, error: rowError } = await apiAs(otherToken)
        .from('images')
        .insert({ item_id: itemId, path_full: path })
        .select('id,user_id')
        .single();
      expect(rowError).toBeNull();
      // tg_images_enforce files the row under the item's owner, whoever uploaded the bytes.
      expect(row!.user_id).toBe(userId);

      const { data: removedRow } = await apiAs(otherToken)
        .from('images')
        .delete()
        .eq('id', row!.id)
        .select('id');
      expect(removedRow).toHaveLength(1);
    } finally {
      await apiAs(otherToken).storage.from('item-images').remove([path]);
      await unshare(token, shareId);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });

  // move() is denied only by the missing UPDATE policy on storage.objects, hence asserted through the API.
  test('an editor cannot move the owner photograph out of the owner prefix', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      title: 'rls-editor-move-probe',
    });
    const path = `${userId}/${itemId}/rls-editor-move-probe.webp`;
    const stolen = `${otherUserId}/${itemId}/stolen.webp`;
    const shareId = await editorShare(token, categoryId);

    try {
      const { error: uploadError } = await apiAs(token)
        .storage.from('item-images')
        .upload(path, new Blob(['probe'], { type: 'image/webp' }));
      expect(uploadError).toBeNull();

      const { error: moveError } = await apiAs(otherToken)
        .storage.from('item-images')
        .move(path, stolen);
      expect(moveError).not.toBeNull();

      // Copying stays allowed; what matters is that the owner's own object is still where it was.
      const { data: stillThere } = await apiAs(token)
        .storage.from('item-images')
        .list(`${userId}/${itemId}`);
      expect((stillThere ?? []).map((object) => object.name)).toContain(
        'rls-editor-move-probe.webp',
      );

      // And the owner can still sign it, which `list` alone would not prove.
      const { error: signError } = await apiAs(token)
        .storage.from('item-images')
        .createSignedUrl(path, 60);
      expect(signError).toBeNull();
    } finally {
      await apiAs(otherToken).storage.from('item-images').remove([stolen]);
      await apiAs(token).storage.from('item-images').remove([path, stolen]);
      await unshare(token, shareId);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });

  // Unlike the stranger above, an editor holds a grant on this item; the owner's prefix must still refuse it.
  test('an editor cannot plant an object under the owner prefix', async () => {
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      title: 'rls-editor-plant-probe',
    });
    const planted = `${userId}/${itemId}/planted-by-the-editor.webp`;
    const shareId = await editorShare(token, categoryId);

    try {
      const { error: plantError } = await apiAs(otherToken)
        .storage.from('item-images')
        .upload(planted, new Blob(['hostile'], { type: 'image/webp' }));
      expect(plantError).not.toBeNull();

      // Satisfiable read: the owner sees her own prefix, so an empty listing is the write refused, not hidden.
      const { data: mine } = await apiAs(token)
        .storage.from('item-images')
        .list(`${userId}/${itemId}`);
      expect(mine ?? []).toEqual([]);
    } finally {
      await apiAs(otherToken).storage.from('item-images').remove([planted]);
      await apiAs(token).storage.from('item-images').remove([planted]);
      await unshare(token, shareId);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });

  // UPDATE on storage.objects is gone entirely, not merely pinned to the owner segment.
  test('an owner cannot move a photograph either, within their own prefix', async () => {
    const { token, userId } = context();
    const { itemId } = await ownerEntryIn({
      token,
      userId,
      title: 'rls-owner-move-probe',
    });
    const path = `${userId}/${itemId}/rls-owner-move-probe.webp`;
    const moved = `${userId}/${itemId}/rls-owner-moved.webp`;

    try {
      const { error: uploadError } = await apiAs(token)
        .storage.from('item-images')
        .upload(path, new Blob(['probe'], { type: 'image/webp' }));
      expect(uploadError).toBeNull();

      const { error: moveError } = await apiAs(token)
        .storage.from('item-images')
        .move(path, moved);
      expect(moveError).not.toBeNull();

      // Uploading, signing and removing, all the app does, are untouched by the missing UPDATE.
      const { error: signError } = await apiAs(token)
        .storage.from('item-images')
        .createSignedUrl(path, 60);
      expect(signError).toBeNull();
    } finally {
      await apiAs(token).storage.from('item-images').remove([path, moved]);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });
});
