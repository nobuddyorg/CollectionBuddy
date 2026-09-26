import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import {
  apiAs,
  context,
  editorShare,
  entryFiledBy,
  ownedCategoryId,
  ownerEntryIn,
  removeFiledEntry,
  share,
  unshare,
} from './helpers';

// Where the editor role stops: the collection itself, other collections, and a grant that has ended.
test.describe('a category shared at the editor role', () => {
  // The line the role stops at: item content, never the collection itself.
  test('an editor cannot rename or delete the collection', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorLimitsCategory,
    });
    const shareId = await editorShare(token, categoryId);

    try {
      const { data: renamed } = await apiAs(otherToken)
        .from('categories')
        .update({ name: 'taken over' })
        .eq('id', categoryId)
        .select('id');
      expect(renamed).toEqual([]);

      const { data: deleted } = await apiAs(otherToken)
        .from('categories')
        .delete()
        .eq('id', categoryId)
        .select('id');
      expect(deleted).toEqual([]);

      const { data: after } = await apiAs(token)
        .from('categories')
        .select('name')
        .eq('id', categoryId)
        .single();
      expect(after!.name).toBe(SEED.editorLimitsCategory);
    } finally {
      await unshare(token, shareId);
    }
  });

  test('an editor cannot promote itself or issue a grant of its own', async () => {
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorLimitsCategory,
    });
    // Issued as a viewer, so a successful self-promotion shows as a role change, not a no-op.
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });

    try {
      const { data: promoted } = await apiAs(otherToken)
        .from('category_shares')
        .update({ role: 'editor' })
        .eq('id', shareId)
        .select('id');
      expect(promoted).toEqual([]);

      // Still a viewer, read back as the owner.
      const { data: after } = await apiAs(token)
        .from('category_shares')
        .select('role')
        .eq('id', shareId)
        .single();
      expect(after!.role).toBe('viewer');

      // tg_category_shares_enforce re-derives the owner from the category, so an error, not an empty result.
      const { error: passedOn } = await apiAs(otherToken)
        .from('category_shares')
        .insert({
          category_id: categoryId,
          owner_user_id: otherUserId,
          invited_email: 'nobody-invited@collectionbuddy.test',
          role: 'editor',
        });
      expect(passedOn).not.toBeNull();
    } finally {
      await unshare(token, shareId);
    }
  });

  test('an editor reaches no further than the one collection granted', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorLimitsCategory,
    });
    const shareId = await editorShare(token, categoryId);

    try {
      const { data: elsewhere } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .eq('title', itemsIn('Münzen')[0].title)
        .single();

      const { data: updated } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'taken over' })
        .eq('id', elsewhere!.id)
        .select('id');
      expect(updated).toEqual([]);

      const { data: unshared } = await apiAs(otherToken)
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', 'Briefmarken');
      expect(unshared).toEqual([]);
    } finally {
      await unshare(token, shareId);
    }
  });

  // Asserted with the entry still present, so this is the revocation and not a row that stopped existing.
  test('a revoked editor can no longer write, with the entry still there', async () => {
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.editorLimitsCategory,
      title: 'rls-editor-revoked-probe',
    });

    try {
      const shareId = await editorShare(token, categoryId);
      const { data: whileGranted } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'edited while granted' })
        .eq('id', itemId)
        .select('id');
      expect(whileGranted).toHaveLength(1);
      await unshare(token, shareId);

      const { data: afterRevoke } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'edited after revocation' })
        .eq('id', itemId)
        .select('id');
      expect(afterRevoke).toEqual([]);

      const { data: after } = await apiAs(token)
        .from('items')
        .select('title')
        .eq('id', itemId)
        .single();
      expect(after!.title).toBe('edited while granted');
    } finally {
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });

  // The entry stays the editor's own row, so only the grant, not ownership, may decide its writes (#739).
  test('a revoked editor can no longer write the entry it filed, with the entry still there', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorLimitsCategory,
    });
    const shareId = await editorShare(token, categoryId);
    const itemId = await entryFiledBy(
      { token: otherToken, categoryId },
      'rls-filed-revoked-probe',
    );

    try {
      await unshare(token, shareId);
      const formerEditor = apiAs(otherToken);

      const { data: updated } = await formerEditor
        .from('items')
        .update({ title: 'edited after revocation' })
        .eq('id', itemId)
        .select('id');
      expect(updated).toEqual([]);

      const { data: unlinked } = await formerEditor
        .from('item_categories')
        .delete()
        .eq('item_id', itemId)
        .select('item_id');
      expect(unlinked).toEqual([]);

      const { data: deleted } = await formerEditor
        .from('items')
        .delete()
        .eq('id', itemId)
        .select('id');
      expect(deleted).toEqual([]);

      // Its own row, so still readable to it: an empty write above is the revocation, not a hidden row.
      const { data: after } = await formerEditor
        .from('items')
        .select('title,item_categories(category_id)')
        .eq('id', itemId)
        .single();
      expect(after).toEqual({
        title: 'rls-filed-revoked-probe',
        item_categories: [{ category_id: categoryId }],
      });
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

  test('an editor demoted to viewer reads the entry it filed but no longer writes it', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorLimitsCategory,
    });
    const shareId = await editorShare(token, categoryId);
    const itemId = await entryFiledBy(
      { token: otherToken, categoryId },
      'rls-filed-demoted-probe',
    );

    try {
      const { error: demoteError } = await apiAs(token)
        .from('category_shares')
        .update({ role: 'viewer' })
        .eq('id', shareId);
      expect(demoteError).toBeNull();

      const { data: updated } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'edited as a viewer' })
        .eq('id', itemId)
        .select('id');
      expect(updated).toEqual([]);

      const { data: deleted } = await apiAs(otherToken)
        .from('items')
        .delete()
        .eq('id', itemId)
        .select('id');
      expect(deleted).toEqual([]);

      const { data: after } = await apiAs(otherToken)
        .from('items')
        .select('title')
        .eq('id', itemId)
        .single();
      expect(after!.title).toBe('rls-filed-demoted-probe');
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

  test('an expired editor grant writes no more than no grant at all', async () => {
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn({
      token,
      userId,
      category: SEED.editorLimitsCategory,
      title: 'rls-editor-expired-probe',
    });
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
      role: 'editor',
      window: { createdAt, expiresAt },
    });

    try {
      const { data: updated } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'edited by an expired editor' })
        .eq('id', itemId)
        .select('id');
      expect(updated).toEqual([]);

      const { data: after } = await apiAs(token)
        .from('items')
        .select('title')
        .eq('id', itemId)
        .single();
      expect(after!.title).toBe('rls-editor-expired-probe');
    } finally {
      await unshare(token, shareId);
      await apiAs(token).from('items').delete().eq('id', itemId);
    }
  });

  // Deliberate: "delete own or invited category_shares" lets the grantee leave, ending only its own access.
  test('an editor may leave the share, which ends its own access', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.editorLimitsCategory,
    });
    const shareId = await editorShare(token, categoryId);

    let left = false;
    try {
      const { data: removed } = await apiAs(otherToken)
        .from('category_shares')
        .delete()
        .eq('id', shareId)
        .select('id');
      expect(removed).toHaveLength(1);
      left = true;

      const { data: seen } = await apiAs(otherToken)
        .from('categories')
        .select('id')
        .eq('id', categoryId);
      expect(seen).toEqual([]);
    } finally {
      if (!left) await unshare(token, shareId);
    }
  });
});
