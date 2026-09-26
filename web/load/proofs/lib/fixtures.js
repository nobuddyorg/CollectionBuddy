// Seeding the proofs share: identities, categories, entries with chosen fields, and real Storage objects behind photo rows.
import http from 'k6/http';
import { Trend } from 'k6/metrics';

import {
  insertReturning,
  insertRows,
  removeObjects,
  signUp,
} from '../../lib/api.js';
import { clearAccount } from '../../lib/seed.js';
import { ANON_KEY, SUPABASE_URL } from '../../lib/target.js';

export const BUCKET = 'item-images';
// Same batch as lib/seed.js: one INSERT per request.
const SEED_BATCH = 10000;
// Parallel uploads per http.batch call; k6 sends at most batchPerHost (default 6) at once, so this only sizes each call.
const UPLOAD_PARALLELISM = 25;
// Storage's bulk delete refuses more than 1,000 prefixes per request.
const REMOVE_BATCH = 1000;
// A 1x1 WebP, as in lib/flows.js: seeds that need photo rows but not photo bytes.
export const TINY_WEBP_BASE64 =
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

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

function uploadRequest({ session, path, bytes, contentType }) {
  return {
    method: 'POST',
    url: `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    body: bytes,
    params: {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.token}`,
        'Content-Type': contentType,
      },
      tags: { name: 'seed upload' },
    },
  };
}

/** Uploads every path in parallel batches; throws on the first refusal, since a proof on a half-seeded account says nothing. */
function uploadAll({ session, uploads, contentType = 'image/webp' }) {
  for (let start = 0; start < uploads.length; start += UPLOAD_PARALLELISM) {
    const batch = uploads
      .slice(start, start + UPLOAD_PARALLELISM)
      .map(({ path, bytes }) =>
        uploadRequest({ session, path, bytes, contentType }),
      );
    for (const [index, response] of http.batch(batch).entries()) {
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `seed upload of ${uploads[start + index].path} failed: HTTP ${response.status} ${response.body}`,
        );
      }
    }
  }
}

/** `photosEach` photographs (full size plus thumbnail, both real objects) on every listed entry; returns the rows written. */
export function attachPhotos({
  session,
  itemIds,
  photosEach,
  bytes,
  thumbBytes = bytes,
}) {
  const rows = itemIds.flatMap((itemId) =>
    Array.from({ length: photosEach }, () => {
      const base = `${session.userId}/${itemId}/${crypto.randomUUID()}`;
      return {
        item_id: itemId,
        path_full: `${base}.webp`,
        path_thumb: `${base}.thumb.webp`,
      };
    }),
  );
  const uploads = rows.flatMap((row) => [
    { path: row.path_full, bytes },
    { path: row.path_thumb, bytes: thumbBytes },
  ]);
  try {
    uploadAll({ session, uploads });
    for (let start = 0; start < rows.length; start += SEED_BATCH) {
      // size_bytes is the trigger's to fill in from Storage's metadata.
      insertRows({
        session,
        table: 'images',
        rows: rows
          .slice(start, start + SEED_BATCH)
          .map((row) => ({ ...row, size_bytes: 0 })),
      });
    }
  } catch (error) {
    // Objects without a row are invisible to clearAccount, which finds paths through images rows; missing paths are ignored.
    const paths = uploads.map(({ path }) => path);
    for (let start = 0; start < paths.length; start += REMOVE_BATCH) {
      removeObjects(session, paths.slice(start, start + REMOVE_BATCH));
    }
    throw error;
  }
  return rows;
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
