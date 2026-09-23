// Collectors cataloguing new entries with a photograph each, into a category already holding 10,300 rows' worth of indexes.
import { write } from './lib/flows.js';
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
    write: {
      executor: 'ramping-vus',
      exec: 'writeEntry',
      stages: rampTo(5),
    },
  },
  thresholds: thresholdsFor({ write: 1500 }),
};

export function writeEntry(data) {
  write(data.owner, data.writtenCategoryId);
}

export function handleSummary(data) {
  return summarize('write', data);
}
