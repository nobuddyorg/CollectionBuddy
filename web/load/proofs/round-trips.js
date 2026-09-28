// #780: export and category delete read photos in 100-id chunks (PERF-14, ~400 extra requests each at 40,000 entries); a search page costs a third round trip (PERF-13). Mirrors the fixed client.
import http from 'k6/http';
import { Trend } from 'k6/metrics';

import {
  ITEM_FIELDS,
  countItems,
  listPage,
  query,
  searchPage,
  signUrlsRequest,
} from '../lib/api.js';
import { platePaths } from '../lib/flows.js';
import { authHeaders, expectOk } from '../lib/http.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { NOUNS, clearAccount } from '../lib/seed.js';
import { SUPABASE_URL } from '../lib/target.js';
import {
  BUCKET,
  attachPhotos,
  call,
  envInt,
  inList,
  insertEntries,
  newCategory,
  newCollector,
  probeMs,
  seedOrClear,
} from './lib/fixtures.js';
import {
  PROOF_TREND_STATS,
  measured,
  probeThresholds,
  proofSummary,
} from './lib/report.js';

const ENTRIES = envInt('PROOF_ENTRIES', 40000);
const PHOTO_EVERY = envInt('PROOF_PHOTO_EVERY', 10);
const SAMPLES = envInt('PROOF_SAMPLES', 3);
// exportCategory.ts ITEM_PAGE_SIZE, SIGN_BATCH_SIZE, SIGN_CONCURRENCY; data/postgrestLimits.ts ID_FILTER_CHUNK_SIZE, POSTGREST_MAX_ROWS; pages.ts CHUNK_READ_CONCURRENCY.
const ITEM_PAGE = 500;
const SIGN_BATCH = 100;
const CONCURRENCY = 6;
const ID_CHUNK = 100;
const ROW_PAGE = 1000;
const PHOTOS = PHOTO_EVERY ? Math.ceil(ENTRIES / PHOTO_EVERY) : 0;
// What the suggested fix costs: keyset pages with photos embedded (plus the short last page), then the same sign batches.
const EMBEDDED_BUDGET =
  Math.floor(ENTRIES / ITEM_PAGE) + 1 + Math.ceil(PHOTOS / SIGN_BATCH);
// The delete fix reads paths with one keyset-paged images query joined to the category; the linked-elsewhere chunks may stay.
const DELETE_BUDGET =
  Math.floor(ENTRIES / ROW_PAGE) +
  1 +
  Math.ceil(ENTRIES / ID_CHUNK) +
  Math.floor(PHOTOS / ROW_PAGE) +
  1;

const exportRequests = new Trend('export_metadata_requests');
const exportCurrentOverEmbedded = new Trend('export_current_over_embedded');
const deleteRequests = new Trend('delete_metadata_requests');
const searchRoundTrips = new Trend('search_page_round_trips');
const browseRoundTrips = new Trend('browse_page_round_trips');

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: PROOF_TREND_STATS,
  // One after the other, so neither measurement competes with the other's requests.
  scenarios: {
    searchPhotos: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 20,
      maxDuration: '50s',
      exec: 'searchPhotos',
    },
    metadata: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: SAMPLES,
      startTime: '1m',
      exec: 'bulkMetadata',
    },
  },
  thresholds: {
    ...probeThresholds(
      [
        'export_current',
        'export_embedded',
        'delete_current',
        'browse_to_photos',
        'search_to_photos',
        'browse_sign',
        'search_sign',
      ],
      { scenarios: ['searchPhotos', 'metadata'] },
    ),
    // PERF-14: the metadata phase should cost what the embedded read costs, not N/100 more. An empty Trend reads 0, hence min>0.
    [`export_metadata_requests{pattern:current}`]: [
      `max<=${EMBEDDED_BUDGET}`,
      'min>0',
    ],
    [`export_metadata_requests{pattern:embedded}`]: ['min>0'],
    export_current_over_embedded: [],
    // PERF-14's delete half: today ~841 reads at 40,000 entries.
    delete_metadata_requests: [`max<=${DELETE_BUDGET}`, 'min>0'],
    // PERF-13: a search page should reach its photographs in two sequential round trips, the RPC and the sign call.
    search_page_round_trips: ['max<=2', 'min>0'],
    browse_page_round_trips: [],
  },
};

export function setup() {
  const owner = newCollector('round-trips');
  return seedOrClear([owner], () => {
    const categoryId = newCategory(owner, 'Proof: round trips');
    const itemIds = insertEntries({
      session: owner,
      categoryId,
      count: ENTRIES,
      fields: (n) => ({
        title: `${NOUNS[n % NOUNS.length]} ${n}`,
        description: `Probe ${n}`,
        place: 'Prag',
        tags: ['silber'],
      }),
    });
    attachPhotos({
      session: owner,
      itemIds: PHOTO_EVERY
        ? itemIds.filter((_, n) => n % PHOTO_EVERY === 0)
        : [],
      photosEach: 1,
    });
    return { owner, categoryId };
  });
}

