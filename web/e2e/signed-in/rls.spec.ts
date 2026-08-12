import { readFileSync } from 'node:fs';

import { expect, test } from './test';
import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, itemsIn, type SeedContext } from './fixtures';
import { openCategory, visibleTitles } from './helpers';

// The app's only authorization layer.
//
// It is a static export: no server, no route handlers, nowhere else a check
// could live. Every request reaches Postgres carrying the user's own JWT, and
// the policies in 0006 and 0007 are the whole of what stands between one
// collection and another. If they stopped holding, the interface would look
// exactly the same -- it would simply show somebody else's things.
//
// Which is why half of what follows does not go through the interface at all.
// The app only ever asks the questions the policies are meant to allow; the
// dangerous questions are the ones it would never think to ask, and those
// have to be asked directly, with a real token, the way anyone reading the
// bundle could ask them.
test.use({ locale: 'en-GB' });

const context = () =>
  JSON.parse(readFileSync(CONTEXT_PATH, 'utf8')) as SeedContext;

/** A PostgREST client carrying one user's access token, and nothing more. */
function apiAs(token: string) {
  return createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/** Grants `invitedEmail` read access to `categoryId`, as the category's owner. */
async function share(
  token: string,
  categoryId: string,
  invitedEmail: string,
  window?: { createdAt: string; expiresAt: string },
) {
  const { data, error } = await apiAs(token)
    .from('category_shares')
    .insert({
      category_id: categoryId,
      invited_email: invitedEmail,
      ...(window && {
        created_at: window.createdAt,
        expires_at: window.expiresAt,
      }),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function unshare(token: string, shareId: string) {
  await apiAs(token).from('category_shares').delete().eq('id', shareId);
}

async function mineCategoryId(token: string, userId: string, name: string) {
  const { data, error } = await apiAs(token)
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .single();
  if (error) throw error;
  return data.id;
}

test.describe('one collection cannot reach another', () => {
  test('the interface shows nothing of the other collector', async ({
    page,
  }) => {
    await openCategory(page, 'Münzen');
    expect(await visibleTitles(page)).not.toContain(SEED.other.item);
    await expect(
      page.getByRole('tab', { name: SEED.other.category }),
    ).toHaveCount(0);
  });

  test('a plain read returns none of their entries', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherUserId } = context();

    const { data, error } = await apiAs(token).from('items').select('id,title');
    expect(error).toBeNull();
    expect(data!.map((row) => row.title)).not.toContain(SEED.other.item);

    // Asking for them by owner is the sharper version of the same question:
    // the filter is satisfiable, and only the policy makes it return nothing.
    const { data: theirs } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', otherUserId);
    expect(theirs).toEqual([]);
  });

  test('their categories are equally out of reach', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherUserId } = context();

    const { data } = await apiAs(token)
      .from('categories')
      .select('id,name')
      .eq('user_id', otherUserId);
    expect(data).toEqual([]);
  });

  // A policy that lets a row through on write while hiding it on read is the
  // worst of both: the owner cannot see what happened to their own entry.
  test('their entries cannot be edited', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken, otherUserId } = context();

    const { data: theirs } = await apiAs(otherToken)
      .from('items')
      .select('id,title')
      .eq('user_id', otherUserId);
    expect(theirs!.length).toBeGreaterThan(0);
    const target = theirs![0];

    const { data: updated } = await apiAs(token)
      .from('items')
      .update({ title: 'taken over' })
      .eq('id', target.id)
      .select('id');
    expect(updated).toEqual([]);

    // And it really is untouched, read back as its owner.
    const { data: after } = await apiAs(otherToken)
      .from('items')
      .select('title')
      .eq('id', target.id)
      .single();
    expect(after!.title).toBe(target.title);
  });

  test('their entries cannot be deleted', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken, otherUserId } = context();

    const { data: before } = await apiAs(otherToken)
      .from('items')
      .select('id')
      .eq('user_id', otherUserId);

    const { data: deleted } = await apiAs(token)
      .from('items')
      .delete()
      .eq('user_id', otherUserId)
      .select('id');
    expect(deleted).toEqual([]);

    const { data: after } = await apiAs(otherToken)
      .from('items')
      .select('id')
      .eq('user_id', otherUserId);
    expect(after!.length).toBe(before!.length);
  });

  // Not refused -- ignored, which is stronger. `enforce_user_id()` is a
  // BEFORE trigger that overwrites whatever the client claimed with
  // auth.uid(), so an entry addressed to someone else is simply filed under
  // the sender. There is no request a client can make that puts a row in
  // another collection, rather than there being one that gets turned down.
  test('an entry addressed to their collection lands in your own', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken, otherUserId } = context();

    const { data: planted, error } = await apiAs(token)
      .from('items')
      .insert({ user_id: otherUserId, title: 'planted' })
      .select('id,user_id')
      .single();
    try {
      expect(error).toBeNull();
      expect(planted!.user_id).toBe(userId);
      expect(planted!.user_id).not.toBe(otherUserId);

      // And their collection never saw it.
      const { data: theirs } = await apiAs(otherToken)
        .from('items')
        .select('title')
        .eq('user_id', otherUserId);
      expect(theirs!.map((row) => row.title)).not.toContain('planted');
    } finally {
      // In a finally: this plants a row in the seeded user's own collection
      // (the trigger rewrites the owner), and a failed assertion above would
      // otherwise leave it there for `entries.spec.ts` or `photos.spec.ts`
      // to count by accident (#338).
      if (planted)
        await apiAs(token).from('items').delete().eq('id', planted.id);
    }
  });

  // The same trigger refuses to let an existing row change hands: on update
  // it puts the old owner back rather than taking the new one.
  test('an entry cannot be handed to them either', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherUserId } = context();

    const { data: mine } = await apiAs(token)
      .from('items')
      .insert({ user_id: userId, title: 'to be given away' })
      .select('id')
      .single();
    try {
      const { data: given } = await apiAs(token)
        .from('items')
        .update({ user_id: otherUserId })
        .eq('id', mine!.id)
        .select('user_id')
        .single();
      expect(given!.user_id).toBe(userId);
    } finally {
      if (mine) await apiAs(token).from('items').delete().eq('id', mine.id);
    }
  });

  // Storage carries its own policies, scoped by the first path segment being
  // the owner's id -- photographs are the private part of a collection.
  test('their photographs cannot be listed', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherUserId } = context();

    const { data } = await apiAs(token)
      .storage.from('item-images')
      .list(otherUserId);
    expect(data ?? []).toEqual([]);
  });

  test('nothing can be written under their prefix', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherUserId } = context();

    const { error } = await apiAs(token)
      .storage.from('item-images')
      .upload(`${otherUserId}/planted.webp`, new Blob(['x']));
    expect(error).not.toBeNull();
  });

  // Signed out is the other boundary, and it is refused a step earlier than
  // the rest: `anon` holds no grant on these tables at all, so the request is
  // turned away before any policy predicate is evaluated. 42501 is what that
  // looks like -- an empty result would mean the grant had been given and the
  // policy was doing the work, which is a weaker place to be standing.
  //
  // Asserted on the code rather than on "there was an error", because the
  // first version of this test read `expect(error ?? {}).toBeTruthy()`, and
  // an object is always truthy: it passed whether the boundary held or not.
  for (const table of ['items', 'categories']) {
    test(`a visitor with no session is refused ${table} outright`, async ({}, testInfo) => {
      testInfo.skip(!process.env.E2E_SUPABASE_URL);
      const anon = createClient(
        process.env.E2E_SUPABASE_URL!,
        process.env.E2E_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );

      const { data, error, status } = await anon.from(table).select('id');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
      expect(status).toBe(401);
    });
  }

  test('a visitor with no session can list no photographs', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { otherUserId } = context();
    const anon = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const { data } = await anon.storage.from('item-images').list(otherUserId);
    expect(data ?? []).toEqual([]);
  });

  // item_categories is guarded by a trigger, not by RLS -- the insert policy
  // only checks user_id = auth.uid(), and user_id is set by this very
  // trigger, so RLS alone would not catch a regression here. This is the one
  // row in the schema that references two owned rows at once, which makes it
  // the single most interesting authorization case: a link from one of my
  // own items into one of their categories.
  test('an item cannot be filed into their category', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken } = context();

    const { data: mine } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('title', SEED.items[0].title)
      .single();
    const { data: theirs } = await apiAs(otherToken)
      .from('categories')
      .select('id')
      .eq('name', SEED.other.category)
      .single();

    const { error } = await apiAs(token)
      .from('item_categories')
      .insert({ item_id: mine!.id, category_id: theirs!.id });
    expect(error).not.toBeNull();
  });

  // list() returning [] (above) is the weaker proof -- it holds even if the
  // listing itself is merely empty. Signing a path that is known to exist is
  // the sharper question: does the select policy actually refuse it, or does
  // it only look that way because there was nothing to find?
  test('a known photograph of theirs cannot be signed', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken, otherUserId } = context();

    const path = `${otherUserId}/rls-signed-url-probe.webp`;
    // The bucket restricts allowed_mime_types (0007_storage.sql) -- an
    // untyped Blob upload would be rejected on that alone, which would prove
    // nothing about the policy this test exists to check.
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

  // Items are refused on both update and delete (above); categories and the
  // item_categories mapping were only ever asked the read question.
  test('their category cannot be renamed or deleted', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken } = context();

    const { data: theirs } = await apiAs(otherToken)
      .from('categories')
      .select('id,name')
      .eq('name', SEED.other.category)
      .single();

    const { data: renamed } = await apiAs(token)
      .from('categories')
      .update({ name: 'taken over' })
      .eq('id', theirs!.id)
      .select('id');
    expect(renamed).toEqual([]);

    const { data: deleted } = await apiAs(token)
      .from('categories')
      .delete()
      .eq('id', theirs!.id)
      .select('id');
    expect(deleted).toEqual([]);

    // Untouched, read back as its owner.
    const { data: after } = await apiAs(otherToken)
      .from('categories')
      .select('name')
      .eq('id', theirs!.id)
      .single();
    expect(after!.name).toBe(theirs!.name);
  });
});

