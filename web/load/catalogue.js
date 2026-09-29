// Normal load on the owner's own 10,000-entry category: browsing pages, searching and, at one VU, exporting, side by side.
import { browse, exportArchive, search } from './lib/flows.js';
import {
  LIFECYCLE_TIMEOUTS,
  SUMMARY_TREND_STATS,
  correctnessThresholds,
  rampingScenario,
  thresholdsFor,
} from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    browse: rampingScenario('browseOwn', 10),
    search: rampingScenario('searchOwn', 5),
    // One collector exporting at a time: every page, sign call and photograph of the category, back to back.
    export: rampingScenario('exportOwn', 1),
  },
  // No p95 for export yet: it has no calibrated baseline (docs/how-to/load-testing.md).
  thresholds: {
    ...correctnessThresholds(['export']),
    ...thresholdsFor(['browse', 'search']),
  },
};

export function browseOwn(data) {
  browse(data.owner, data.searchedCategoryId);
}

export function searchOwn(data) {
  search({ session: data.owner, categoryId: data.searchedCategoryId });
}

export function exportOwn(data) {
  exportArchive(data.owner, data.searchedCategoryId);
}

export function handleSummary(data) {
  return summarize({ flow: 'catalogue', data });
}