function authorized(session, probe, extra = {}) {
  return {
    headers: { ...authHeaders(session), ...extra },
    tags: { name: probe, probe },
  };
}

// exportItemPages.ts EXPORT_ITEM_SELECT: the client's read, photographs embedded since #780.
const CLIENT_EXPORT_INNER = `${ITEM_FIELDS},created_at,images(item_id,path_full,size_bytes)`;
// The suggested fix's read, which the budget is taken from.
const EMBEDDED_INNER = `${ITEM_FIELDS},created_at,images(path_full,size_bytes)`;

/** exportItemPages.ts rawListItemsForExport, keyset-paged, each item with its photographs oldest-first. */
function exportPages({ session, categoryId, inner, probe }) {
  const items = [];
  let requests = 0;
  let after = null;
  do {
    const params = {
      select: `created_at,item_id,items!inner(${inner})`,
      category_id: `eq.${categoryId}`,
      order: 'created_at.asc,item_id.asc',
      'items.images.order': 'created_at.asc,id.asc',
      limit: ITEM_PAGE,
    };
    if (after) {
      const linkedAt = `"${after.created_at}"`;
      params.created_at = `gte.${after.created_at}`;
      params.or = `(created_at.gt.${linkedAt},and(created_at.eq.${linkedAt},item_id.gt."${after.item_id}"))`;
    }
    const rows = call({
      path: `/rest/v1/item_categories?${query(params)}`,
      session,
      probe,
    }).json();
    requests += 1;
    items.push(...rows.map((row) => row.items));
    after = rows.length === ITEM_PAGE ? rows[rows.length - 1] : null;
  } while (after);
  return {
    paths: items.flatMap((item) => item.images.map((image) => image.path_full)),
    requests,
  };
}

/** readAllChunks over 100-id chunks, six at a time; each chunk here stays under one 1,000-row page, which is checked. */
function chunkedReads({ session, ids, probe, pathFor }) {
  const rows = [];
  let requests = 0;
  for (let start = 0; start < ids.length; start += ID_CHUNK * CONCURRENCY) {
    const batch = [];
    for (
      let chunk = start;
      chunk < Math.min(ids.length, start + ID_CHUNK * CONCURRENCY);
      chunk += ID_CHUNK
    ) {
      batch.push({
        method: 'GET',
        url: `${SUPABASE_URL}${pathFor(ids.slice(chunk, chunk + ID_CHUNK))}`,
        params: authorized(session, probe),
      });
    }
    for (const response of http.batch(batch)) {
      probeMs.add(response.timings.duration, { probe });
      const page = expectOk(response, probe).json();
      if (page.length >= ROW_PAGE)
        throw new Error(
          `${probe}: a chunk filled a whole page; the mirror would need a second page`,
        );
      rows.push(...page);
    }
    requests += batch.length;
  }
  return { rows, requests };
}

/** useCategories.tsx's delete, reads only: the category's item ids, which of them are linked elsewhere, then the category's photo paths. */
function deleteMetadata({ session, categoryId }) {
  const itemIds = [];
  let requests = 0;
  // categories.ts listItemIdsForCategory: 1,000-row pages until a short one.
  for (let offset = 0; ; offset += ROW_PAGE) {
    const response = call({
      path: `/rest/v1/item_categories?${query({ select: 'item_id', category_id: `eq.${categoryId}`, offset, limit: ROW_PAGE })}`,
      session,
      probe: 'delete_current',
    });
    const page = expectOk(response, 'delete_current').json();
    requests += 1;
    itemIds.push(...page.map((row) => row.item_id));
    if (page.length < ROW_PAGE) break;
  }
  const linked = chunkedReads({
    session,
    ids: itemIds,
    probe: 'delete_current',
    pathFor: (ids) =>
      `/rest/v1/item_categories?${query({ select: 'item_id', item_id: inList(ids), category_id: `neq.${categoryId}`, offset: 0, limit: ROW_PAGE })}`,
  });
  // images.ts listImagePathsForCategory: one keyset walk over the category's photographs; the client keeps the orphans' client-side.
  let pathRequests = 0;
  let after = null;
  for (;;) {
    const params = {
      select:
        'id,item_id,path_full,path_thumb,items!inner(item_categories!inner())',
      'items.item_categories.category_id': `eq.${categoryId}`,
      order: 'id.asc',
      limit: ROW_PAGE,
    };
    if (after) params.id = `gt.${after}`;
    const response = call({
      path: `/rest/v1/images?${query(params)}`,
      session,
      probe: 'delete_current',
    });
    const page = expectOk(response, 'delete_current').json();
    pathRequests += 1;
    if (page.length < ROW_PAGE) break;
    after = page[page.length - 1].id;
  }
  return requests + linked.requests + pathRequests;
}

