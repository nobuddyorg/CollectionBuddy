import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { test as setup } from '@playwright/test';
import { type SupabaseClient } from '@supabase/supabase-js';

import {
  browserState,
  clearCollection,
  ensureUser,
  mintSession,
  reseedSingle,
  type MintedSession,
} from './signed-in/collectors';
import {
  AUTH_STATE_PATH,
  CONTEXT_PATH,
  OTHER_AUTH_STATE_PATH,
  SEED,
} from './signed-in/fixtures';

/** Deleted and rebuilt rather than added to, so a second run sees exactly what the first did. */
async function reseed(as: SupabaseClient, userId: string) {
  await clearCollection(as, userId);

  const { data: categories, error: categoryError } = await as
    .from('categories')
    .insert(SEED.categories.map((name) => ({ user_id: userId, name })))
    .select('id,name');
  if (categoryError) throw categoryError;

  const idOf = (name: string) => {
    const found = categories.find((category) => category.name === name);
    if (!found) throw new Error(`seed category missing: ${name}`);
    return found.id;
  };

  // One at a time, oldest first: a batch insert can share a timestamp and leave the order to chance.
  for (const item of SEED.items) {
    const { category, ...fields } = item;
    const { data: inserted, error: itemError } = await as
      .from('items')
      .insert({ user_id: userId, ...fields })
      .select('id')
      .single();
    if (itemError) throw itemError;

    const { error: linkError } = await as.from('item_categories').insert({
      item_id: inserted.id,
      category_id: idOf(category),
      user_id: userId,
    });
    if (linkError) throw linkError;
  }
}

setup('seed the stack and sign in', async ({ baseURL }) => {
  const userId = await ensureUser(SEED.email, SEED.password);
  const session = await mintSession(SEED.email, SEED.password);
  await reseed(session.client, userId);

  // The second collector, and a collection the first one must not see.
  const otherId = await ensureUser(SEED.other.email, SEED.other.password);
  const other = await mintSession(SEED.other.email, SEED.other.password);
  await reseedSingle(other.client, {
    userId: otherId,
    category: SEED.other.category,
    title: SEED.other.item,
    place: 'Reykjavik',
  });

  mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });
  writeFileSync(
    CONTEXT_PATH,
    JSON.stringify({
      userId,
      token: session.token,
      otherUserId: otherId,
      otherToken: other.token,
    }),
  );
  const origin = new URL(baseURL!).origin;
  const stateOf = (minted: MintedSession) =>
    JSON.stringify(browserState(origin, minted));
  writeFileSync(AUTH_STATE_PATH, stateOf(session));
  // The grantee's own browser session -- the other side is another interface.
  writeFileSync(OTHER_AUTH_STATE_PATH, stateOf(other));
});
