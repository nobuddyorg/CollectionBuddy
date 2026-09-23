import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import { apiAs, context, ownedCategoryId, share, unshare } from './helpers';

// Münzen is a read-only fixture for the rest of the suite, so each case issues and revokes its own grant.
test.describe('a category shared with another collector', () => {
  test('an active grant opens the category, its items, and their links -- nothing more', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({ token, userId, name: 'Münzen' });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });

    try {
      const { data: seen } = await apiAs(otherToken)
        .from('categories')
        .select('id')
        .eq('id', categoryId);
      expect(seen).toHaveLength(1);

      const { data: items } = await apiAs(otherToken)
        .from('items')
        .select('title')
        .eq('user_id', userId);
      const titles = items!.map((row) => row.title);
      for (const item of itemsIn('Münzen'))
        expect(titles).toContain(item.title);

      const { data: links } = await apiAs(otherToken)
        .from('item_categories')
        .select('item_id')
        .eq('category_id', categoryId);
      expect(links!.length).toBe(itemsIn('Münzen').length);

      // The grant is scoped to this one category, not to the owner as a whole.
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

  test('an expired grant is refused, exactly like no grant at all', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({ token, userId, name: 'Münzen' });

    // The check constraint only demands expires_at > created_at, so an already-expired grant is a legal row.
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
      window: { createdAt, expiresAt },
    });

    try {
      const { data: seen } = await apiAs(otherToken)
        .from('categories')
        .select('id')
        .eq('id', categoryId);
      expect(seen).toEqual([]);
    } finally {
      await unshare(token, shareId);
    }
  });

  // Expiry and scope are checked on every table the grant reaches, not only on categories.
  test('an expired grant opens no entry, link or map place either', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({ token, userId, name: 'Münzen' });
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
      window: { createdAt, expiresAt },
    });

    try {
      const other = apiAs(otherToken);
      const { data: items } = await other
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .eq('title', itemsIn('Münzen')[0].title);
      expect(items).toEqual([]);

      const { data: links } = await other
        .from('item_categories')
        .select('item_id')
        .eq('category_id', categoryId);
      expect(links).toEqual([]);

      const { data: places, error } = await other.rpc('list_category_places', {
        cat_id: categoryId,
      });
      expect(error).toBeNull();
      expect(places).toEqual([]);
    } finally {
      await unshare(token, shareId);
    }
  });

  test('a grant opens nothing filed only in the owner’s other category', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({ token, userId, name: 'Münzen' });
    const siblingId = await ownedCategoryId({
      token,
      userId,
      name: 'Briefmarken',
    });
    const [sibling] = itemsIn('Briefmarken');
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });

    try {
      const other = apiAs(otherToken);
      // The grant itself is live: the shared category's map opens.
      const { data: sharedPlaces } = await other.rpc('list_category_places', {
        cat_id: categoryId,
      });
      expect(
        sharedPlaces!.map((row: { place: string }) => row.place),
      ).toContain(itemsIn('Münzen').find((item) => item.place)!.place);

      const { data: items } = await other
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .eq('title', sibling.title);
      expect(items).toEqual([]);

      const { data: links } = await other
        .from('item_categories')
        .select('item_id')
        .eq('category_id', siblingId);
      expect(links).toEqual([]);

      const { data: places } = await other.rpc('list_category_places', {
        cat_id: siblingId,
      });
      expect(places).toEqual([]);

      const { data: found } = await other.rpc('search_category_items', {
        cat_id: siblingId,
        like_pattern: `%${sibling.title}%`,
        page_from: 0,
        page_to: 9,
      });
      expect(found).toEqual([]);
    } finally {
      await unshare(token, shareId);
    }
  });

  test('a grant addressed to someone else does not open the category to a bystander', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({ token, userId, name: 'Münzen' });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: 'nobody-invited@collectionbuddy.test',
    });

    try {
      const { data: seen } = await apiAs(otherToken)
        .from('categories')
        .select('id')
        .eq('id', categoryId);
      expect(seen).toEqual([]);
    } finally {
      await unshare(token, shareId);
    }
  });

  // Both sides normalise with lower(btrim(...)); disagreeing would silently deny the grantee.
  test('an invitation typed with odd case and stray spaces still opens the collection', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({ token, userId, name: 'Münzen' });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: `  ${SEED.other.email.toUpperCase()}  `,
    });

    try {
      // Stored normalized, not as typed.
      const { data: stored } = await apiAs(token)
        .from('category_shares')
        .select('invited_email')
        .eq('id', shareId)
        .single();
      expect(stored!.invited_email).toBe(SEED.other.email);

      // And the grantee's own, ordinary token matches it.
      const { data: seen } = await apiAs(otherToken)
        .from('categories')
        .select('id')
        .eq('id', categoryId);
      expect(seen).toHaveLength(1);
    } finally {
      await unshare(token, shareId);
    }
  });

  // Asserted directly, not inferred from a missing write policy; editor-share.spec.ts covers the wider grant.
  test('a viewer grant does not extend to writing', async () => {
    const { token, userId, otherToken } = context();
    const categoryId = await ownedCategoryId({ token, userId, name: 'Münzen' });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });

    try {
      const { data: renamed } = await apiAs(otherToken)
        .from('categories')
        .update({ name: 'taken over' })
        .eq('id', categoryId)
        .select('id');
      expect(renamed).toEqual([]);

      const { data: mine } = await apiAs(otherToken)
        .from('items')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .single();
      const { data: updated } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'taken over' })
        .eq('id', mine!.id)
        .select('id');
      expect(updated).toEqual([]);

      // Untouched, read back as the owner.
      const { data: after } = await apiAs(token)
        .from('categories')
        .select('name')
        .eq('id', categoryId)
        .single();
      expect(after!.name).toBe('Münzen');
    } finally {
      await unshare(token, shareId);
    }
  });
});
