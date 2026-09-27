// #781: the k6 gate's browse flow never reaches the paths that grow with data (deep pages, signed photo URLs), so it stays green while they are slow.
import { sleep } from 'k6';

import { countItems, listPage } from '../lib/api.js';
import { browse } from '../lib/flows.js';
import {
  LIFECYCLE_TIMEOUTS,
  SUMMARY_TREND_STATS,
  correctnessThresholds,
} from '../lib/options.js';
import { clearAccount } from '../lib/seed.js';
import { summarize } from '../lib/summary.js';
import { BUCKET, call } from './lib/fixtures.js';
import {
  ENTRIES,
  LAST_PAGE,
  PHOTO_EVERY,
  seedDeepCatalogue,
} from './lib/deepCatalogue.js';
import { inconclusiveReasons, measured } from './lib/report.js';

// catalogue.js's browse load and think time; each scenario runs alone, so none measures another's queueing.
const VUS = 10;
const DURATION = '2m';
const THINK_SECONDS = 1;
// 30 s gaps cover constant-vus's default gracefulStop.
const steady = (exec, startTime) => ({
  executor: 'constant-vus',
  vus: VUS,
  duration: DURATION,
  exec,
  startTime,
});

// The request names #781's fix gives the stock browse flow's new calls (lib/api.js `name` tags); pinned on the issue.
const LAST_PAGE_NAME = 'catalogue last page';
const SIGN_NAME = 'sign urls';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    browse: steady('stockBrowse', '0s'),
    photo_browse: steady('photoBrowse', '2m30s'),
    deep_browse: steady('deepBrowse', '5m'),
  },
  thresholds: {
    // No latency verdict here: slow deep pages are #758's to prove, slow signing #757's. These rows are the evidence.
    ...correctnessThresholds(['browse', 'deep_browse', 'photo_browse']),
    // The verdict is coverage: the gate's own flow must send the requests that grow with data. An unsent name counts 0.
    // `name:` first: lib/summary.js reads any sub-metric starting with `scenario:` as a scenario row.
    [`http_reqs{name:${LAST_PAGE_NAME},scenario:browse}`]: ['count>0'],
    [`http_reqs{name:${SIGN_NAME},scenario:browse}`]: ['count>0'],
    proof_measured: ['count>0'],
  },
};

export function setup() {
  return seedDeepCatalogue('gate-blind-spots');
}

/** Exactly what the `catalogue` flow's browse scenario sends, whatever lib/flows.js makes it. */
export function stockBrowse({ owner, categoryId }) {
  browse(owner, categoryId);
  measured.add(1);
}

/** What the Pagination's last-page button sends in a large category, then a step back. */
export function deepBrowse({ owner, categoryId }) {
  listPage({ session: owner, categoryId, page: LAST_PAGE });
  countItems(owner, categoryId);
  sleep(THINK_SECONDS);
  listPage({ session: owner, categoryId, page: LAST_PAGE - 1 });
  sleep(THINK_SECONDS);
  measured.add(1);
}

/** A page as the app renders it: the list with its photographs, then one sign call for the cards' paths. */
export function photoBrowse({ owner, categoryId }) {
  const page = 1 + Math.floor(Math.random() * 20);
  const { items } = listPage({ session: owner, categoryId, page });
  countItems(owner, categoryId);
  const paths = items.flatMap((item) =>
    item.images.flatMap((image) =>
      image.path_thumb
        ? [image.path_full, image.path_thumb]
        : [image.path_full],
    ),
  );
  if (paths.length) {
    call({
      method: 'POST',
      path: `/storage/v1/object/sign/${BUCKET}`,
      session: owner,
      body: JSON.stringify({ expiresIn: 3600, paths }),
      headers: { 'Content-Type': 'application/json' },
      probe: 'photo_sign',
    });
  }
  sleep(THINK_SECONDS);
  measured.add(1);
}

export function teardown({ owner }) {
  clearAccount(owner);
}

// The harness's own per-scenario report, so the three rows read like a `catalogue` run's; a failed guard marks it INCONCLUSIVE.
export function handleSummary(data) {
  const report = summarize({
    flow: 'proof-gate-blind-spots',
    data,
    seeded: `${ENTRIES} entries in one category, every ${PHOTO_EVERY || 'no'}th with a photograph (#781: \`browse\` is the gate's own flow, \`deep_browse\` and \`photo_browse\` the paths it skips; the verdict is whether \`browse\` sends \`${LAST_PAGE_NAME}\` and \`${SIGN_NAME}\` requests)`,
  });
  const reasons = inconclusiveReasons(
    data,
    [],
    [
      'http_req_timeouts',
      'http_reqs{scenario:browse}',
      'http_reqs{scenario:deep_browse}',
      'http_reqs{scenario:photo_browse}',
    ],
  );
  if (!reasons.length) return report;
  const markdown = `**INCONCLUSIVE:** ${reasons.join('; ')}. Empty metrics pass their thresholds, so the verdicts below mean nothing.\n\n${report.stdout}`;
  return {
    ...report,
    stdout: markdown,
    'load-results/proof-gate-blind-spots.md': markdown,
  };
}
