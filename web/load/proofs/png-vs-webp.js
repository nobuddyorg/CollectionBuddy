// #738 (impact only, no verdict): what Safari's PNG fallback costs per photograph in upload bytes, time and quota; browser/safari-webp.js is the red/green proof.
import { check } from 'k6';
import { Trend } from 'k6/metrics';

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
} from './lib/fixtures.js';
import {
  PROOF_TREND_STATS,
  measured,
  probeThresholds,
  proofSummary,
} from './lib/report.js';

// Public-domain / CC0 photographs from scikit-image's sample data, run through fixtures/generate.mjs.
const PHOTOS = ['astronaut', 'coffee', 'chelsea'];
// What Safari sends today is PNG; PROOF_SAFARI_FORMAT=jpeg compares a candidate fix's format instead.
const SAFARI_FORMAT = __ENV.PROOF_SAFARI_FORMAT || 'png';
const SAMPLES = envInt('PROOF_SAMPLES', 5);
const CONTENT_TYPE = {
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
};
// PNG is the defect: stored under a .webp name. JPEG is the fix: named after its type (data/photoType.ts).
const EXTENSION = { webp: 'webp', png: 'webp', jpeg: 'jpg' };

const fixtures = {};
for (const photo of PHOTOS) {
  for (const format of ['webp', SAFARI_FORMAT]) {
    fixtures[`${photo}.${format}`] = {
      full: open(`./fixtures/${photo}.full.${format}`, 'b'),
      thumb: open(`./fixtures/${photo}.thumb.${format}`, 'b'),
    };
  }
}

const quotaBytes = new Trend('quota_bytes_per_photo');
const uploadBytes = new Trend('upload_bytes_per_photo');
const safariOverWebp = new Trend('safari_over_webp_quota');

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: {
    probe: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: SAMPLES,
      exec: 'probe',
    },
  },
  thresholds: {
    ...probeThresholds(['upload_webp', `upload_${SAFARI_FORMAT}`]),
    'quota_bytes_per_photo{format:webp}': [],
    [`quota_bytes_per_photo{format:${SAFARI_FORMAT}}`]: [],
    'upload_bytes_per_photo{format:webp}': [],
    [`upload_bytes_per_photo{format:${SAFARI_FORMAT}}`]: [],
    // No limit: the ratio follows from the fixture bytes alone, so it cannot tell a fixed app from a broken one.
    safari_over_webp_quota: [],
  },
};

export function setup() {
  const owner = newCollector('png-vs-webp');
  return seedOrClear([owner], () => {
    const categoryId = newCategory(owner, 'Proof: photo formats');
    const itemIds = insertEntries({
      session: owner,
      categoryId,
      count: PHOTOS.length,
      fields: (n) => ({
        title: `Photo ${PHOTOS[n]}`,
        description: 'Formatvergleich',
        place: 'Wien',
        tags: ['photo'],
      }),
    });
    return { owner, itemIds };
  });
}

function upload({ session, path, bytes, format }) {
  return call({
    method: 'POST',
    path: `/storage/v1/object/${BUCKET}/${path}`,
    session,
    body: bytes,
    headers: { 'Content-Type': CONTENT_TYPE[format] },
    probe: `upload_${format}`,
  });
}

/** One photograph as useItemImages.tsx stores it: full size and thumbnail, then the row. */
function store({ session, itemId, photo, format }) {
  const { full, thumb } = fixtures[`${photo}.${format}`];
  const base = `${session.userId}/${itemId}/${crypto.randomUUID()}`;
  const extension = EXTENSION[format];
  upload({ session, path: `${base}.${extension}`, bytes: full, format });
  upload({ session, path: `${base}.thumb.${extension}`, bytes: thumb, format });
  const row = call({
    method: 'POST',
    path: '/rest/v1/images?select=size_bytes',
    session,
    body: JSON.stringify({
      item_id: itemId,
      path_full: `${base}.${extension}`,
      path_thumb: `${base}.thumb.${extension}`,
      size_bytes: full.byteLength,
    }),
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    probe: 'image_row',
  });
  // size_bytes is what the quota trigger counts, taken from Storage's own metadata.
  const counted = row.json()[0].size_bytes;
  quotaBytes.add(counted, { format });
  uploadBytes.add(full.byteLength + thumb.byteLength, { format });
  return counted;
}

export function probe({ owner, itemIds }) {
  PHOTOS.forEach((photo, index) => {
    const itemId = itemIds[index];
    const webp = store({ session: owner, itemId, photo, format: 'webp' });
    const safari = store({
      session: owner,
      itemId,
      photo,
      format: SAFARI_FORMAT,
    });
    check(null, {
      'quota counts the stored bytes': () => webp > 0 && safari > 0,
    });
    safariOverWebp.add(safari / webp);
  });
  measured.add(1);
}

export function teardown({ owner }) {
  clearAccount(owner);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'png-vs-webp',
    issue: 738,
    claim:
      "Safari's toBlob cannot encode WebP, so its uploads are PNG under a .webp name; this measures what that costs in bytes, upload time and quota. It carries no verdict: browser/safari-webp.js proves the fix.",
    notes: [
      `Photographs: ${PHOTOS.join(', ')} (scikit-image sample data, public domain / CC0), all below 1000 px, so full size is the source resolution and the thumbnail is made from it as the upload path does; see fixtures/manifest.json. Absolute bytes are therefore below the app's 1000 px uploads; the ratio is the point.`,
      `Compared format: ${SAFARI_FORMAT}. WebP at q0.8 stands for Chromium and Firefox.`,
      "PNG encoded by sharp with adaptive filtering, as browsers' encoders do.",
    ],
    metrics: [
      'quota_bytes_per_photo{format:webp}',
      `quota_bytes_per_photo{format:${SAFARI_FORMAT}}`,
      'upload_bytes_per_photo{format:webp}',
      `upload_bytes_per_photo{format:${SAFARI_FORMAT}}`,
      'safari_over_webp_quota',
    ],
    purpose: 'record',
    data,
  });
}
