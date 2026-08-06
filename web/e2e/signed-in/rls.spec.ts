import { readFileSync } from 'node:fs';

import { expect, test } from './test';
import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, type SeedContext } from './fixtures';
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
    expect(error).toBeNull();
    expect(planted!.user_id).toBe(userId);
    expect(planted!.user_id).not.toBe(otherUserId);

    // And their collection never saw it.
    const { data: theirs } = await apiAs(otherToken)
      .from('items')
      .select('title')
      .eq('user_id', otherUserId);
    expect(theirs!.map((row) => row.title)).not.toContain('planted');

    await apiAs(token).from('items').delete().eq('id', planted!.id);
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

    const { data: given } = await apiAs(token)
      .from('items')
      .update({ user_id: otherUserId })
      .eq('id', mine!.id)
      .select('user_id')
      .single();
    expect(given!.user_id).toBe(userId);

    await apiAs(token).from('items').delete().eq('id', mine!.id);
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
});
