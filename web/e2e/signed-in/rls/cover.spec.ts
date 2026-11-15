import { expect, test } from '../test';
import { SEED } from '../fixtures';
import { uniqueName } from '../helpers';
import {
  apiAs,
  context,
  editorShare,
  ownerEntryIn,
  seededEntryId,
  unshare,
  viewerShare,
} from './helpers';

// An entry's cover (0037, #894), straight at PostgREST with real tokens: the owner and an editor choose it, nobody else, and only among the entry's own photos.
test.describe('the cover of an entry', () => {
  /** A photo record of the entry; no bytes are needed for the cover's check. */
  async function photoOf(token: string, owner: string, itemId: string) {
    const { data, error } = await apiAs(token)
      .from('images')
      .insert({
        item_id: itemId,
        path_full: `${owner}/${itemId}/${crypto.randomUUID()}.webp`,
      } as never)
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  function chooseCover(token: string, itemId: string, imageId: string) {
    return apiAs(token)
      .from('items')
      .update({ cover_image_id: imageId })
      .eq('id', itemId)
      .select('id, cover_image_id');
  }

  async function coverOf(token: string, itemId: string) {
    const { data, error } = await apiAs(token)
      .from('items')
      .select('cover_image_id')
      .eq('id', itemId)
      .single();
    if (error) throw error;
    return data.cover_image_id;
  }

  async function removeEntries(token: string, ids: string[]) {
    const { error } = await apiAs(token).from('items').delete().in('id', ids);
    if (error) throw error;
  }

  test('the owner chooses it among the entry’s own photos, never another entry’s', async () => {
    const { token, userId } = context();
    const { itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.coverCategory,
      title: uniqueName('Titelbild'),
    });
    const { itemId: neighbourId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.coverCategory,
      title: uniqueName('Nachbar'),
    });
    try {
      await photoOf(token, userId, itemId);
      const later = await photoOf(token, userId, itemId);
      const neighbours = await photoOf(token, userId, neighbourId);

      const chosen = await chooseCover(token, itemId, later);
      expect(chosen.error).toBeNull();
      expect(chosen.data).toEqual([{ id: itemId, cover_image_id: later }]);

      const foreign = await chooseCover(token, itemId, neighbours);
      expect(foreign.error).toMatchObject({ code: '23503' });
      const nowhere = await chooseCover(token, itemId, crypto.randomUUID());
      expect(nowhere.error).toMatchObject({ code: '23503' });
      expect(await coverOf(token, itemId)).toBe(later);
    } finally {
      await removeEntries(token, [itemId, neighbourId]);
    }
  });

  test('an editor of the collection chooses it; a viewer and a stranger cannot', async () => {
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.coverCategory,
      title: uniqueName('Geteiltes Titelbild'),
    });
    try {
      const first = await photoOf(token, userId, itemId);
      const second = await photoOf(token, userId, itemId);

      // Not shared at all: RLS hides the entry, so nothing is updated.
      const stranger = await chooseCover(otherToken, itemId, second);
      expect(stranger.error).toBeNull();
      expect(stranger.data).toEqual([]);

      const viewerGrant = await viewerShare(token, categoryId);
      try {
        const viewer = await chooseCover(otherToken, itemId, second);
        expect(viewer.error).toBeNull();
        expect(viewer.data).toEqual([]);
        expect(await coverOf(token, itemId)).toBeNull();
      } finally {
        await unshare(token, viewerGrant);
      }

      const editorGrant = await editorShare(token, categoryId);
      try {
        const editor = await chooseCover(otherToken, itemId, second);
        expect(editor.error).toBeNull();
        expect(editor.data).toEqual([{ id: itemId, cover_image_id: second }]);
        expect(await coverOf(token, itemId)).toBe(second);

        // An editor's choice is bound by the same check as the owner's.
        const { otherUserId } = context();
        const ownEntry = await seededEntryId({
          token: otherToken,
          ownerId: otherUserId,
          title: SEED.other.item,
        });
        const crossed = await chooseCover(otherToken, ownEntry, first);
        expect(crossed.error).toMatchObject({ code: '23503' });
      } finally {
        await unshare(token, editorGrant);
      }
    } finally {
      await removeEntries(token, [itemId]);
    }
  });

  test('a collector cannot make another collector’s photo the cover of an entry of their own', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const { itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.coverCategory,
      title: uniqueName('Fremdes Titelbild'),
    });
    try {
      const owners = await photoOf(token, userId, itemId);
      const ownEntry = await seededEntryId({
        token: otherToken,
        ownerId: otherUserId,
        title: SEED.other.item,
      });

      const stolen = await chooseCover(otherToken, ownEntry, owners);

      expect(stolen.error).toMatchObject({ code: '23503' });
      expect(await coverOf(otherToken, ownEntry)).toBeNull();
    } finally {
      await removeEntries(token, [itemId]);
    }
  });
});