// Sharing (0011_category_shares.sql, 0012_shared_photos.sql, #483/#531) is
// the one place this file's boundary runs the other way: not "can a
// stranger reach my collection" but "can the person I deliberately let in
// reach exactly as far as I said, and no further." Münzen is otherwise a
// read-only fixture across the whole suite, so each test creates and tears
// down its own grant rather than relying on one left in place by another.
test.describe('a category shared with another collector', () => {
  test('an active grant opens the category, its items, and their links -- nothing more', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');
    const shareId = await share(token, categoryId, SEED.other.email);

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

      // A second, unshared category of the same owner stays out of reach --
      // the grant is scoped to the one category, not to the owner as a
      // whole.
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

  test('an expired grant is refused, exactly like no grant at all', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');

    // The check constraint only demands expires_at > created_at, not that
    // either sits in the future -- so a grant that was already over the
    // moment it was written is a legal row, and the sharper question is
    // whether the access policies re-check the clock or only the row's own
    // shape.
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shareId = await share(token, categoryId, SEED.other.email, {
      createdAt,
      expiresAt,
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

  test('a grant addressed to someone else does not open the category to a bystander', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');
    const shareId = await share(
      token,
      categoryId,
      'nobody-invited@collectionbuddy.test',
    );

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

  // 0011/0012 add select and nothing else -- the grant is meant to be
  // view-only. Asserted directly rather than assumed from the absence of an
  // insert/update/delete policy, the same reasoning as the owner-side write
  // tests above: a permissive policy added anywhere else in the chain would
  // pass silently if this only checked that reads worked.
  test('the grant does not extend to writing', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');
    const shareId = await share(token, categoryId, SEED.other.email);

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

  // Photos extend the same grant one hop further (0012): through
  // item_categories, not through the object's own owner-prefixed path, which
  // never contains the grantee's uid at all.
  test('a shared photograph can be read through the grant, and stops the moment it is revoked', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');
    const { data: item } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', userId)
      .eq('title', itemsIn('Münzen')[0].title)
      .single();
    const path = `${userId}/${item!.id}/rls-share-probe.webp`;

    const { error: uploadError } = await apiAs(token)
      .storage.from('item-images')
      .upload(path, new Blob(['probe'], { type: 'image/webp' }));
    expect(uploadError).toBeNull();

    try {
      const shareId = await share(token, categoryId, SEED.other.email);
      try {
        const { data, error } = await apiAs(otherToken)
          .storage.from('item-images')
          .createSignedUrl(path, 60);
        expect(error).toBeNull();
        expect(data).not.toBeNull();
      } finally {
        await unshare(token, shareId);
      }

      // The grant is gone; the object is not -- so this is the revocation
      // itself being checked, not just an object that stopped existing.
      const { data: after, error: afterError } = await apiAs(otherToken)
        .storage.from('item-images')
        .createSignedUrl(path, 60);
      expect(after).toBeNull();
      expect(afterError).not.toBeNull();
    } finally {
      await apiAs(token).storage.from('item-images').remove([path]);
    }
  });
});
