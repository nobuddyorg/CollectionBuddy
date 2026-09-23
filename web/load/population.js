// Many collectors at once, each virtual user one of them: a table shared by everyone, which one large collection cannot show.
import { browse, search, write } from './lib/flows.js';
import {
  LIFECYCLE_TIMEOUTS,
  SUMMARY_TREND_STATS,
  rampTo,
  thresholdsFor,
} from './lib/options.js';
import { COLLECTORS, ENTRIES_EACH, NOUNS_SEARCHED } from './lib/population.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/population.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    own_browse: {
      executor: 'ramping-vus',
      exec: 'browseOwn',
      stages: rampTo(10),
    },
    own_search: {
      executor: 'ramping-vus',
      exec: 'searchOwn',
      stages: rampTo(5),
    },
    lent_browse: {
      executor: 'ramping-vus',
      exec: 'browseLent',
      stages: rampTo(5),
    },
    write: { executor: 'ramping-vus', exec: 'writeOwn', stages: rampTo(3) },
  },
  thresholds: thresholdsFor({
    own_browse: 500,
    own_search: 800,
    lent_browse: 500,
    write: 1500,
  }),
};

// k6 numbers VUs from 1 across every scenario, so neighbouring VUs are different collectors.
const me = (data) => data.members[(__VU - 1) % data.members.length];
const lender = (data) =>
  data.members[(__VU - 2 + data.members.length) % data.members.length];

export function browseOwn(data) {
  browse(me(data).session, me(data).ownCategoryId);
}

// Mostly another collector's word: common across the table, absent from this collection.
export function searchOwn(data) {
  search(me(data).session, me(data).ownCategoryId, NOUNS_SEARCHED);
}

export function browseLent(data) {
  browse(me(data).session, lender(data).lentCategoryId);
}

export function writeOwn(data) {
  write(me(data).session, me(data).ownCategoryId);
}

export function handleSummary(data) {
  return summarize(
    'population',
    data,
    `${COLLECTORS} collectors, each with ${ENTRIES_EACH} entries of their own and a fifth as many lent to the next`,
  );
}
