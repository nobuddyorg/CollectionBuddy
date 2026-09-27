import { expect, test } from '../test';
import { itemsIn } from '../fixtures';
import { apiAs, context, editorShare, ownerEntryIn, unshare } from './helpers';

/** A throwaway collection of the owner's, deleted with its entries once the test is done. */
async function probeCollection(token: string, name: string) {
  const { data, error } = await apiAs(token)
    .from('categories')
    .insert({ name })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// delete_item_if_orphan runs as its owner: an entry an editor unfiles goes, and only the links the editor may delete count.
test.describe('entries an editor leaves in no collection', () => {
  test('unfiling in bulk removes those entries, and no entry filed in a collection the editor was not granted', async () => {
    const { token, userId, otherToken } = context();
    const name = `rls-orphan-bulk-${crypto.randomUUID()}`;
    const categoryId = await probeCollection(token, name);
    try {
      const first = await ownerEntryIn({
        token,
        userId,
        category: name,
        title: 'rls-orphan-bulk-first',
      });
      const second = await ownerEntryIn({
        token,
        userId,
        category: name,
        title: 'rls-orphan-bulk-second',
      });
      const { data: elsewhere } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .eq('title', itemsIn('Münzen')[0].title)
        .single();
      const probed = [first.itemId, second.itemId, elsewhere!.id];

      const shareId = await editorShare(token, categoryId);
      try {
        // One statement naming all three: RLS lets only the granted collection's links go.
        const { data: unfiled, error } = await apiAs(otherToken)
          .from('item_categories')
          .delete()
          .in('item_id', probed)
          .select('item_id');
        expect(error).toBeNull();
        expect(unfiled!.map((row) => row.item_id).sort()).toEqual(
          [first.itemId, second.itemId].sort(),
        );
      } finally {
        await unshare(token, shareId);
      }

      const { data: left } = await apiAs(token)
        .from('items')
        .select('id')
        .in('id', probed);
      expect(left).toEqual([{ id: elsewhere!.id }]);
      const { data: stillFiled } = await apiAs(token)
        .from('item_categories')
        .select('category_id')
        .eq('item_id', elsewhere!.id);
      expect(stillFiled).toHaveLength(1);
    } finally {
      await apiAs(token).from('categories').delete().eq('id', categoryId);
    }
  });

  test('unfiling one entry removes that entry alone', async () => {
    const { token, userId, otherToken } = context();
    const name = `rls-orphan-single-${crypto.randomUUID()}`;
    const categoryId = await probeCollection(token, name);
    try {
      const unfiled = await ownerEntryIn({
        token,
        userId,
        category: name,
        title: 'rls-orphan-single-unfiled',
      });
      const sibling = await ownerEntryIn({
        token,
        userId,
        category: name,
        title: 'rls-orphan-single-sibling',
      });

      const shareId = await editorShare(token, categoryId);
      try {
        const { data: deleted } = await apiAs(otherToken)
          .from('item_categories')
          .delete()
          .eq('item_id', unfiled.itemId)
          .eq('category_id', categoryId)
          .select('item_id');
        expect(deleted).toHaveLength(1);
      } finally {
        await unshare(token, shareId);
      }

      const { data: left } = await apiAs(token)
        .from('items')
        .select('id')
        .in('id', [unfiled.itemId, sibling.itemId]);
      expect(left).toEqual([{ id: sibling.itemId }]);
    } finally {
      await apiAs(token).from('categories').delete().eq('id', categoryId);
    }
  });
});
