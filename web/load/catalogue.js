// Normal load on the owner's own 10,000-entry category: browsing pages and searching, side by side.
import { browse, search } from './lib/flows.js';
import {
  LIFECYCLE_TIMEOUTS,
  SUMMARY_TREND_STATS,
  rampTo,
  thresholdsFor,
} from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    browse: { executor: 'ramping-vus', exec: 'browseOwn', stages: rampTo(10) },
    search: { executor: 'ramping-vus', exec: 'searchOwn', stages: rampTo(5) },
  },
  thresholds: thresholdsFor(['browse', 'search']),
};

export function browseOwn(data) {
  browse(data.owner, data.searchedCategoryId);
}

export function searchOwn(data) {
  search(data.owner, data.searchedCategoryId);
}

export function handleSummary(data) {
  return summarize('catalogue', data);
}
