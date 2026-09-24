import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import {
  apiAs,
  context,
  editorShare,
  ownedCategoryId,
  ownerEntryIn,
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
