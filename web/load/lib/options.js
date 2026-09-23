// Options every script shares: trend stats the report reads, lifecycle timeouts, load shape and thresholds.
import { PROFILE } from './profile.js';

export const SUMMARY_TREND_STATS = ['avg', 'med', 'p(95)', 'p(99)', 'max'];

// Setup writes up to 42,000 rows through PostgREST; k6's 60s default is not enough on a cold stack.
export const LIFECYCLE_TIMEOUTS = { setupTimeout: '5m', teardownTimeout: '5m' };

// p95 per scenario: 3x the worst of two normal-profile runs on a GitHub runner, at least 100 ms, rounded up to 50 (docs/how-to/load-testing.md).
const P95_MS = {
  browse: 150,
  search: 200,
  shared_browse: 100,
  shared_search: 150,
  write: 100,
  own_browse: 100,
  lent_browse: 100,
  own_search: 100,
};

/** Thresholds for the named scenarios; per-scenario sub-metrics also feed the report. */
export function thresholdsFor(scenarios) {
  const thresholds = {
    http_req_failed: ['rate<0.01'],
    http_req_timeouts: ['count<1'],
    checks: ['rate>0.99'],
  };
  for (const scenario of scenarios) {
    thresholds[`http_req_duration{scenario:${scenario}}`] = [
      `p(95)<${P95_MS[scenario]}`,
    ];
    thresholds[`http_req_failed{scenario:${scenario}}`] = ['rate<0.01'];
    thresholds[`http_reqs{scenario:${scenario}}`] = ['count>0'];
  }
  return thresholds;
}

/** The profile's stages for a scenario whose normal load is `vus`. */
export function rampTo(vus) {
  return PROFILE.stages.map(([duration, fraction]) => ({
    duration,
    target: Math.ceil(vus * PROFILE.vusScale * fraction),
  }));
}
