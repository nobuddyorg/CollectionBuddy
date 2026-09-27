// #779: a two-character non-ASCII term yields no trigram, so search_category_items rechecks every collector's items, not the category's.
import { check } from 'k6';
import { Trend } from 'k6/metrics';

import { searchPage } from '../lib/api.js';
import { LIFECYCLE_TIMEOUTS } from '../lib/options.js';
import { NOUNS, clearAccount } from '../lib/seed.js';
import {
  envInt,
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

// The searching owner's own category: small next to the table, so its own links would answer in a few ms.
const CATEGORY_ENTRIES = envInt('PROOF_CATEGORY_ENTRIES', 1000);
// Others' entries a no-trigram term scans (0: the control); PG 17 kept that scan for 1,000 own entries at 150,000, not for 300 at 70,000.
const OTHER_ENTRIES = envInt('PROOF_OTHER_ENTRIES', 150000);
// Owner quota is 50,000 entries, so larger tables need more collectors.
const OTHER_COLLECTORS = Math.max(1, Math.ceil(OTHER_ENTRIES / 45000));
const SAMPLES = envInt('PROOF_SAMPLES', 30);
// Passed the app's former two-character non-ASCII floor, yet holds no trigram.
const SHORT_TERM = 'Öl';
// data/itemSearch.ts SEARCH_MIN_LENGTH, 3 since #779 (was 2 for non-ASCII): the app no longer sends 'Öl'.
const SEARCH_MIN_LENGTH = 3;
// Matches exactly the same entries and carries trigrams: the cost a category-local answer should have.
const TRIGRAM_TERM = 'Öllampe';

const shortOverTrigram = new Trend('short_over_trigram');

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: {
    // Autovacuum (naptime 60 s) must ANALYZE the fresh rows first: the defect is a planner choice made from statistics.
    probe: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: SAMPLES,
      exec: 'probe',
      startTime: '2m',
    },
  },
  thresholds: {
    // Below the floor the app sends no short request, so there is no short_term probe to report.
    ...probeThresholds(
      SHORT_TERM.length < SEARCH_MIN_LENGTH
        ? ['trigram_term']
        : ['short_term', 'trigram_term'],
    ),
    // Same rows, same category: the no-trigram term should not cost several times more.
    short_over_trigram: ['med<3'],
  },
};

export function setup() {
  const owner = newCollector('short-search');
  const others = [];
  // Every collector created so far is cleared if a later insert fails.
  return seedOrClear([owner], () => {
    try {
      const categoryId = newCategory(owner, 'Proof: short search');
      insertEntries({
        session: owner,
        categoryId,
        count: CATEGORY_ENTRIES,
        fields: (n) => ({
          // One entry in five is an oil lamp, the only source of "öl" in the owner's category.
          title:
            n % 5 === 0 ? `Öllampe ${n}` : `${NOUNS[n % NOUNS.length]} ${n}`,
          description: `Probe ${n}`,
          place: 'Trier',
          tags: ['antik'],
        }),
      });
      let remaining = OTHER_ENTRIES;
      for (let index = 0; index < OTHER_COLLECTORS && remaining > 0; index++) {
        const collector = newCollector(`short-search-other-${index}`);
        others.push(collector);
        const count = Math.min(remaining, 45000);
        insertEntries({
          session: collector,
          categoryId: newCategory(collector, 'Proof: someone else'),
          count,
          fields: (n) => ({
            title: `${NOUNS[n % NOUNS.length]} ${n}`,
            description: `Fremde Probe ${n}`,
            place: 'Wien',
            tags: ['silber'],
          }),
        });
        remaining -= count;
      }
      return { owner, categoryId, others };
    } catch (error) {
      for (const collector of others) clearAccount(collector);
      throw error;
    }
  });
}

// A failed request ends the iteration before its verdict, so the report says INCONCLUSIVE rather than counting 0 matches.
function totalOf(response) {
  if (response.status !== 200)
    throw new Error(`search RPC: HTTP ${response.status} ${response.body}`);
  const rows = response.json();
  return rows.length ? rows[0].total_count : 0;
}

export function probe({ owner, categoryId }) {
  const trigram = searchPage({
    session: owner,
    categoryId,
    term: TRIGRAM_TERM,
    page: 1,
  });
  probeMs.add(trigram.timings.duration, { probe: 'trigram_term' });
  const expected = Math.ceil(CATEGORY_ENTRIES / 5);

  if (SHORT_TERM.length < SEARCH_MIN_LENGTH) {
    // The app sends no request for a term under its floor, so the short term costs nothing.
    check(trigram, {
      'the trigram term finds the oil lamps': (response) =>
        totalOf(response) === expected,
    });
    shortOverTrigram.add(0);
    measured.add(1);
    return;
  }

  const short = searchPage({
    session: owner,
    categoryId,
    term: SHORT_TERM,
    page: 1,
  });
  probeMs.add(short.timings.duration, { probe: 'short_term' });
  const shortTotal = totalOf(short);
  const trigramTotal = totalOf(trigram);
  check(null, {
    'both terms find the same entries': () =>
      shortTotal === trigramTotal && shortTotal === expected,
  });
  shortOverTrigram.add(short.timings.duration / trigram.timings.duration);
  measured.add(1);
}

export function teardown({ owner, others }) {
  clearAccount(owner);
  for (const collector of others) clearAccount(collector);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'short-search',
    issue: 779,
    claim:
      "a two-character non-ASCII term ('Öl') costs a recheck of every collector's items, where a trigram-bearing term matching the same entries answers from the category.",
    notes: [
      `The searching owner has ${CATEGORY_ENTRIES} entries; ${OTHER_ENTRIES} entries belong to ${OTHER_COLLECTORS} other collector(s) the owner cannot read.`,
      SHORT_TERM.length < SEARCH_MIN_LENGTH
        ? `The app sends no request for '${SHORT_TERM}', under its ${SEARCH_MIN_LENGTH}-character floor; '${TRIGRAM_TERM}' finds ${Math.ceil(CATEGORY_ENTRIES / 5)} entries (checked).`
        : `'${SHORT_TERM}' and '${TRIGRAM_TERM}' return the same ${Math.ceil(CATEGORY_ENTRIES / 5)} entries (checked).`,
      "Run once with PROOF_OTHER_ENTRIES=0 as the control: the ratio should then stay well below the proof run's, showing the cost is other people's rows.",
    ],
    metrics: ['short_over_trigram'],
    // The control expects no gap; it has no verdict of its own.
    purpose: OTHER_ENTRIES === 0 ? 'record' : 'proof',
    data,
  });
}
