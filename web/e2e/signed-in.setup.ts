import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { test as setup } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AUTH_STATE_PATH, CONTEXT_PATH, SEED } from './signed-in/fixtures';

// Signs a test user in against the local Supabase stack and leaves the
// session where the browser will find it, plus a known collection to look at.
//
// Sign-in cannot go through the interface: the only way in is Google OAuth,
// which no CI runner can drive. So the session is minted through the auth API
// and written into localStorage before the app boots -- everything after that
// is the real app talking to a real Postgres with real row-level security,
// which is the whole point of running against a stack rather than a stub.
//
// Local only. There is no path here that could point at a deployed database:
// the URL and the service key both come from `supabase status`, and the
// public suite is what runs against production.
const SUPABASE_URL = process.env.E2E_SUPABASE_URL!;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY!;

// The service key opens exactly one door: creating the user, which is a
// GoTrue admin call and not a table at all. It cannot be used to seed,
// because `service_role` is granted nothing on these tables -- 0006 grants
// `authenticated` and no one else, on the reasoning that row-level security
// is the only authorization layer this app has.
//
// Which turns out to be the better arrangement anyway. The rows below are
// written by the signed-in user through the same policies the app runs
// under, so the fixture cannot set up a state the app itself could not have
// reached, and a policy that stopped permitting an ordinary insert would
// fail here rather than in production.
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

  // Already there from a previous run on the same stack -- find it rather
  // than fail, so the suite is re-runnable without tearing the stack down.
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((user) => user.email === email);
  if (!existing) throw error ?? new Error(`could not create or find ${email}`);
  return existing.id;
}

/**
 * Puts the collection into a known state.
 *
 * Deleted and rebuilt rather than added to, so a second run sees exactly what
 * the first did -- a suite that asserts "three items" has to be able to say
 * which three.
 */
async function reseed(as: SupabaseClient, userId: string) {
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

  // Inserted oldest first so `created_at` runs in the order they are written
  // here, and the list -- which is newest-first -- shows them reversed. A
  // batch insert can share a timestamp, which would leave the order of the
  // first page to chance.
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

/**
 * Signs in and returns the localStorage entry the browser build would hold.
 *
 * The key is not spelled out here: supabase-js derives it from the project
 * URL, and this asks the same library the app uses to derive it, by handing
 * it somewhere to write and reading back what it wrote. Guessing the format
 * would be a second place for it to be wrong.
 */
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

  // The second collector, and a collection for the first one to be unable to
  // see. Seeded through their own session for the same reason as the first:
  // service_role has no grant on these tables.
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
  writeFileSync(
    AUTH_STATE_PATH,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL!).origin,
          localStorage: [{ name: session.key, value: session.value }],
        },
      ],
    }),
  );
});
