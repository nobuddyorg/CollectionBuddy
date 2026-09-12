import { readFileSync } from 'node:fs';

import { expect, test } from './test';
import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, itemsIn, type SeedContext } from './fixtures';
import { openCategory, visibleTitles } from './helpers';

// This app is a static export: no server, no route handlers, so Postgres
// row-level security is the entire authorization layer. If a policy stopped
// holding, the interface would look identical -- it would simply show
// somebody else's things. Which is why half of what follows bypasses the
// interface entirely and asks Postgres the dangerous questions directly, with
// a real token, the way anyone reading the bundle could.
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

/**
 * Grants `invitedEmail` access to `categoryId`, as the category's owner.
 *
 * `role` defaults to `'viewer'` the way the column itself does
 * (0003_tables.sql), so the cases that omit it keep testing exactly what they
 * tested before. Passing `'editor'` is the widest grant the schema can issue.
 */
async function share(
  token: string,
  categoryId: string,
  invitedEmail: string,
  options?: {
    role?: 'viewer' | 'editor';
    window?: { createdAt: string; expiresAt: string };
  },
) {
  const { data, error } = await apiAs(token)
    .from('category_shares')
    .insert({
      category_id: categoryId,
      invited_email: invitedEmail,
      ...(options?.role && { role: options.role }),
      ...(options?.window && {
        created_at: options.window.createdAt,
        expires_at: options.window.expiresAt,
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

    // Sharper than the check above: this filter is satisfiable, so only the
    // policy makes it return nothing.
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

  // A policy that let a row through on write while hiding it on read would
  // be the worst of both: the owner couldn't see what happened to their entry.
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

  // Not refused -- ignored, which is stronger: `enforce_user_id()` is a
  // BEFORE trigger that overwrites the claimed owner with auth.uid(), so
  // there is no request that can put a row in another collection at all.
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
      // In `finally`: the trigger rewrites the owner, so this plants a row in
      // the seeded user's own collection -- a failed assertion above must
      // not leave it for entries.spec.ts or photos.spec.ts to count.
      if (planted)
        await apiAs(token).from('items').delete().eq('id', planted.id);
    }
  });

  // The same trigger refuses to let an existing row change hands: on update
  // it restores the old owner rather than accepting the new one.
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

  // Storage has its own policies, scoped by the first path segment (owner id).
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

  // The images table is a separate authorization surface from storage.objects
  // (a row naming an object vs. the object's bytes), so it needs its own
  // check. No seed fixture plants an images row, so this inserts and tears
  // down its own.
  test('their photograph records cannot be listed', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken, otherUserId } = context();

    const { data: theirItem } = await apiAs(otherToken)
      .from('items')
      .select('id')
      .eq('title', SEED.other.item)
      .single();

    const { data: planted, error: insertError } = await apiAs(otherToken)
      .from('images')
      .insert({
        item_id: theirItem!.id,
        path_full: `${otherUserId}/${theirItem!.id}/rls-images-probe.webp`,
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();

    try {
      const { data } = await apiAs(token)
        .from('images')
        .select('id')
        .eq('item_id', theirItem!.id);
      expect(data).toEqual([]);
    } finally {
      await apiAs(otherToken).from('images').delete().eq('id', planted!.id);
    }
  });

  // tg_images_enforce re-derives ownership from the item itself rather than
  // trusting the client, so an insert against someone else's item is refused
  // outright -- unlike a planted item, it is not silently refiled under the
  // sender.
  test('an images row cannot be inserted for their item', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken } = context();

    const { data: theirItem } = await apiAs(otherToken)
      .from('items')
      .select('id')
      .eq('title', SEED.other.item)
      .single();

    const { data, error } = await apiAs(token)
      .from('images')
      .insert({
        item_id: theirItem!.id,
        path_full: 'planted/planted.webp',
      })
      .select('id');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  // Signed out is a step earlier than the rest: `anon` holds no grant on
  // these tables at all, so the request is refused (42501) before any policy
  // predicate runs -- an empty result would instead mean the grant existed
  // and the policy was doing the work. Asserted on the error code, not just
  // truthiness: `expect(error ?? {}).toBeTruthy()` would pass either way,
  // since an object is always truthy.
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

  // item_categories is guarded by a trigger, not by RLS: the insert policy
  // only checks user_id = auth.uid(), and that column is set by the same
  // trigger, so RLS alone would not catch a regression here.
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

  // Stronger than list() returning []: that could just mean nothing was
  // there. Signing a path known to exist tests whether the policy actually
  // refuses it.
  test('a known photograph of theirs cannot be signed', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, otherToken, otherUserId } = context();

    const path = `${otherUserId}/rls-signed-url-probe.webp`;
    // The bucket restricts allowed_mime_types; an untyped Blob would be
    // rejected on that alone, proving nothing about the policy under test.
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

// Sharing runs this file's boundary the other way: not "can a stranger reach
// my collection" but "can someone deliberately let in reach exactly as far as
// granted, and no further." Münzen is a read-only fixture elsewhere in the
// suite, so each test creates and tears down its own grant.
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

  test('an expired grant is refused, exactly like no grant at all', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');

    // The check constraint only demands expires_at > created_at, not that
    // either sits in the future, so an already-expired grant is a legal row;
    // this checks whether the policy re-checks the clock.
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shareId = await share(token, categoryId, SEED.other.email, {
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

  // An address is typed by a person, so it arrives with whatever case and
  // stray spaces they typed. Both sides of the comparison have to agree on
  // what a match is: tg_category_shares_enforce stores `lower(btrim(...))`,
  // and caller_email() reads `lower(btrim(...))` back off the claim
  // (0009_caller_email_trim.sql -- it only lowercased before, so an address
  // pasted with a trailing space was stored trimmed and then never matched).
  // Fail-closed either way, which is why nothing here is an escalation: the
  // cost of disagreeing is a grantee silently denied, with nothing to
  // distinguish it from never having been invited at all.
  test('an invitation typed with odd case and stray spaces still opens the collection', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');
    const shareId = await share(
      token,
      categoryId,
      `  ${SEED.other.email.toUpperCase()}  `,
    );

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

  // A *viewer* grant is meant to be view-only. Asserted directly rather than
  // assumed from the absence of a write policy, so a permissive policy added
  // elsewhere in the chain can't pass silently. The role is named in the title
  // because this is not the write boundary in general: an `editor` grant is
  // supposed to reach past it, which the describe block below covers.
  test('a viewer grant does not extend to writing', async ({}, testInfo) => {
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

  // Photos extend the grant one hop further, through item_categories, not
  // through the object's own owner-prefixed path (which never contains the
  // grantee's uid).
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

  // The images table's select policy joins through item_categories directly
  // via its own item_id column, rather than parsing one back out of a path
  // the way storage.objects has to. Same grant and revocation, checked
  // against the row instead of the bytes.
  test('a shared photograph record can be read through the grant, and stops the moment it is revoked', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, 'Münzen');
    const { data: item } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', userId)
      .eq('title', itemsIn('Münzen')[0].title)
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
      const shareId = await share(token, categoryId, SEED.other.email);
      try {
        const { data } = await apiAs(otherToken)
          .from('images')
          .select('id')
          .eq('id', planted!.id);
        expect(data).toHaveLength(1);
      } finally {
        await unshare(token, shareId);
      }

      // The grant is gone; the row is not -- so this is the revocation
      // itself being checked, not just a row that stopped existing.
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

// `has_category_write_access()` is the widest predicate in the schema: an
// active grant at role 'editor' lets a non-owner edit item *content* inside
// someone else's category. Everything above tests a viewer, whose grant stops
// at reading -- so none of it says anything about this path. These cases run
// on `Leihgabe`, a collection of their own, because they edit and delete the
// entries they find there.
test.describe('a category shared at the editor role', () => {
  /** The shared collection, plus a throwaway entry of the owner's inside it. */
  async function ownerEntryIn(
    token: string,
    userId: string,
    title: string,
  ): Promise<{ categoryId: string; itemId: string }> {
    const categoryId = await mineCategoryId(token, userId, SEED.editorCategory);
    const { data: item, error: itemError } = await apiAs(token)
      .from('items')
      .insert({ user_id: userId, title })
      .select('id')
      .single();
    if (itemError) throw itemError;

    const { error: linkError } = await apiAs(token)
      .from('item_categories')
      .insert({ item_id: item!.id, category_id: categoryId });
    if (linkError) throw linkError;

    return { categoryId, itemId: item!.id };
  }

  async function editorShare(token: string, categoryId: string) {
    return share(token, categoryId, SEED.other.email, { role: 'editor' });
  }

  test('an editor edits and deletes the owner entries it was granted', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn(
      token,
      userId,
      'rls-editor-edit-probe',
    );
    const shareId = await editorShare(token, categoryId);

    try {
      const { data: updated } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'edited by the editor' })
        .eq('id', itemId)
        .select('id');
      expect(updated).toHaveLength(1);

      // Read back as the owner: a write accepted but hidden from its owner
      // would be the worst outcome of all.
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

  // The gate here is tg_item_categories_enforce (0002_functions.sql), not a
  // policy: the insert policy only checks user_id = auth.uid(), and the
  // trigger sets that column itself.
  test('an editor files an entry of its own into the shared collection', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await mineCategoryId(token, userId, SEED.editorCategory);
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

      // The entry stays the editor's own -- the trigger files it under the
      // item's owner, not under whoever owns the category.
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

  // The deliberate asymmetry in 0006_policies.sql, asserted so it stays a
  // decision rather than becoming a surprise: has_category_write_access()
  // bundles category ownership in, has_category_read_access() does not. The
  // consequence is that owning the category does *not* grant sight of an
  // entry an editor merely linked into it -- the owner never had a grant on
  // that entry, and holding the category is not one.
  test('owning the collection does not reveal an entry the editor filed into it', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await mineCategoryId(token, userId, SEED.editorCategory);
    const shareId = await editorShare(token, categoryId);

    const { data: mine } = await apiAs(otherToken)
      .from('items')
      .insert({ user_id: otherUserId, title: 'rls-editor-invisible-entry' })
      .select('id')
      .single();

    try {
      await apiAs(otherToken)
        .from('item_categories')
        .insert({ item_id: mine!.id, category_id: categoryId });

      // Satisfiable filter: the row exists and is linked into the owner's own
      // collection, so only the policy makes this empty.
      const { data: seen } = await apiAs(token)
        .from('items')
        .select('id')
        .eq('id', mine!.id);
      expect(seen).toEqual([]);
    } finally {
      await unshare(token, shareId);
      await apiAs(otherToken).from('items').delete().eq('id', mine!.id);
    }
  });

  // Both mirrored surfaces: the images row (joined through item_categories by
  // item_id) and the object's bytes (an id parsed back out of the path) are
  // separate policies with separate join paths.
  test('an editor photographs a shared entry, on both surfaces', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken, otherUserId } = context();
    const { categoryId, itemId } = await ownerEntryIn(
      token,
      userId,
      'rls-editor-photo-probe',
    );
    const shareId = await editorShare(token, categoryId);
    // An editor's upload lands under the *editor's* uid prefix (imagePrefix,
    // data/images.ts), which is what "write shared objects" exists for.
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
      // tg_images_enforce files the row under the *item's* owner, whoever
      // uploaded the bytes.
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

  // The line the role is supposed to stop at: item content, never the
  // collection itself.
  test('an editor cannot rename or delete the collection', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, SEED.editorCategory);
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
      expect(after!.name).toBe(SEED.editorCategory);
    } finally {
      await unshare(token, shareId);
    }
  });

  test('an editor cannot promote itself or issue a grant of its own', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken, otherUserId } = context();
    const categoryId = await mineCategoryId(token, userId, SEED.editorCategory);
    // Issued as a viewer, so a successful self-promotion would be visible as
    // a role change rather than a no-op.
    const shareId = await share(token, categoryId, SEED.other.email);

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

      // And it cannot hand the collection on to a third party. Refused by
      // tg_category_shares_enforce, which re-derives the owner from the
      // category, so this is an error rather than an empty result.
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

  test('an editor reaches no further than the one collection granted', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, SEED.editorCategory);
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

  // Asserted with the entry still present, so this is the revocation being
  // tested and not a row that stopped existing.
  test('a revoked editor can no longer write, with the entry still there', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn(
      token,
      userId,
      'rls-editor-revoked-probe',
    );

    try {
      const shareId = await editorShare(token, categoryId);
      const { data: while_granted } = await apiAs(otherToken)
        .from('items')
        .update({ title: 'edited while granted' })
        .eq('id', itemId)
        .select('id');
      expect(while_granted).toHaveLength(1);
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

  test('an expired editor grant writes no more than no grant at all', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const { categoryId, itemId } = await ownerEntryIn(
      token,
      userId,
      'rls-editor-expired-probe',
    );
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shareId = await share(token, categoryId, SEED.other.email, {
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

  // Deliberate, and easy to mistake for the escalation above: "delete own or
  // invited category_shares" covers the owner revoking *and* the grantee
  // leaving. Leaving ends its own access; it does not touch anyone else's.
  test('an editor may leave the share, which ends its own access', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken } = context();
    const categoryId = await mineCategoryId(token, userId, SEED.editorCategory);
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

  // The escalation 0008_storage_no_update.sql closes, asserted through the
  // real Storage API rather than against the policy text. `move()` was the
  // sharpest form of it: "update shared objects" authorized on segment 2 of
  // the path while the owner-only policies authorize on segment 1, so
  // rewriting segment 1 satisfied both and carried the object into the
  // editor's own namespace -- out of reach of revocation, of the owner, and
  // of the weekly sweep, all three.
  test('an editor cannot move the owner photograph out of the owner prefix', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId, otherToken, otherUserId } = context();
    const { categoryId, itemId } = await ownerEntryIn(
      token,
      userId,
      'rls-editor-move-probe',
    );
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

      // Copying is a separate capability (select on the source, insert on the
      // destination) and is deliberately still allowed -- but it leaves the
      // owner's own object where it was, which is the invariant that matters.
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

  // The same invariant from the other side: nobody may move an object even
  // within their *own* prefix, because UPDATE on storage.objects is gone
  // entirely rather than merely pinned to segment 1.
  test('an owner cannot move a photograph either, within their own prefix', async ({}, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId } = context();
    const { itemId } = await ownerEntryIn(
      token,
      userId,
      'rls-owner-move-probe',
    );
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

      // Uploading, signing and removing -- everything the app actually does --
      // are untouched by the lost UPDATE.
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
