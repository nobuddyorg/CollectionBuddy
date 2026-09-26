// #765: once the photo quota refuses a row, import still uploads every later photograph twice and retries permanent Storage errors.
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { clearAccount } from '../lib/seed.js';
import {
  BUCKET,
  call,
  envInt,
  insertEntries,
  newCategory,
  newCollector,
  seedOrClear,
  uploadAll,
} from './lib/fixtures.js';
import { insertRows, removeObjects } from '../lib/api.js';
import {
  PROOF_TREND_STATS,
  measured,
  probeThresholds,
  proofSummary,
} from './lib/report.js';

// 0025_photo_ceilings_fit_the_plan.sql: 256 MiB of photographs and thumbnails; a row whose object is missing counts as the bucket's 5 MiB cap.
const QUOTA_BYTES = 268435456;
const FALLBACK_BYTES = 5242880;
const FALLBACK_ROWS = Math.floor(QUOTA_BYTES / FALLBACK_BYTES);
// importPhoto.ts PHOTO_UPLOAD_ATTEMPTS and PHOTO_UPLOAD_RETRY_BASE_MS.
const ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const PHOTOS = envInt('PROOF_PHOTOS', 20);
// How many of them still fit under the quota; the rest meet a full quota.
const FITTING = envInt('PROOF_FITTING', 5);
// A full-size photograph and its thumbnail; Storage checks the declared type, not the bytes.
const PHOTO_BYTES = envInt('PROOF_PHOTO_KIB', 150) * 1024;
const THUMB_BYTES = envInt('PROOF_THUMB_KIB', 20) * 1024;

const bytesAfterRefusal = new Counter('bytes_uploaded_after_refusal');
const orphans = new Counter('orphaned_objects');
const orphansAfterRefusal = new Counter('orphaned_after_refusal');
const retriesOnPermanent = new Counter('retries_after_permanent_error');
const skipped = new Counter('photos_skipped');
const imported = new Counter('photos_imported');

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: {
    probe: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      exec: 'probe',
    },
  },
  thresholds: {
    // Refusals are what is under test, not harness failures.
    ...probeThresholds(['upload', 'image_row', 'permanent_upload'], {
      failuresExpected: true,
    }),
    // Preconditions: some photographs fit and at least one met the full quota; empty Counters would pass the lines below.
    photos_imported: ['count>0'],
    photos_skipped: ['count>0'],
    // After the first quota refusal, nothing more should be sent or left behind.
    bytes_uploaded_after_refusal: ['count<1'],
    orphaned_after_refusal: ['count<1'],
    // A 409 duplicate or 413 oversize cannot succeed on a retry.
    retries_after_permanent_error: ['count<1'],
  },
};

function bytesOf(length, seed) {
  const bytes = new Uint8Array(length);
  let state = seed;
  for (let index = 0; index < length; index++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    bytes[index] = state >> 16;
  }
  return bytes.buffer;
}

export function setup() {
  const owner = newCollector('quota-import');
  return seedOrClear([owner], () => seedFullQuota(owner));
}

