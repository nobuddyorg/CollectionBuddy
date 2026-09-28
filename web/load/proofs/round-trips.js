// #780: export and category delete read photos in 100-id chunks (PERF-14, ~400 extra requests each at 40,000 entries); a search page costs a third round trip (PERF-13). Mirrors the fixed client.
import { Trend } from 'k6/metrics';

import {
  countItems,
  listPage,
  searchPage,
  signUrlsRequest,
} from '../lib/api.js';
import { platePaths } from '../lib/flows.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { NOUNS, clearAccount } from '../lib/seed.js';
import {
  CLIENT_EXPORT_INNER,
  EMBEDDED_INNER,
  ID_CHUNK,
  ITEM_PAGE,
  ROW_PAGE,
  SIGN_BATCH,
  deleteMetadata,
  exportPages,
  signBatches,
} from './lib/bulkReads.js';
import {
  ENTRIES,
  PHOTO_EVERY,
  seedDeepCatalogue,
} from './lib/deepCatalogue.js';
import { call, envInt, probeMs } from './lib/fixtures.js';
import {
  PROOF_TREND_STATS,
  measured,
  probeThresholds,
  proofSummary,
} from './lib/report.js';

const SAMPLES = envInt('PROOF_SAMPLES', 3);
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
  return seedDeepCatalogue('round-trips');
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