/** exportCategory.ts signAll: 100 paths per call, six calls at a time. */
function signBatches({ session, paths, probe }) {
  const batches = [];
  for (let start = 0; start < paths.length; start += SIGN_BATCH)
    batches.push(paths.slice(start, start + SIGN_BATCH));
  let requests = 0;
  for (let start = 0; start < batches.length; start += CONCURRENCY) {
    const requestsNow = batches
      .slice(start, start + CONCURRENCY)
      .map((batch) => ({
        method: 'POST',
        url: `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}`,
        body: JSON.stringify({ expiresIn: 21600, paths: batch }),
        params: authorized(session, probe, {
          'Content-Type': 'application/json',
        }),
      }));
    for (const response of http.batch(requestsNow))
      probeMs.add(response.timings.duration, { probe });
    requests += requestsNow.length;
  }
  return requests;
}

/** Export's and category delete's metadata phases, read-only; nothing is deleted. */
export function bulkMetadata({ owner, categoryId }) {
  const currentStart = Date.now();
  const current = exportPages({
    session: owner,
    categoryId,
    inner: CLIENT_EXPORT_INNER,
    probe: 'export_current',
  });
  const currentSigns = signBatches({
    session: owner,
    paths: current.paths,
    probe: 'export_current',
  });
  const currentMs = Date.now() - currentStart;
  exportRequests.add(current.requests + currentSigns, { pattern: 'current' });

  const embeddedStart = Date.now();
  const embedded = exportPages({
    session: owner,
    categoryId,
    inner: EMBEDDED_INNER,
    probe: 'export_embedded',
  });
  const embeddedSigns = signBatches({
    session: owner,
    paths: embedded.paths,
    probe: 'export_embedded',
  });
  const embeddedMs = Date.now() - embeddedStart;
  exportRequests.add(embedded.requests + embeddedSigns, {
    pattern: 'embedded',
  });
  exportCurrentOverEmbedded.add(currentMs / embeddedMs);
  deleteRequests.add(deleteMetadata({ session: owner, categoryId }));
  measured.add(1);
}

function signPage({ session, paths, probe }) {
  return call({ ...signUrlsRequest({ session, paths }), probe });
}

/** Wall time and sequential steps from request to signed URLs: browse = (ids ∥ count) → entries → sign; search = rpc → sign. */
export function searchPhotos({ owner, categoryId }) {
  const browseStart = Date.now();
  // The app sends list and count in parallel; k6 sends them one after the other, which only slows browse, not search.
  const { items } = listPage({ session: owner, categoryId, page: 1 });
  countItems(owner, categoryId);
  // listPage reads the page's ids, then its entries with their photographs: two steps.
  let browseSteps = items.length ? 2 : 1;
  const browsePaths = items.flatMap((item) => platePaths(item.images));
  if (browsePaths.length) {
    signPage({ session: owner, paths: browsePaths, probe: 'browse_sign' });
    browseSteps += 1;
  }
  probeMs.add(Date.now() - browseStart, { probe: 'browse_to_photos' });
  browseRoundTrips.add(browseSteps);

  const searchStart = Date.now();
  const found = searchPage({
    session: owner,
    categoryId,
    term: NOUNS[0],
    page: 1,
  }).json();
  let searchSteps = 1;
  // itemPage.ts searchedPage: each row carries its photographs since #780.
  const searchPaths = found.flatMap((row) => platePaths(row.images));
  if (searchPaths.length) {
    signPage({ session: owner, paths: searchPaths, probe: 'search_sign' });
    searchSteps += 1;
  }
  probeMs.add(Date.now() - searchStart, { probe: 'search_to_photos' });
  searchRoundTrips.add(searchSteps);
  measured.add(1);
}

export function teardown({ owner }) {
  clearAccount(owner);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'round-trips',
    issue: 780,
    claim:
      "export's and category delete's metadata phases each send ~N/100 extra image-listing requests (PERF-14), and a search page needs a third sequential round trip, an images read, to reach its photographs (PERF-13). PERF-15 (retries, jitter) is client logic outside k6.",
    notes: [
      `${ENTRIES} entries, ${PHOTOS} photographs (every ${PHOTO_EVERY || 'no'}th entry).`,
      `Budgets: embedded export ${EMBEDDED_BUDGET} requests (item pages + sign batches); delete ${DELETE_BUDGET} (id pages + linked-elsewhere chunks + one keyset images read). Delete is measured read-only: nothing is deleted.`,
      'Against a local stack a round trip costs well under a millisecond, so wall-time ratios understate what users see; the request counts are the load-independent evidence.',
      'Request shapes mirror exportCategory.ts, exportItemPages.ts, images.ts, categories.ts, useCategories.tsx and useItemImages.tsx; update them with the fix.',
    ],
    metrics: [
      'export_metadata_requests{pattern:current}',
      'export_metadata_requests{pattern:embedded}',
      'export_current_over_embedded',
      'delete_metadata_requests',
      'search_page_round_trips',
      'browse_page_round_trips',
    ],
    data,
  });
}
