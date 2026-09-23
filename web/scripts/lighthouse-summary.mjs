// lhci's manifest.json per target, as a markdown table reading the metrics lighthouserc.*.json asserts on.
import { readFile, appendFile } from 'node:fs/promises';

// Must match the `assert` blocks in lighthouserc.signed-out.json / .signed-in.json.
const TARGETS = [
  {
    label: 'Signed out (`/login/`)',
    manifest: 'lighthouse-reports/signed-out/manifest.json',
    minPerformance: 0.8,
    maxCls: 0.1,
  },
  {
    label: 'Signed in (`/`, demo mode)',
    manifest: 'lighthouse-reports/signed-in/manifest.json',
    minPerformance: 0.65,
    // Loose on purpose: a new demo account's first render shifts from skeleton to empty state.
    maxCls: 0.4,
  },
];

const MIN_ACCESSIBILITY = 1;

// ➖ when the report produced no metric to compare.
function atLeast(value, threshold) {
  if (!Number.isFinite(value)) return '➖';
  return value >= threshold ? '✅' : '❌';
}

function atMost(value, threshold) {
  if (!Number.isFinite(value)) return '➖';
  return value <= threshold ? '✅' : '❌';
}

function percentage(score) {
  return Number.isFinite(score) ? `${Math.round(score * 100)}` : 'n/a';
}

async function summarizeTarget({ label, manifest, minPerformance, maxCls }) {
  let entries;
  try {
    entries = JSON.parse(await readFile(manifest, 'utf8'));
  } catch {
    return `| ${label} | _no report found_ | | | | | | |`;
  }
  // lhci marks one representative run per URL once numberOfRuns > 1; a single-run override has none.
  const run =
    entries.find((entry) => entry.isRepresentativeRun) ?? entries.at(-1);
  if (!run) return `| ${label} | _no run recorded_ | | | | | | |`;

  const report = JSON.parse(await readFile(run.jsonPath, 'utf8'));
  const performance = run.summary.performance;
  const accessibility = run.summary.accessibility;
  const cls = report.audits['cumulative-layout-shift']?.numericValue;
  const lcpMilliseconds =
    report.audits['largest-contentful-paint']?.numericValue;
  const lcp = Number.isFinite(lcpMilliseconds)
    ? `${(lcpMilliseconds / 1000).toFixed(1)}s`
    : 'n/a';

  return (
    [
      label,
      atLeast(performance, minPerformance),
      percentage(performance),
      `${atLeast(accessibility, MIN_ACCESSIBILITY)} ${percentage(accessibility)}`,
      percentage(run.summary['best-practices']),
      percentage(run.summary.seo),
      lcp,
      `${atMost(cls, maxCls)} ${Number.isFinite(cls) ? cls.toFixed(3) : 'n/a'}`,
    ]
      .map((cell) => `| ${cell} `)
      .join('') + '|'
  );
}

async function buildSummary() {
  const rows = await Promise.all(TARGETS.map(summarizeTarget));
  return [
    '## 🔦 Lighthouse CI',
    '',
    'Scores are 0-100. Full HTML reports: download the `lighthouse-reports` workflow artifact.',
    '',
    '| Page | | Performance | Accessibility | Best practices | SEO | LCP | CLS |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

async function main() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const summary = await buildSummary();
  if (summaryPath) {
    await appendFile(summaryPath, summary);
  } else {
    console.log(summary);
  }
}

await main();
