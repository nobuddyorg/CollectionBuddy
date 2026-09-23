// Options every script shares: trend stats the report reads, lifecycle timeouts, load shape and thresholds.
export const SUMMARY_TREND_STATS = ['avg', 'med', 'p(95)', 'p(99)', 'max'];

// Setup writes 10,000 rows through PostgREST; k6's 60s default is not enough on a cold stack.
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

/** Ramp up to `vus`, hold for two minutes, ramp down. */
export function rampTo(vus) {
  return [
    { duration: '30s', target: vus },
    { duration: '2m', target: vus },
    { duration: '15s', target: 0 },
  ];
}
