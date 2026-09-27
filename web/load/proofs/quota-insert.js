// An import on a new project: the insert triggers must cost the same per batch of 100 however many entries the tables already hold.
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

import { query } from '../lib/api.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { NOUNS, clearAccount } from '../lib/seed.js';
import { ANON_KEY, SUPABASE_URL } from '../lib/target.js';
import {
  call,
  envInt,
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

// Under the 50,000-entry owner quota, and large enough that a scan per linked entry shows.
const ENTRIES = envInt('PROOF_IMPORT_ENTRIES', 20000);
// data/importCategory.ts ITEM_INSERT_BATCH_SIZE.
const BATCH_SIZE = 100;
// A tenth of the batches at each end: `batch_first` on empty tables, `batch_last` beside every entry imported before it.
const SAMPLED_BATCHES = Math.max(1, Math.floor(ENTRIES / BATCH_SIZE / 10));
const LAST_BATCH_BUDGET_MS = envInt('PROOF_LAST_BATCH_BUDGET_MS', 100);
// Entries created by hand before the import, over PostgREST's default pool of 10, so every pooled connection runs the insert triggers on small tables.
const WARM_CALLS = envInt('PROOF_WARM_CALLS', 20);
const WARM_ROUNDS = envInt('PROOF_WARM_ROUNDS', 6);

const batchesCompleted = new Rate('batches_completed');
const entriesImported = new Rate('entries_imported');
const batchGrowth = new Trend('import_batch_growth');

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  batchPerHost: WARM_CALLS,
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
    ...probeThresholds(['batch_first', 'batch', 'batch_last'], {
      limits: { batch_last: [`p(95)<${LAST_BATCH_BUDGET_MS}`] },
    }),
    batches_completed: ['rate==1'],
    entries_imported: ['rate==1'],
    // Last tenth's median over the first tenth's: about 1 when a batch costs the same, growing with the table when it scans per entry.
    import_batch_growth: ['max<1.5'],
  },
};

/** data/items.ts createItemsInCategory, as the entry form sends it: one entry, its id and timestamp left to the database. */
function createByHand(session, categoryId, n) {
  return {
    method: 'POST',
    url: `${SUPABASE_URL}/rest/v1/rpc/create_items_in_category`,
    body: JSON.stringify({
      target_category_id: categoryId,
      entries: [{ title: `Proof: by hand ${n}` }],
    }),
    params: {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'warm create by hand' },
    },
  };
}

/** A new project's first entries, side by side: each pooled connection plans the insert triggers while the tables are nearly empty. */
function createFirstEntries(session) {
  const categoryId = newCategory(session, 'Proof: first entries');
  for (let round = 0; round < WARM_ROUNDS; round++) {
    const responses = http.batch(
      Array.from({ length: WARM_CALLS }, (_, n) =>
        createByHand(session, categoryId, round * WARM_CALLS + n),
      ),
    );
    const failed = responses.filter((response) => response.status !== 204);
    if (failed.length) {
      throw new Error(`warming: HTTP ${failed[0].status} ${failed[0].body}`);
    }
  }
}

export function setup() {
  const warm = newCollector('quota-insert-warm');
  const importer = newCollector('quota-insert-import');
  return seedOrClear([warm, importer], () => {
    createFirstEntries(warm);
    return {
      warm,
      importer,
      categoryId: newCategory(importer, 'Proof: imported'),
    };
  });
}

function probeName(batch, batches) {
  if (batch < SAMPLED_BATCHES) return 'batch_first';
  if (batch >= batches - SAMPLED_BATCHES) return 'batch_last';
  return 'batch';
}

/** data/importCategory.ts: one batch at a time, each entry with the id and timestamp the archive gives it. */
function importBatch({ session, categoryId, start, probe }) {
  const now = Date.now();
  const entries = Array.from(
    { length: Math.min(BATCH_SIZE, ENTRIES - start) },
    (_, offset) => {
      const n = start + offset;
      return {
        id: crypto.randomUUID(),
        created_at: new Date(now - n * 60000).toISOString(),
        title: `${NOUNS[n % NOUNS.length]} ${n}`,
      };
    },
  );
  const response = call({
    method: 'POST',
    path: '/rest/v1/rpc/create_items_in_category',
    session,
    body: JSON.stringify({ target_category_id: categoryId, entries }),
    headers: { 'Content-Type': 'application/json' },
    probe,
  });
  batchesCompleted.add(response.status === 204, { probe });
  return response.timings.duration;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function entriesIn(session, categoryId) {
  const response = call({
    method: 'HEAD',
    path: `/rest/v1/item_categories?${query({ select: 'item_id', category_id: `eq.${categoryId}` })}`,
    session,
    headers: { Prefer: 'count=exact' },
    probe: 'count_imported',
  });
  const range = response.headers['Content-Range'] ?? '';
  return Number.parseInt(range.split('/')[1], 10);
}

export function probe({ importer, categoryId }) {
  const batches = Math.ceil(ENTRIES / BATCH_SIZE);
  const durations = { batch_first: [], batch: [], batch_last: [] };
  for (let batch = 0; batch < batches; batch++) {
    const probe = probeName(batch, batches);
    durations[probe].push(
      importBatch({
        session: importer,
        categoryId,
        start: batch * BATCH_SIZE,
        probe,
      }),
    );
  }
  entriesImported.add(entriesIn(importer, categoryId) === ENTRIES);
  batchGrowth.add(median(durations.batch_last) / median(durations.batch_first));
  measured.add(1);
}

export function teardown({ warm, importer }) {
  clearAccount(warm);
  clearAccount(importer);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'quota-insert',
    claim: `importing ${ENTRIES} entries into a new project in batches of ${BATCH_SIZE}, the last tenth of the batches takes under ${LAST_BATCH_BUDGET_MS} ms each (p95) and costs no more than 1.5x the first tenth.`,
    notes: [
      `Run on a stack whose \`items\` and \`item_categories\` are empty and vacuumed, with a PostgREST pool that has not inserted an entry yet and autovacuum held off both tables for the run, so the plans the pool caches stay as they are until autovacuum's next pass (\`run-all.sh\` prepares all three).`,
      `A first collector creates ${WARM_ROUNDS * WARM_CALLS} entries by hand, ${WARM_CALLS} at a time, so every pooled connection runs the insert triggers while the tables are nearly empty.`,
      `A second collector then imports ${ENTRIES} entries into one category, one \`create_items_in_category\` call per ${BATCH_SIZE}, one after another, as data/importCategory.ts sends them.`,
      '`import_batch_growth` = median of `batch_last` / median of `batch_first`: about 1 when a batch costs the same, growing with the table when the triggers scan it once per entry.',
    ],
    metrics: ['batches_completed', 'entries_imported', 'import_batch_growth'],
    data,
  });
}
