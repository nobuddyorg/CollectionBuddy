// A second identity reading a category it holds a viewer grant on: the has_category_read_access() path.
import { browse, search } from './lib/flows.js';
import {
  LIFECYCLE_TIMEOUTS,
  SUMMARY_TREND_STATS,
  rampingScenario,
  thresholdsFor,
} from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    shared_browse: rampingScenario('browseShared', 10),
    shared_search: rampingScenario('searchShared', 5),
  },
  thresholds: thresholdsFor(['shared_browse', 'shared_search']),
};

export function browseShared(data) {
  browse(data.viewer, data.sharedCategoryId);
}

export function searchShared(data) {
  search({ session: data.viewer, categoryId: data.sharedCategoryId });
}

export function handleSummary(data) {
  return summarize({ flow: 'shared-viewer', data });
}
