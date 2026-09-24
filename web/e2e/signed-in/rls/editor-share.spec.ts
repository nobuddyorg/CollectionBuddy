import { expect, test } from '../test';
import { SEED } from '../fixtures';
import {
  apiAs,
  context,
  editorShare,
  ownedCategoryId,
  ownerEntryIn,
  unshare,
} from './helpers';

// What an editor grant opens: the owner's entries, and entries of the editor's own, inside one collection.
test.describe('a category shared at the editor role', () => {
  test('an editor edits and deletes the owner entries it was granted', async () => {
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.editorCategory,
      title: 'rls-editor-edit-probe',
    });
    const shareId = await editorShare(token, categoryId);

    try {
      const { data: updated } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'edited by the editor' })
        .eq('id', itemId)
        .select('id');
      expect(updated).toHaveLength(1);

      // Read back as the owner: a write accepted but hidden from its owner would be the worst outcome.
      const { data: after } = await apiAs(token)
        .from('items')
        .select('title')
        .eq('id', itemId)
        .single();
      expect(after!.title).toBe('edited by the editor');

      const { data: deleted } = await apiAs(otherToken)
        .from('items')
        .delete()
        .eq('id', itemId)
        .select('id');
      expect(deleted).toHaveLength(1);

      const { data: gone } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('id', itemId);
      expect(gone).toEqual([]);
    } finally {
      await unshare(token, shareId);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });

  // Gated by tg_item_categories_enforce, not a policy: the insert policy checks a column the trigger sets.
  test('an editor files an entry of its own into the shared collection', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorCategory,
    });
    const shareId = await editorShare(token, categoryId);

    const { data: mine, error: insertError } = await apiAs(otherToken)
      .from('items')
      .insert({ user_id: otherUserId, title: 'rls-editor-own-entry' })
      .select('id')
      .single();
    expect(insertError).toBeNull();

    try {
      const { error: linkError } = await apiAs(otherToken)
        .from('item_categories')
        .insert({ item_id: mine!.id, category_id: categoryId });
      expect(linkError).toBeNull();

      // The trigger files the link under the item's owner, not under whoever owns the category.
      const { data: link } = await apiAs(otherToken)
        .from('item_categories')
        .select('user_id')
        .eq('item_id', mine!.id)
        .single();
      expect(link!.user_id).toBe(otherUserId);
    } finally {
      await unshare(token, shareId);
      await apiAs(otherToken).from('items').delete().eq('id', mine!.id);
    }
  });

  // Deliberate asymmetry: has_category_write_access() bundles category ownership in, the read check does not.
  test('owning the collection does not reveal an entry the editor filed into it', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorCategory,
    });
    const shareId = await editorShare(token, categoryId);

    const { data: mine } = await apiAs(otherToken)
      .from('items')
      .insert({ user_id: otherUserId, title: 'rls-editor-invisible-entry' })
      .select('id')
      .single();
    const photo = `${otherUserId}/${mine!.id}/rls-editor-invisible.webp`;

    try {
      await apiAs(otherToken)
        .from('item_categories')
        .insert({ item_id: mine!.id, category_id: categoryId });

      // Satisfiable filter: the row exists and is linked here, so only the policy makes this empty.
      const { data: seen } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('id', mine!.id);
      expect(seen).toEqual([]);

      // Nor its link, its photograph record, or the photograph's bytes.
      const { data: link } = await apiAs(token)
        .from('item_categories')
        .select('item_id')
        .eq('item_id', mine!.id);
      expect(link).toEqual([]);

      const { error: uploadError } = await apiAs(otherToken)
        .storage.from('item-images')
        .upload(photo, new Blob(['probe'], { type: 'image/webp' }));
      expect(uploadError).toBeNull();
      const { error: rowError } = await apiAs(otherToken)
        .from('images')
        .insert({ item_id: mine!.id, path_full: photo });
      expect(rowError).toBeNull();

      const { data: record } = await apiAs(token)
        .from('images')
        .select('id')
        .eq('item_id', mine!.id);
      expect(record).toEqual([]);
      const { data: signed, error: signError } = await apiAs(token)
        .storage.from('item-images')
        .createSignedUrl(photo, 60);
      expect(signed).toBeNull();
      expect(signError).not.toBeNull();
    } finally {
      await apiAs(otherToken).storage.from('item-images').remove([photo]);
      await unshare(token, shareId);
      await apiAs(otherToken).from('items').delete().eq('id', mine!.id);
    }
  });
});
