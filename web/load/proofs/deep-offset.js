// #758: the catalogue's last page costs O(offset) because PostgREST builds the item and photo embed for every skipped row.
import { check } from 'k6';
import { Trend } from 'k6/metrics';

import { listPage, query } from '../lib/api.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { clearAccount } from '../lib/seed.js';
import {
  ENTRIES,
  LAST_PAGE,
  PAGE_SIZE,
  PHOTO_EVERY,
  seedDeepCatalogue,
} from './lib/deepCatalogue.js';
import { call, envInt, inList, probeMs } from './lib/fixtures.js';
import {
  PROOF_TREND_STATS,
  measured,
  probeThresholds,
  proofSummary,
} from './lib/report.js';

const SAMPLES = envInt('PROOF_SAMPLES', 30);
const ITEM_FIELDS = 'id,title,description,place,place_lat,place_lng,tags';
// The repo's own p95 budget for a browse request (lib/options.js P95_MS.browse).
const BROWSE_P95_MS = 150;

const lastOverTwoStep = new Trend('last_page_over_two_step');

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
    ...probeThresholds(
      [
        'first_page',
        'last_page',
        'ids_only_last',
        'embed_nine',
        'two_step_last',
      ],
      {
        limits: { last_page: [`p(95)<${BROWSE_P95_MS}`] },
      },
    ),
    // The fix's own lower bound: page the ids, then embed nine rows. Today the embed walk is tens of times dearer.
    last_page_over_two_step: ['med<3'],
  },
};

export function setup() {
  return seedDeepCatalogue('deep-offset');
}

function idsOnlyPage({ session, categoryId, page }) {
  const params = query({
    select: 'item_id',
    category_id: `eq.${categoryId}`,
    order: 'created_at.desc,item_id.asc',
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  return call({
    path: `/rest/v1/item_categories?${params}`,
    session,
    probe: 'ids_only_last',
  });
}

function embedNine({ session, itemIds }) {
  const params = query({
    select: `${ITEM_FIELDS},images(id,item_id,path_full,path_thumb)`,
    id: inList(itemIds),
    'images.order': 'created_at.asc,id.asc',
  });
  return call({
    path: `/rest/v1/items?${params}`,
    session,
    probe: 'embed_nine',
  });
}

export function probe({ owner, categoryId }) {
  const first = listPage({ session: owner, categoryId, page: 1 });
  probeMs.add(first.durationMs, { probe: 'first_page' });

  // lib/api.js listPage mirrors data/itemPage.ts listItems; a change to how a page is read lands there and this follows.
  const last = listPage({ session: owner, categoryId, page: LAST_PAGE });
  probeMs.add(last.durationMs, { probe: 'last_page' });
  const expectedRows = ENTRIES % PAGE_SIZE || PAGE_SIZE;
  check(last, {
    'last page holds the remainder': (page) =>
      page.items.length === expectedRows,
  });

  const ids = idsOnlyPage({ session: owner, categoryId, page: LAST_PAGE });
  const embedded = embedNine({
    session: owner,
    itemIds: ids.json().map((row) => row.item_id),
  });
  const twoStep = ids.timings.duration + embedded.timings.duration;
  probeMs.add(twoStep, { probe: 'two_step_last' });
  lastOverTwoStep.add(last.durationMs / twoStep);
  measured.add(1);
}

export function teardown({ owner }) {
  clearAccount(owner);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'deep-offset',
    issue: 758,
    claim:
      'the last catalogue page costs O(offset) because the embed is built for every skipped row; paging the ids first and embedding only nine rows removes it.',
    notes: [
      `${ENTRIES} entries in one category, every ${PHOTO_EVERY || 'no'}th with a photograph; last page ${LAST_PAGE}.`,
      `${SAMPLES} sequential samples from one VU, so no probe competes with another.`,
      '`two_step_last` = ids-only page + nine-row embed: the lower bound of the suggested fix.',
    ],
    metrics: ['last_page_over_two_step'],
    data,
  });
}