function seedFullQuota(owner) {
  const categoryId = newCategory(owner, 'Proof: import into a full quota');
  const [fillerItem, ...photoItems] = insertEntries({
    session: owner,
    categoryId,
    count: PHOTOS + 1,
    fields: (n) => ({
      title: `Import ${n}`,
      description: `Probe ${n}`,
      place: 'Köln',
      tags: ['antik'],
    }),
  });

  // 51 rows at the 5 MiB fallback, then one real object that leaves room for exactly FITTING photographs with thumbnails.
  const fallbackRows = Array.from({ length: FALLBACK_ROWS }, () => ({
    item_id: fillerItem,
    path_full: `${owner.userId}/${fillerItem}/${crypto.randomUUID()}.webp`,
    path_thumb: null,
    size_bytes: 0,
  }));
  insertRows({ session: owner, table: 'images', rows: fallbackRows });
  const headroom = QUOTA_BYTES - FALLBACK_ROWS * FALLBACK_BYTES;
  const fillerBytes = headroom - FITTING * (PHOTO_BYTES + THUMB_BYTES) - 1;
  if (fillerBytes <= 0 || fillerBytes > FALLBACK_BYTES) {
    throw new Error(
      `PROOF_FITTING x (PROOF_PHOTO_KIB + PROOF_THUMB_KIB) must fit in ${headroom} bytes of headroom`,
    );
  }
  const fillerPath = `${owner.userId}/${fillerItem}/${crypto.randomUUID()}.webp`;
  uploadAll({
    session: owner,
    uploads: [{ path: fillerPath, bytes: bytesOf(fillerBytes, 7) }],
  });
  insertRows({
    session: owner,
    table: 'images',
    rows: [
      {
        item_id: fillerItem,
        path_full: fillerPath,
        path_thumb: null,
        size_bytes: 0,
      },
    ],
  });
  return { owner, photoItems };
}

function upload({ session, path, bytes, probe = 'upload' }) {
  return call({
    method: 'POST',
    path: `/storage/v1/object/${BUCKET}/${path}`,
    session,
    body: bytes,
    headers: { 'Content-Type': 'image/webp' },
    probe,
  });
}

/** importPhoto.ts isTransientUploadError: no response, a 429 or a 5xx, by HTTP status or by Storage's own `statusCode`. */
function isTransient(response) {
  if (response.status === 0) return true;
  let statusCode;
  try {
    statusCode = Number(response.json('statusCode'));
  } catch {
    statusCode = Number.NaN;
  }
  return [response.status, statusCode].some(
    (code) => code === 429 || code >= 500,
  );
}

/** importPhoto.ts uploadWithRetry: a transient failure retried, with 500 ms x 2^n between attempts; returns the attempts made and bytes sent. */
function uploadWithRetry({ session, path, bytes, probe }) {
  let response;
  let sent = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) sleep((RETRY_BASE_MS * 2 ** (attempt - 1)) / 1000);
    response = upload({ session, path, bytes, probe });
    sent += bytes.byteLength;
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, attempts: attempt + 1, sent, response };
    }
    if (!isTransient(response)) {
      return { ok: false, attempts: attempt + 1, sent, response };
    }
  }
  return { ok: false, attempts: ATTEMPTS, sent, response };
}

function listFolder({ session, prefix }) {
  const response = call({
    method: 'POST',
    path: `/storage/v1/object/list/${BUCKET}`,
    session,
    body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
    headers: { 'Content-Type': 'application/json' },
    probe: 'list_folder',
  });
  return response.json().map((entry) => `${prefix}/${entry.name}`);
}

/** importPhoto.ts importPhoto: full size, thumbnail, then the row; a refused row skips the photograph. */
function importOne({ session, itemId, photoBytes, thumbBytes }) {
  const base = `${session.userId}/${itemId}/${crypto.randomUUID()}`;
  const full = uploadWithRetry({
    session,
    path: `${base}.webp`,
    bytes: photoBytes,
  });
  if (!full.ok) return { recorded: false, uploaded: [], sent: full.sent };
  const thumb = uploadWithRetry({
    session,
    path: `${base}.thumb.webp`,
    bytes: thumbBytes,
  });
  const uploaded = thumb.ok
    ? [`${base}.webp`, `${base}.thumb.webp`]
    : [`${base}.webp`];
  const row = call({
    method: 'POST',
    path: '/rest/v1/images',
    session,
    body: JSON.stringify({
      item_id: itemId,
      path_full: `${base}.webp`,
      path_thumb: thumb.ok ? `${base}.thumb.webp` : null,
      size_bytes: photoBytes.byteLength,
    }),
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    probe: 'image_row',
  });
  return {
    recorded: row.status === 201,
    uploaded,
    sent: full.sent + thumb.sent,
    refusal: row.status === 201 ? '' : row.body,
    quotaReached: row.status !== 201 && row.json('code') === 'PT507',
  };
}

