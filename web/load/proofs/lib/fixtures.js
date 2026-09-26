// Seeding the proofs share: identities, categories and entries with chosen fields.
import http from 'k6/http';
import { Trend } from 'k6/metrics';

import { insertReturning, insertRows, signUp } from '../../lib/api.js';
import { clearAccount } from '../../lib/seed.js';
import { ANON_KEY, SUPABASE_URL } from '../../lib/target.js';

export const BUCKET = 'item-images';
// Same batch as lib/seed.js: one INSERT per request.
const SEED_BATCH = 10000;

/** Per-probe timings, tagged so thresholds and the summary can split them. */
const probeMs = new Trend('probe_ms', true);

export function envInt(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, not ${raw}`);
  }
  return value;
}

export function newCollector(label) {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return signUp(
    `proof-${label}-${run}@collectionbuddy.test`,
    crypto.randomUUID(),
  );
}

export function newCategory(session, name) {
  const [category] = insertReturning({
    session,
    table: 'categories',
    rows: [{ name }],
    select: 'id',
  });
  return category.id;
}

/** `count` entries newest-first, a minute apart, filed into one category; `fields(n)` supplies each entry's own columns. */
export function insertEntries({ session, categoryId, count, fields }) {
  const now = Date.now();
  const ids = [];
  for (let start = 0; start < count; start += SEED_BATCH) {
    const items = [];
    const links = [];
    for (let n = start; n < Math.min(count, start + SEED_BATCH); n++) {
      const id = crypto.randomUUID();
      const createdAt = new Date(now - n * 60000).toISOString();
      items.push({ id, created_at: createdAt, ...fields(n) });
      links.push({
        item_id: id,
        category_id: categoryId,
        created_at: createdAt,
      });
      ids.push(id);
    }
    insertRows({ session, table: 'items', rows: items });
    insertRows({ session, table: 'item_categories', rows: links });
  }
  return ids;
}

/** Runs a setup's seeding; if it throws, clears every listed account first, since k6 skips teardown after a failed setup. */
export function seedOrClear(sessions, seed) {
  try {
    return seed();
  } catch (error) {
    for (const session of sessions) clearAccount(session);
    throw error;
  }
}

/** A GET/POST against the target with the caller's token, tagged by probe; returns the response. */
export function call({
  method = 'GET',
  path,
  session,
  body,
  headers = {},
  probe,
}) {
  const response = http.request(
    method,
    `${SUPABASE_URL}${path}`,
    body ?? null,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.token}`,
        ...headers,
      },
      tags: { name: probe, probe },
    },
  );
  probeMs.add(response.timings.duration, { probe });
  return response;
}
