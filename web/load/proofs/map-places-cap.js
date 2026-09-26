// #756: list_category_places has no order or range, so PostgREST's max_rows silently drops every place past the 1,000th.
import { Counter } from 'k6/metrics';

import { query } from '../lib/api.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { clearAccount } from '../lib/seed.js';
import {
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

// The issue's example is 5,000 free-text find spots; 1,500 is enough to cross supabase/config.toml's max_rows = 1000.
const PLACES = envInt('PROOF_PLACES', 1500);
const SAMPLES = envInt('PROOF_SAMPLES', 5);
// data/items.ts PLACE_PAGE_SIZE; 0 replays the unranged read from before #756's fix.
const CLIENT_PAGE_SIZE = envInt('PROOF_CLIENT_PAGE_SIZE', 1000);

const placesMissing = new Counter('places_missing');
const placesReturned = new Counter('places_returned');

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
    ...probeThresholds(['map_places']),
    // Every distinct place must reach the map; a truncated answer is data loss the user never sees.
    places_missing: ['count<1'],
    places_returned: ['count>0'],
  },
};

export function setup() {
  const owner = newCollector('map-places');
  return seedOrClear([owner], () => {
    const categoryId = newCategory(owner, 'Proof: many places');
    insertEntries({
      session: owner,
      categoryId,
      count: PLACES,
      fields: (n) => ({
        title: `Fund ${n}`,
        description: `Probe ${n}`,
        place: `Fundort ${n}`,
        // Located, so no id list rides along and the rows stay small.
        place_lat: 47 + (n % 500) / 100,
        place_lng: 6 + Math.floor(n / 500) / 10,
        tags: ['antik'],
      }),
    });
    return { owner, categoryId };
  });
}

/** The map's read as the client makes it; a body that is not a row array counts as no places, never as a pass. */
function readPlaces({ session, categoryId }) {
  const rows = [];
  for (let offset = 0; ; offset += CLIENT_PAGE_SIZE) {
    const params = CLIENT_PAGE_SIZE
      ? { cat_id: categoryId, offset, limit: CLIENT_PAGE_SIZE }
      : { cat_id: categoryId };
    const response = call({
      path: `/rest/v1/rpc/list_category_places?${query(params)}`,
      session,
      probe: 'map_places',
    });
    // A failed request ends the iteration before its verdict (INCONCLUSIVE), never reads as missing places.
    if (response.status !== 200)
      throw new Error(`map RPC: HTTP ${response.status} ${response.body}`);
    const body = response.json();
    const page = Array.isArray(body) ? body : [];
    rows.push(...page);
    if (__ITER === 0 && offset === 0) {
      console.info(
        `map RPC: HTTP ${response.status}, ${page.length} rows, Content-Range ${response.headers['Content-Range'] ?? 'none'}`,
      );
    }
    if (!CLIENT_PAGE_SIZE || page.length < CLIENT_PAGE_SIZE) return rows;
  }
}

export function probe({ owner, categoryId }) {
  const rows = readPlaces({ session: owner, categoryId });
  const distinct = new Set(rows.map((row) => row.place)).size;
  placesReturned.add(distinct);
  placesMissing.add(PLACES - distinct);
  measured.add(1);
}

export function teardown({ owner }) {
  clearAccount(owner);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'map-places-cap',
    issue: 756,
    claim:
      'a category with more than 1,000 distinct places gets at most 1,000 back from list_category_places, with no error.',
    notes: [
      `${PLACES} entries, each with its own place string and coordinates; ${SAMPLES} reads of the map exactly as data/items.ts makes them.`,
      '`places_returned` is summed over all reads; divide by the sample count for one read.',
      `The reader mirrors data/items.ts listCategoryPlaces: ${CLIENT_PAGE_SIZE ? `pages of ${CLIENT_PAGE_SIZE} places until a short page` : 'one unranged read, as before the fix'}.`,
    ],
    metrics: ['places_missing', 'places_returned'],
    guards: ['places_returned'],
    data,
  });
}
