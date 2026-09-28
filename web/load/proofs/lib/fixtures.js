// Seeding the proofs share: identities, categories, entries with chosen fields, and real Storage objects behind photo rows.
import http from 'k6/http';
import { Trend } from 'k6/metrics';

import { insertReturning } from '../../lib/api.js';
import { authHeaders } from '../../lib/http.js';
import { clearAccount, newIdentity } from '../../lib/seed.js';
import { SUPABASE_URL } from '../../lib/target.js';

export { BUCKET } from '../../lib/api.js';
export { TINY_WEBP, attachPhotos, uploadAll } from '../../lib/photos.js';
export { insertEntries } from '../../lib/seed.js';

/** Per-probe timings, tagged so thresholds and the summary can split them. */
export const probeMs = new Trend('probe_ms', true);

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
  return newIdentity(`proof-${label}`);
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

/** Runs a setup's seeding; if it throws, clears every listed account first, since k6 skips teardown after a failed setup. */
export function seedOrClear(sessions, seed) {
  try {
    return seed();
  } catch (error) {
    for (const session of sessions) clearAccount(session);
    throw error;
  }
}

/** PostgREST's `in.(...)` list for a set of ids. */
export function inList(ids) {
  return `in.(${ids.join(',')})`;
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
      headers: { ...authHeaders(session), ...headers },
      tags: { name: probe, probe },
    },
  );
  probeMs.add(response.timings.duration, { probe });
  return response;
}
