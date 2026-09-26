import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Google OAuth cannot be driven in CI, so each session is minted via the auth API into storage state.
const SUPABASE_URL = process.env.E2E_SUPABASE_URL!;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY!;

/** A session as supabase-js stores it in the browser, plus a client and token that act as the same user. */
export type MintedSession = {
  key: string;
  value: string;
  token: string;
  client: SupabaseClient;
};

/** A user of the local stack, created if this run is the first to want it. */
export async function ensureUser(
  email: string,
  password: string,
): Promise<string> {
  // The service key only creates users; seed rows go through the user's own session, so RLS has to permit them.
  const admin = createClient(
    SUPABASE_URL,
    process.env.E2E_SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
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

/** supabase-js derives the storage key from the project URL, so this captures whatever it writes. */
export async function mintSession(
  email: string,
  password: string,
): Promise<MintedSession> {
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

/** Playwright storage state that opens the app signed in as `minted`. */
export function browserState(origin: string, minted: MintedSession) {
  return {
    cookies: [],
    origins: [
      { origin, localStorage: [{ name: minted.key, value: minted.value }] },
    ],
  };
}

/** SQL cannot reach object storage, so a test that failed mid-upload leaves objects a row delete would miss. */
async function sweepStorage(as: SupabaseClient, userId: string) {
  const bucket = as.storage.from('item-images');
  const { data: itemPrefixes, error } = await bucket.list(userId);
  if (error) throw error;
  const paths: string[] = [];
  for (const prefix of itemPrefixes) {
    const { data: objects, error: listError } = await bucket.list(
      `${userId}/${prefix.name}`,
    );
    if (listError) throw listError;
    for (const object of objects) {
      paths.push(`${userId}/${prefix.name}/${object.name}`);
    }
  }
  if (paths.length === 0) return;
  const { error: removeError } = await bucket.remove(paths);
  if (removeError) throw removeError;
}

/** Objects first, then every row the user owns: a failed step throws here, not as a clash three steps on. */
export async function clearCollection(as: SupabaseClient, userId: string) {
  await sweepStorage(as, userId);
  const { error: itemError } = await as
    .from('items')
    .delete()
    .eq('user_id', userId);
  if (itemError) throw itemError;
  const { error: categoryError } = await as
    .from('categories')
    .delete()
    .eq('user_id', userId);
  if (categoryError) throw categoryError;
}

/** Replaces the user's whole collection with one category holding one entry. */
export async function reseedSingle(
  as: SupabaseClient,
  seed: { userId: string; category: string; title: string; place: string },
) {
  const { userId, category, title, place } = seed;
  await clearCollection(as, userId);

  const { data: created, error: categoryError } = await as
    .from('categories')
    .insert({ user_id: userId, name: category })
    .select('id')
    .single();
  if (categoryError) throw categoryError;

  const { data: item, error: itemError } = await as
    .from('items')
    .insert({ user_id: userId, title, place })
    .select('id')
    .single();
  if (itemError) throw itemError;

  const { error: linkError } = await as.from('item_categories').insert({
    item_id: item.id,
    category_id: created.id,
    user_id: userId,
  });
  if (linkError) throw linkError;
}
