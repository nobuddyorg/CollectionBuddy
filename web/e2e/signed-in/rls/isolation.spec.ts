import { createClient } from '@supabase/supabase-js';

import { expect, test } from '../test';
import { SEED } from '../fixtures';
import { visibleTitles } from '../helpers';
import { apiAs, context } from './helpers';

// A broken policy would look identical in the interface, so most cases here ask Postgres directly.
test.use({ locale: 'en-GB' });

test.describe('one collection cannot reach another', () => {
  test('the interface shows nothing of the other collector', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    expect(await visibleTitles(page)).not.toContain(SEED.other.item);
    // Expanded first: a collapsed strip holds no tabs at all, so the absence below would mean nothing.
    await app.categories.do.openPanel();
    await expect(app.categories.tab(SEED.other.category)).toHaveCount(0);
  });

  test('a plain read returns none of their entries', async () => {
    const { token, otherUserId } = context();

    const { data, error } = await apiAs(token).from('items').select('id,title');
    expect(error).toBeNull();
    expect(data!.map((row) => row.title)).not.toContain(SEED.other.item);

    // Sharper than the check above: a satisfiable filter, so only the policy makes it return nothing.
    const { data: theirs } = await apiAs(token)
      .from('items')
      .select('id')
      .eq('user_id', otherUserId);
    expect(theirs).toEqual([]);
  });

  test('their categories are equally out of reach', async () => {
    const { token, otherUserId } = context();

    const { data } = await apiAs(token)
      .from('categories')
      .select('id,name')
      .eq('user_id', otherUserId);
    expect(data).toEqual([]);
  });

  // Read back as the owner: a write let through but hidden on read would be the worst of both.
  test('their entries cannot be edited', async () => {
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

  test('their entries cannot be deleted', async () => {
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

  // Ignored rather than refused: enforce_user_id() is a BEFORE trigger that overwrites the claimed owner.
  test('an entry addressed to their collection lands in your own', async () => {
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
      // In finally: the trigger refiles the row under the seeded user, where other specs would count it.
      if (planted)
        await apiAs(token).from('items').delete().eq('id', planted.id);
    }
  });

  // On update the same trigger restores the old owner rather than accepting the new one.
  test('an entry cannot be handed to them either', async () => {
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

  // anon holds no grant on these tables, so the refusal is 42501 before any policy runs; asserted on the code.
  for (const table of ['items', 'categories', 'category_shares']) {
    test(`a visitor with no session is refused ${table} outright`, async () => {
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

  // Guarded by a trigger, not RLS: the insert policy checks a column the same trigger sets.
  test('an item cannot be filed into their category', async () => {
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

  test('a mapping cannot be updated, not even your own', async () => {
    const { token, userId } = context();

    const { data: mine } = await apiAs(token)
      .from('item_categories')
      .select('item_id,category_id')
      .eq('user_id', userId)
      .limit(1)
      .single();
    expect(mine).not.toBeNull();

    const { data, error } = await apiAs(token)
      .from('item_categories')
      .update({ category_id: mine!.category_id })
      .eq('item_id', mine!.item_id)
      .select('item_id');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  test('their category cannot be renamed or deleted', async () => {
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
