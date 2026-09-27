// #757 (PERF-05): the hourly refresh re-signs every entry the session has shown; Storage refuses more than 1,000 paths a call.
import encoding from 'k6/encoding';
import { Counter } from 'k6/metrics';

import { listPage, query } from '../lib/api.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { clearAccount } from '../lib/seed.js';
import {
  BUCKET,
  TINY_WEBP_BASE64,
  attachPhotos,
  call,
  envInt,
  inList,
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

// The issue's walk: about 28 pages of a large category, two photographs per entry, full size plus thumbnail each.
const PAGES = envInt('PROOF_PAGES', 28);
const PHOTOS_EACH = envInt('PROOF_PHOTOS_EACH', 2);
const PAGE_SIZE = 9;
// imageEntries.ts RENDERABLE_PLATES = 1 + STRIP_MAX: only these are signed per card.
const RENDERABLE_PLATES = 5;
// images.ts ID_FILTER_CHUNK_SIZE, ROW_PAGE_SIZE and SIGN_URLS_BATCH_SIZE.
const ID_CHUNK = 100;
const ROW_PAGE = 1000;
const SIGN_BATCH = 1000;
// The claim needs more than Storage's 1,000-path cap in the refresh; a smaller seed would pass with the defect present.
if (PAGES * PAGE_SIZE * Math.min(PHOTOS_EACH, RENDERABLE_PLATES) * 2 <= 1000) {
  throw new Error(
    'sign-many needs more than 1,000 paths in the refresh: raise PROOF_PAGES or PROOF_PHOTOS_EACH',
  );
}

const photosBlanked = new Counter('paths_left_unsigned');
const pathsPerRefresh = new Counter('paths_in_refresh_call');

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
    // Refused sign calls are the defect here, not a harness failure.
    ...probeThresholds(['page_sign', 'refresh_list', 'refresh_sign'], {
      failuresExpected: true,
    }),
    // After the refresh, every photograph the session shows must carry a fresh signature.
    paths_left_unsigned: ['count<1'],
    // An empty Counter reads 0 and would pass the line above; this one fails when the refresh never ran.
    paths_in_refresh_call: ['count>0'],
  },
};

export function setup() {
  const owner = newCollector('sign-many');
  return seedOrClear([owner], () => {
    const categoryId = newCategory(owner, 'Proof: many photographs');
    const itemIds = insertEntries({
      session: owner,
      categoryId,
      count: PAGES * PAGE_SIZE,
      fields: (n) => ({
        title: `Münze ${n}`,
        description: `Probe ${n}`,
        place: 'Rom',
        tags: ['antik'],
      }),
    });
    attachPhotos({
      session: owner,
      itemIds,
      photosEach: PHOTOS_EACH,
      bytes: encoding.b64decode(TINY_WEBP_BASE64, 'std'),
    });
    return { owner, categoryId };
  });
}

function signedPaths({ session, paths, probe }) {
  const response = call({
    method: 'POST',
    path: `/storage/v1/object/sign/${BUCKET}`,
    session,
    body: JSON.stringify({ expiresIn: 3600, paths }),
    headers: { 'Content-Type': 'application/json' },
    probe,
  });
  if (response.status !== 200) {
    console.warn(
      `${probe}: ${paths.length} paths -> HTTP ${response.status} ${response.body}`,
    );
    return new Set();
  }
  return new Set(
    response
      .json()
      .filter((row) => row.signedURL)
      .map((row) => row.path),
  );
}

function pathsOf(images) {
  return images
    .slice(0, RENDERABLE_PLATES)
    .flatMap((image) =>
      image.path_thumb
        ? [image.path_full, image.path_thumb]
        : [image.path_full],
    );
}

/** images.ts listImagesForItems: 100 ids per request, paged at 1,000 rows. */
function listImagesForItems({ session, itemIds }) {
  const rows = [];
  for (let start = 0; start < itemIds.length; start += ID_CHUNK) {
    for (let offset = 0; ; offset += ROW_PAGE) {
      const params = query({
        select: 'id,item_id,path_full,path_thumb',
        item_id: inList(itemIds.slice(start, start + ID_CHUNK)),
        order: 'created_at.asc,id.asc',
        offset,
        limit: ROW_PAGE,
      });
      const page = call({
        path: `/rest/v1/images?${params}`,
        session,
        probe: 'refresh_list',
      }).json();
      rows.push(...page);
      if (page.length < ROW_PAGE) break;
    }
  }
  return rows;
}

export function probe({ owner, categoryId }) {
  // Browsing: each page signs its own cards' paths, a call well under the cap.
  const shown = [];
  for (let page = 1; page <= PAGES; page++) {
    const { items } = listPage({ session: owner, categoryId, page });
    const paths = items.flatMap((item) => pathsOf(item.images));
    signedPaths({ session: owner, paths, probe: 'page_sign' });
    shown.push(...items.map((item) => item.id));
  }

  // An hour later every shown signature is due: refreshAllImages lists them all and imageEntries.ts signs them in batches.
  const images = listImagesForItems({ session: owner, itemIds: shown });
  const byItem = new Map();
  for (const image of images)
    byItem.set(image.item_id, [...(byItem.get(image.item_id) ?? []), image]);
  const wanted = [...byItem.values()].flatMap(pathsOf);
  pathsPerRefresh.add(wanted.length);
  const signed = new Set();
  for (let start = 0; start < wanted.length; start += SIGN_BATCH) {
    const batch = wanted.slice(start, start + SIGN_BATCH);
    for (const path of signedPaths({
      session: owner,
      paths: batch,
      probe: 'refresh_sign',
    }))
      signed.add(path);
  }
  photosBlanked.add(wanted.filter((path) => !signed.has(path)).length);
  measured.add(1);
}

export function teardown({ owner }) {
  clearAccount(owner);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'sign-many',
    issue: 757,
    claim:
      'after paging through ~28 pages, the hourly refresh re-signs every shown path; one createSignedUrls call above 1,000 paths is refused and the visible cards lose their photos.',
    notes: [
      `${PAGES * PAGE_SIZE} entries with ${PHOTOS_EACH} photographs each (real objects), browsed page by page, then refreshed as useItemImages.tsx does after 55 minutes.`,
      'The request sequence mirrors useItemImages.tsx/imageEntries.ts after the fix: the refresh signs in batches of 1,000 paths (SIGN_URLS_BATCH_SIZE).',
    ],
    metrics: ['paths_in_refresh_call', 'paths_left_unsigned'],
    guards: ['paths_in_refresh_call'],
    data,
  });
}
