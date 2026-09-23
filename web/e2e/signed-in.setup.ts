import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { test as setup } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  AUTH_STATE_PATH,
  CONTEXT_PATH,
  OTHER_AUTH_STATE_PATH,
  SEED,
} from './signed-in/fixtures';

// Google OAuth cannot be driven in CI, so the session is minted via the auth API into storage state.
const SUPABASE_URL = process.env.E2E_SUPABASE_URL!;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY!;

// The service key only creates users; seed rows go through the user's own session, so RLS has to permit them.
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A user of the local stack, created if this run is the first to want it. */
async function ensureUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user) return data.user.id;

  // Already there from a previous run; perPage raised, since a long-lived stack holds more than 50 users.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) throw listError;
  const existing = list.users.find((user) => user.email === email);
  if (!existing) throw error ?? new Error(`could not create or find ${email}`);
  return existing.id;
}

/** SQL cannot reach object storage, so a test that failed mid-upload leaves objects reseed() would miss. */
async function sweepStorage(as: SupabaseClient, userId: string) {
  const { data: itemPrefixes } = await as.storage
    .from('item-images')
    .list(userId);
  const paths: string[] = [];
  for (const prefix of itemPrefixes ?? []) {
    const { data: objects } = await as.storage
      .from('item-images')
      .list(`${userId}/${prefix.name}`);
    for (const object of objects ?? []) {
      paths.push(`${userId}/${prefix.name}/${object.name}`);
    }
  }
  if (paths.length) await as.storage.from('item-images').remove(paths);
}

/** Deleted and rebuilt rather than added to, so a second run sees exactly what the first did. */
async function reseed(as: SupabaseClient, userId: string) {
  await sweepStorage(as, userId);
  await as.from('items').delete().eq('user_id', userId);
  await as.from('categories').delete().eq('user_id', userId);

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

/** The other collector's one category and one entry. */
async function reseedOther(as: SupabaseClient, userId: string) {
  await sweepStorage(as, userId);
  await as.from('items').delete().eq('user_id', userId);
  await as.from('categories').delete().eq('user_id', userId);

  const { data: category, error: categoryError } = await as
    .from('categories')
    .insert({ user_id: userId, name: SEED.other.category })
    .select('id')
    .single();
  if (categoryError) throw categoryError;

  const { data: item, error: itemError } = await as
    .from('items')
    .insert({ user_id: userId, title: SEED.other.item, place: 'Reykjavik' })
    .select('id')
    .single();
  if (itemError) throw itemError;

  const { error: linkError } = await as.from('item_categories').insert({
    item_id: item.id,
    category_id: category.id,
    user_id: userId,
  });
  if (linkError) throw linkError;
}

/** supabase-js derives the storage key from the project URL, so this captures whatever it writes. */
async function mintSession(
  email: string,
  password: string,
): Promise<{
  key: string;
  value: string;
  token: string;
  client: SupabaseClient;
}> {
  const written = new Map<string, string>();
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      storage: {
        getItem: (key) => written.get(key) ?? null,
        setItem: (key, value) => void written.set(key, value),
        removeItem: (key) => void written.delete(key),
      },
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  const [entry] = [...written.entries()];
  if (!entry) throw new Error('signing in stored no session');
  const token = data.session?.access_token;
  if (!token) throw new Error('signing in produced no access token');
  return { key: entry[0], value: entry[1], token, client };
}

setup('seed the stack and sign in', async ({ baseURL }) => {
  const userId = await ensureUser(SEED.email, SEED.password);
  const session = await mintSession(SEED.email, SEED.password);
  await reseed(session.client, userId);

  // The second collector, and a collection the first one must not see.
  const otherId = await ensureUser(SEED.other.email, SEED.other.password);
  const other = await mintSession(SEED.other.email, SEED.other.password);
  await reseedOther(other.client, otherId);

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
  const browserState = (minted: { key: string; value: string }) =>
    JSON.stringify({
      cookies: [],
      origins: [
        { origin, localStorage: [{ name: minted.key, value: minted.value }] },
      ],
    });
  writeFileSync(AUTH_STATE_PATH, browserState(session));
  // The grantee's own browser session -- the other side is another interface.
  writeFileSync(OTHER_AUTH_STATE_PATH, browserState(other));
});
