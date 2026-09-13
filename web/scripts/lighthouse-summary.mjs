// Turns lhci autorun's manifest.json (one per target, written by
// scripts/lighthouse.mjs) into a markdown table for the lighthouse job's
// Actions summary. Reads each representative run's own report for the
// metrics lighthouserc.*.json actually asserts on, rather than re-deriving
// them, so this can't drift out of sync with what failed or passed.
//
// Usage: node scripts/lighthouse-summary.mjs   (after `npm run lighthouse`)
import { readFile, appendFile } from 'node:fs/promises';

// Must match the `assert` blocks in lighthouserc.signed-out.json /
// .signed-in.json -- see TEST_STRATEGY.md §12 for why the two differ.
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
    maxCls: 0.4,
  },
];

// `atLeast`/`atMost` each return an emoji, or ➖ when there's nothing to
// compare (a report that failed to produce the metric at all).
function atLeast(value, threshold) {
  if (!Number.isFinite(value)) return '➖';
  return value >= threshold ? '✅' : '❌';
}

function atMost(value, threshold) {
  if (!Number.isFinite(value)) return '➖';
  return value <= threshold ? '✅' : '❌';
}

function pct(score) {
  return Number.isFinite(score) ? `${Math.round(score * 100)}` : 'n/a';
}

async function summarizeTarget({ label, manifest, minPerformance, maxCls }) {
  let entries;
  try {
    entries = JSON.parse(await readFile(manifest, 'utf8'));
  } catch {
    return `| ${label} | _no report found_ | | | | | |`;
  }
  // lhci marks exactly one run representative per URL once numberOfRuns > 1;
  // falls back to the last run so a single-run local override still reports.
  const run = entries.find((e) => e.isRepresentativeRun) ?? entries.at(-1);
  if (!run) return `| ${label} | _no run recorded_ | | | | | |`;

  const report = JSON.parse(await readFile(run.jsonPath, 'utf8'));
  const performance = run.summary.performance;
  const cls = report.audits['cumulative-layout-shift']?.numericValue;
  const lcpMs = report.audits['largest-contentful-paint']?.numericValue;
  const lcp = Number.isFinite(lcpMs) ? `${(lcpMs / 1000).toFixed(1)}s` : 'n/a';

  return (
    [
      label,
      atLeast(performance, minPerformance),
      pct(performance),
      pct(run.summary['best-practices']),
      pct(run.summary.seo),
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
    '| Page | | Performance | Best practices | SEO | LCP | CLS |',
    '|---|---|---|---|---|---|---|',
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
