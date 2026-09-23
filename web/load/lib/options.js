// Options every script shares: trend stats the report reads, lifecycle timeouts, load shape and thresholds.
import { PROFILE } from './profile.js';

export const SUMMARY_TREND_STATS = ['avg', 'med', 'p(95)', 'p(99)', 'max'];

// Setup writes up to 42,000 rows through PostgREST; k6's 60s default is not enough on a cold stack.
export const LIFECYCLE_TIMEOUTS = { setupTimeout: '5m', teardownTimeout: '5m' };

// Initial proposals, not validated limits: calibrate from a baseline first (docs/how-to/load-testing.md). Per-scenario sub-metrics feed the report.
export function thresholdsFor(p95MsByScenario) {
  const thresholds = {
    http_req_failed: ['rate<0.01'],
    http_req_timeouts: ['count<1'],
    checks: ['rate>0.99'],
  };
  for (const [scenario, p95Ms] of Object.entries(p95MsByScenario)) {
    thresholds[`http_req_duration{scenario:${scenario}}`] = [`p(95)<${p95Ms}`];
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
