// A proof's end-of-test report: per probe the sample count and p50/p95/max, then every threshold with its verdict.
import { Counter } from 'k6/metrics';

import { SUMMARY_TREND_STATS } from '../../lib/options.js';
import { PROFILE_NAME } from '../../lib/profile.js';
import { SUPABASE_URL, TARGET } from '../../lib/target.js';

// With `count`, the report can show what each percentile rests on, and spot a verdict metric that never got a sample.
export const PROOF_TREND_STATS = [...SUMMARY_TREND_STATS, 'count'];

/** Every proof adds 1 as the last statement of each iteration; fewer than the iterations run means one threw before its verdict. */
export const measured = new Counter('proof_measured');

const milliseconds = (value) =>
  value === undefined ? '-' : `${value.toFixed(1)} ms`;

/** Guards scoped to the measured scenarios (seed traffic cannot dilute a failing probe), plus a sub-metric per probe for the report. */
export function probeThresholds(
  probes,
  { limits = {}, scenarios = ['probe'], failuresExpected = false } = {},
) {
  const thresholds = { proof_measured: ['count>0'] };
  for (const scenario of scenarios) {
    thresholds[`http_req_failed{scenario:${scenario}}`] = failuresExpected
      ? []
      : ['rate<0.01'];
    thresholds[`checks{scenario:${scenario}}`] = ['rate>0.99'];
  }
  for (const probe of probes) {
    thresholds[`probe_ms{probe:${probe}}`] = limits[probe] ?? [];
  }
  return thresholds;
}

function probeRows(metrics) {
  return Object.keys(metrics)
    .map((name) => [name, /^probe_ms\{probe:(.+)\}$/.exec(name)])
    .filter(([, match]) => match)
    .map(([name, match]) => {
      const values = metrics[name].values;
      return `| ${match[1]} | ${values.count ?? '-'} | ${milliseconds(values.med)} | ${milliseconds(values['p(95)'])} | ${milliseconds(values.max)} |`;
    });
}

function thresholdRows(metrics) {
  return Object.keys(metrics)
    .sort()
    .flatMap((name) =>
      Object.entries(metrics[name].thresholds ?? {}).map(
        ([rule, { ok }]) =>
          `| \`${name}\` | \`${rule}\` | ${ok ? '✅ pass' : '❌ fail'} |`,
      ),
    );
}

function metricRows(metrics, names) {
  return names
    .filter((name) => metrics[name])
    .map((name) => {
      const values = metrics[name].values;
      const shown = Object.entries(values)
        .map(
          ([stat, value]) =>
            `${stat}=${Number.isInteger(value) ? value : value.toFixed(2)}`,
        )
        .join(', ');
      return `| \`${name}\` | ${shown} |`;
    });
}

// Guards every proof shares: scoped or unscoped checks, scoped request failures, and the iteration counter.
const SHARED_GUARD =
  /^(checks|http_req_failed|proof_measured)(\{scenario:[^}]+\})?$/;

/** Why the numbers cannot be read as a verdict: an iteration stopped early, a guard failed, or a verdict metric has no sample. */
function inconclusiveReasons(data, verdictMetrics, guards = []) {
  const reasons = [];
  const finished = data.metrics.proof_measured?.values.count ?? 0;
  const iterations = data.metrics.iterations?.values.count ?? 0;
  if (finished === 0)
    reasons.push(
      'no iteration reached its verdict (setup or every iteration failed)',
    );
  else if (finished < iterations)
    reasons.push(
      `${iterations - finished} of ${iterations} iterations stopped before their verdict`,
    );
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (!SHARED_GUARD.test(name) && !guards.includes(name)) continue;
    for (const [rule, { ok }] of Object.entries(metric.thresholds ?? {})) {
      if (!ok) reasons.push(`guard \`${name}\` failed \`${rule}\``);
    }
  }
  // A Counter's `count` is its sum, so only Trends (with `count` in the stats) and Rates can show a missing sample; a probe counts only if a limit rests on it.
  const empty = Object.keys(data.metrics)
    .filter(
      (name) =>
        verdictMetrics.includes(name) ||
        (/^probe_ms\{probe:/.test(name) &&
          Object.keys(data.metrics[name].thresholds ?? {}).length > 0),
    )
    .filter((name) => {
      const { type, values } = data.metrics[name];
      if (type === 'trend') return values.count === 0;
      if (type === 'rate')
        return (values.passes ?? 0) + (values.fails ?? 0) === 0;
      return false;
    });
  const absent = verdictMetrics.filter((name) => !data.metrics[name]);
  if (empty.length || absent.length) {
    reasons.push(
      `no samples for ${[...empty, ...absent].map((name) => `\`${name}\``).join(', ')}`,
    );
  }
  return reasons;
}

/** `claim` is the issue's sentence under test; `notes` are the seed and environment facts a reader needs to weigh the numbers. */
/** `purpose: 'record'` marks a run with no verdict (an impact measurement or a control), so the report does not promise one. */
export function proofSummary({
  proof,
  issue,
  claim,
  notes = [],
  metrics: extra = [],
  guards = [],
  purpose = 'proof',
  data,
}) {
  const { metrics } = data;
  // A second run of the same proof (a control, a candidate fix) keeps its own report.
  const name = __ENV.PROOF_VARIANT ? `${proof}-${__ENV.PROOF_VARIANT}` : proof;
  const inconclusive = inconclusiveReasons(data, extra, guards);
  const markdown = [
    `## k6 proof \`${name}\` for #${issue}`,
    '',
    ...(inconclusive.length
      ? [
          `**INCONCLUSIVE:** ${inconclusive.join('; ')}. Empty metrics pass their thresholds, so the verdicts below mean nothing.`,
          '',
        ]
      : []),
    `Claim under test: ${claim}`,
    '',
    `Target ${TARGET} \`${SUPABASE_URL}\`, profile \`${PROFILE_NAME}\`.`,
    ...notes.map((note) => `- ${note}`),
    '',
    '| Probe | Samples | p50 | p95 | max |',
    '| --- | --- | --- | --- | --- |',
    ...probeRows(metrics),
    '',
    ...(extra.length
      ? [
          '| Metric | Values |',
          '| --- | --- |',
          ...metricRows(metrics, extra),
          '',
        ]
      : []),
    ...(inconclusive.length || purpose !== 'proof'
      ? []
      : [
          'A failing threshold is the defect showing; the proof passes once the fix lands.',
          '',
        ]),
    '| Metric | Threshold | Result |',
    '| --- | --- | --- |',
    ...thresholdRows(metrics),
    '',
  ].join('\n');
  return {
    stdout: markdown,
    [`load-results/proof-${name}.md`]: markdown,
    [`load-results/proof-${name}.json`]: JSON.stringify(data, null, 2),
  };
}
