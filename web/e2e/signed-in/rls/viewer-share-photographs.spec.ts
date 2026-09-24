import { expect, test } from '../test';
import { SEED, itemsIn } from '../fixtures';
import { apiAs, context, ownedCategoryId, share, unshare } from './helpers';

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
});
