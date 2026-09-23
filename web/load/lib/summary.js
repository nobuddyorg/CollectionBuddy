// The end-of-test report: per scenario, the rate, error rate and p50/p95/p99 the issue asks for (#662).
import { SEARCHED_ITEMS, SHARED_ITEMS } from './seed.js';
import { SUPABASE_URL, TARGET } from './target.js';

const ms = (value) => `${value.toFixed(1)} ms`;
const percent = (value) => `${(value * 100).toFixed(2)}%`;

function scenarioRow(metrics, scenario) {
  const requests = metrics[`http_reqs{scenario:${scenario}}`].values;
  const failed = metrics[`http_req_failed{scenario:${scenario}}`].values;
  const duration = metrics[`http_req_duration{scenario:${scenario}}`].values;
  return `| ${scenario} | ${requests.count} | ${requests.rate.toFixed(2)} | ${failed.passes} (${percent(failed.rate)}) | ${ms(duration.med)} | ${ms(duration['p(95)'])} | ${ms(duration['p(99)'])} |`;
}

function thresholdRows(metrics) {
  return Object.keys(metrics)
    .sort()
    .flatMap((name) =>
      Object.entries(metrics[name].thresholds ?? {}).map(
        ([rule, { ok }]) =>
          `| \`${name}\` | \`${rule}\` | ${ok ? '✅' : '❌'} |`,
      ),
    );
}

/** The report as Markdown, for stdout and the Actions job summary alike. */
function summaryMarkdown(flow, data) {
  const { metrics } = data;
  const scenarios = Object.keys(metrics)
    .map((name) => /^http_reqs\{scenario:(.+)\}$/.exec(name))
    .filter(Boolean)
    .map((match) => match[1])
    .sort();
  const all = metrics.http_req_duration.values;
  return [
    `## k6 load test: \`${flow}\` against ${TARGET}`,
    '',
    `Target \`${SUPABASE_URL}\`. Seeded ${SEARCHED_ITEMS} entries in the searched category and ${SHARED_ITEMS} in the shared one. Rates are over the whole run, setup included.`,
    '',
    '| Scenario | Requests | Req/s | Failed | p50 | p95 | p99 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...scenarios.map((scenario) => scenarioRow(metrics, scenario)),
    '',
    `All requests, setup and teardown included: ${metrics.http_reqs.values.count}, ${metrics.http_req_failed.values.passes} failed, ${metrics.http_req_timeouts.values.count} timed out; p50 ${ms(all.med)}, p95 ${ms(all['p(95)'])}, p99 ${ms(all['p(99)'])}.`,
    '',
    'Thresholds are initial proposals, not validated limits.',
    '',
    '| Metric | Threshold | Result |',
    '| --- | --- | --- |',
    ...thresholdRows(metrics),
    '',
  ].join('\n');
}

export function summarize(flow, data) {
  const markdown = summaryMarkdown(flow, data);
  return {
    stdout: markdown,
    [`load-results/${flow}.md`]: markdown,
    [`load-results/${flow}.json`]: JSON.stringify(data, null, 2),
  };
}
