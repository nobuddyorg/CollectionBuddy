// Real Storage objects behind images rows, for seeds that need photographs: uploaded in parallel, rows written set-based.
import http from 'k6/http';

import { insertRows, removeObjects } from './api.js';
import { ANON_KEY, SUPABASE_URL } from './target.js';

const BUCKET = 'item-images';
// Same batch as lib/seed.js: one INSERT per request.
const SEED_BATCH = 10000;
// Parallel uploads per http.batch call; k6 sends at most batchPerHost (default 6) at once, so this only sizes each call.
const UPLOAD_PARALLELISM = 25;
// Storage's bulk delete refuses more than 1,000 prefixes per request.
const REMOVE_BATCH = 1000;
// A 1x1 WebP: for seeds and writes that need photo rows, not photo bytes.
export const TINY_WEBP_BASE64 =
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

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
export function uploadAll({ session, uploads, contentType = 'image/webp' }) {
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
