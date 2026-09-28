// Category delete: its cascade unfiles every entry, and delete_item_if_orphan() must remove the orphans in time linear in their number.
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

import { insertReturning, query } from '../lib/api.js';
import { authHeaders, countedTotal, expectOk } from '../lib/http.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { NOUNS, clearAccount } from '../lib/seed.js';
import { SUPABASE_URL } from '../lib/target.js';
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

// 40,000 stays under the 50,000-entry owner quota; the small size is a quarter of it, so linear growth reads as 1.
const ENTRIES = envInt('PROOF_ENTRIES', 40000);
const SMALL_ENTRIES = envInt('PROOF_SMALL_ENTRIES', Math.ceil(ENTRIES / 4));
// Well under the 8 s statement_timeout the authenticated role runs with.
const DELETE_BUDGET_MS = envInt('PROOF_DELETE_BUDGET_MS', 4000);
// Concurrent empty deletes, over PostgREST's default pool of 10, so every pooled connection plans the trigger once.
const WARM_DELETES = envInt('PROOF_WARM_DELETES', 30);

const deleteCompleted = new Rate('delete_completed');
const orphansRemoved = new Rate('orphans_removed');
const perEntryGrowth = new Trend('delete_per_entry_growth');

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  batchPerHost: WARM_DELETES,
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
    // A delete that runs into statement_timeout is the defect, not a broken run.
    ...probeThresholds(['delete_small', 'delete_large'], {
      limits: { delete_large: [`max<${DELETE_BUDGET_MS}`] },
      failuresExpected: true,
    }),
    delete_completed: ['rate==1'],
    orphans_removed: ['rate==1'],
    // Per-entry cost of the large delete over the small one's: 1 is linear, the size ratio is quadratic.
    delete_per_entry_growth: ['max<2'],
  },
};

function seedCategory(session, count) {
  const categoryId = newCategory(session, 'Proof: orphan delete');
  insertEntries({
    session,
    categoryId,
    count,
    fields: (n) => ({ title: `${NOUNS[n % NOUNS.length]} ${n}` }),
  });
  return { session, categoryId };
}

/** Each pooled connection's first trigger call, made while the tables are empty: a plan cached then keeps estimating one row. */
function planOnEmptyTables(session) {
  const categories = insertReturning({
    session,
    table: 'categories',
    rows: Array.from({ length: WARM_DELETES }, (_, n) => ({
      name: `Proof: empty ${n}`,
    })),
    select: 'id',
  });
  const responses = http.batch(
    categories.map(({ id }) => ({
      method: 'DELETE',
      url: `${SUPABASE_URL}/rest/v1/categories?${query({ id: `eq.${id}` })}`,
      params: {
        headers: authHeaders(session),
        tags: { name: 'warm empty delete' },
      },
    })),
  );
  for (const response of responses) expectOk(response, 'warming');
}

export function setup() {
  const warm = newCollector('orphan-delete-warm');
  const small = newCollector('orphan-delete-small');
  const large = newCollector('orphan-delete-large');
  return seedOrClear([warm, small, large], () => {
    planOnEmptyTables(warm);
    return {
      small: seedCategory(small, SMALL_ENTRIES),
      large: seedCategory(large, ENTRIES),
    };
  });
}

/** data/categories.ts deleteCategory: one DELETE; the cascade and the orphan trigger do the rest. */
function deleteCategory({ session, categoryId }, probe) {
  const response = call({
    method: 'DELETE',
    path: `/rest/v1/categories?${query({ id: `eq.${categoryId}` })}`,
    session,
    probe,
  });
  deleteCompleted.add(response.status === 204, { probe });
  return response.timings.duration;
}

function entriesLeft(session) {
  const response = call({
    method: 'HEAD',
    path: `/rest/v1/items?${query({ select: 'id', user_id: `eq.${session.userId}` })}`,
    session,
    headers: { Prefer: 'count=exact' },
    probe: 'count_left',
  });
  return countedTotal(response);
}

export function probe({ small, large }) {
  const smallMs = deleteCategory(small, 'delete_small');
  const largeMs = deleteCategory(large, 'delete_large');
  orphansRemoved.add(entriesLeft(small.session) === 0);
  orphansRemoved.add(entriesLeft(large.session) === 0);
  perEntryGrowth.add(largeMs / ENTRIES / (smallMs / SMALL_ENTRIES));
  measured.add(1);
}

export function teardown({ small, large }) {
  clearAccount(small.session);
  clearAccount(large.session);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'orphan-delete',
    claim: `deleting a category of ${ENTRIES} entries finishes within ${DELETE_BUDGET_MS} ms, under the 8 s statement timeout, and its cost per entry does not grow with the category's size.`,
    notes: [
      `Run on a stack whose \`items\` and \`item_categories\` are empty and vacuumed (\`run-all.sh\` vacuums them first), as a new or emptied project is: ${WARM_DELETES} concurrent empty-category deletes first let every pooled connection plan the trigger there.`,
      `Two fresh collectors, one category each: ${SMALL_ENTRIES} and ${ENTRIES} entries, no photographs, each entry in that one category.`,
      'Each category goes in one DELETE as the signed-in owner, as data/categories.ts sends it; the small one first.',
      '`delete_per_entry_growth` = (large ms / large entries) / (small ms / small entries): about 1 when linear, the size ratio when quadratic.',
    ],
    metrics: ['delete_completed', 'orphans_removed', 'delete_per_entry_growth'],
    data,
  });
}
