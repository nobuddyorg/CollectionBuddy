// A second identity reading a category it holds a viewer grant on: the has_category_read_access() path (#619).
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
    shared_browse: {
      executor: 'ramping-vus',
      exec: 'browseShared',
      stages: rampTo(10),
    },
    shared_search: {
      executor: 'ramping-vus',
      exec: 'searchShared',
      stages: rampTo(5),
    },
  },
  thresholds: thresholdsFor(['shared_browse', 'shared_search']),
};

export function browseShared(data) {
  browse(data.viewer, data.sharedCategoryId);
}

export function searchShared(data) {
  search(data.viewer, data.sharedCategoryId);
}

export function handleSummary(data) {
  return summarize('shared-viewer', data);
}
