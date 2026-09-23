// One iteration of every journey, to prove the scripts and the target work before a heavier run.
import { browse, search, write } from './lib/flows.js';
import {
  LIFECYCLE_TIMEOUTS,
  SUMMARY_TREND_STATS,
  correctnessThresholds,
} from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

const ONCE = { executor: 'per-vu-iterations', vus: 1, iterations: 1 };

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    browse: { ...ONCE, exec: 'browseOwn' },
    search: { ...ONCE, exec: 'searchOwn' },
    shared_browse: { ...ONCE, exec: 'browseShared' },
    shared_search: { ...ONCE, exec: 'searchShared' },
    write: { ...ONCE, exec: 'writeEntry' },
  },
  thresholds: correctnessThresholds([
    'browse',
    'search',
    'shared_browse',
    'shared_search',
    'write',
  ]),
};

export function browseOwn(data) {
  browse(data.owner, data.searchedCategoryId);
}

export function searchOwn(data) {
  search(data.owner, data.searchedCategoryId);
}

export function browseShared(data) {
  browse(data.viewer, data.sharedCategoryId);
}

export function searchShared(data) {
  search(data.viewer, data.sharedCategoryId);
}

export function writeEntry(data) {
  write(data.writer, data.writtenCategoryId);
}

export function handleSummary(data) {
  return summarize('smoke', data);
}