export function probe({ owner, photoItems }) {
  const photoBytes = bytesOf(PHOTO_BYTES, 11);
  const thumbBytes = bytesOf(THUMB_BYTES, 13);
  let refused = false;
  let firstRefusal = '';
  let quotaReached = false;
  for (const itemId of photoItems) {
    // importCategory.ts: a quota refusal stops the pool, so the rest are skipped unsent.
    if (quotaReached) {
      skipped.add(1);
      continue;
    }
    const result = importOne({
      session: owner,
      itemId,
      photoBytes,
      thumbBytes,
    });
    if (result.recorded) {
      imported.add(1);
      continue;
    }
    skipped.add(1);
    // Server-side proof: what Storage still holds for a photograph no row points at.
    const held = listFolder({
      session: owner,
      prefix: `${owner.userId}/${itemId}`,
    });
    const left = result.uploaded.filter((path) => held.includes(path)).length;
    orphans.add(left);
    // The refusal that reveals the full quota is unavoidable; everything after it is the defect.
    if (refused) {
      bytesAfterRefusal.add(result.sent);
      orphansAfterRefusal.add(left);
    }
    refused = true;
    quotaReached = result.quotaReached;
    firstRefusal ||= result.refusal;
  }
  console.info(`first refusal: ${firstRefusal}`);
  check(null, {
    'the quota refused the photographs past the headroom': () => refused,
  });

  // Permanent errors through the same retry loop: a path written twice and an object over the bucket's 5 MiB cap.
  const taken = `${owner.userId}/${photoItems[0]}/${crypto.randomUUID()}.webp`;
  upload({
    session: owner,
    path: taken,
    bytes: thumbBytes,
    probe: 'permanent_upload',
  });
  const permanent = [
    { label: 'duplicate path', path: taken, bytes: thumbBytes },
    {
      label: 'over 5 MiB',
      path: `${owner.userId}/${photoItems[0]}/${crypto.randomUUID()}.webp`,
      bytes: bytesOf(FALLBACK_BYTES + 1, 17),
    },
  ];
  for (const { label, path, bytes } of permanent) {
    const result = uploadWithRetry({
      session: owner,
      path,
      bytes,
      probe: 'permanent_upload',
    });
    retriesOnPermanent.add(result.attempts - 1);
    console.info(
      `${label}: HTTP ${result.response.status} ${result.response.body} after ${result.attempts} attempts`,
    );
  }
  measured.add(1);
}

// Orphans have no images row, so clearAccount cannot find them; each photo item's folder is emptied first.
export function teardown({ owner, photoItems }) {
  const left = photoItems.flatMap((itemId) =>
    listFolder({ session: owner, prefix: `${owner.userId}/${itemId}` }),
  );
  if (left.length > 0) removeObjects(owner, left);
  clearAccount(owner);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'quota-refused-import',
    issue: 765,
    claim:
      'after the photo quota refuses one photograph, import still uploads every remaining one (full size and thumbnail), leaves both objects orphaned, and retries 4xx errors that cannot succeed.',
    notes: [
      `Quota prefilled to leave room for ${FITTING} of ${PHOTOS} photographs of ${PHOTO_BYTES / 1024} KiB (thumbnail ${THUMB_BYTES / 1024} KiB).`,
      'The request sequence mirrors importPhoto.ts and importCategory.ts one photograph at a time: a quota refusal stops the rest, and only no response, a 429 or a 5xx is retried. The app runs 6 at once, so up to 5 already in flight may still finish.',
      "`orphaned_objects` (all) and `orphaned_after_refusal` (past the first refusal) are counted from Storage's own folder listing.",
    ],
    metrics: [
      'photos_imported',
      'photos_skipped',
      'bytes_uploaded_after_refusal',
      'orphaned_objects',
      'orphaned_after_refusal',
      'retries_after_permanent_error',
    ],
    guards: ['photos_imported', 'photos_skipped'],
    data,
  });
}
