// Turns Stryker's JSON report into a markdown table for the mutation_test
// job's Actions summary. Uses the mutation-testing-report-schema data via
// mutation-testing-metrics (the same package Stryker's own HTML/dashboard
// reporters use to compute scores) rather than scraping console output, so
// it can't drift out of sync with what those reporters show.
//
// Usage: npm run mutation:summary   (after `npx stryker run`)
import { readFile, appendFile } from 'node:fs/promises';

import { calculateMutationTestMetrics } from 'mutation-testing-metrics';

const REPORT_PATH = 'reports/mutation/mutation.json';
// Must match stryker.config.mjs's thresholds.break.
const BREAK_THRESHOLD = 90;

function formatScore(score) {
  return Number.isFinite(score) ? `${score.toFixed(2)}%` : 'n/a';
}

function statusIcon(score) {
  if (!Number.isFinite(score)) return '➖'; // heavy minus sign -- no mutants to score
  return score >= BREAK_THRESHOLD ? '✅' : '⚠️';
}

function toRow(label, metrics) {
  return `| ${statusIcon(metrics.mutationScore)} | ${label} | ${formatScore(metrics.mutationScore)} | ${metrics.killed} | ${metrics.survived} | ${metrics.timeout} | ${metrics.noCoverage} | ${metrics.ignored} |`;
}

function collectFileRows(node, rows) {
  if (node.file) {
    rows.push({ path: node.file.name, metrics: node.metrics });
    return;
  }
  for (const child of node.childResults) collectFileRows(child, rows);
}

async function buildSummary() {
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  const { systemUnderTestMetrics: root } = calculateMutationTestMetrics(report);

  const fileRows = [];
  collectFileRows(root, fileRows);
  // Worst score first -- that's the part worth a reviewer's attention.
  fileRows.sort((a, b) => {
    const scoreA = Number.isFinite(a.metrics.mutationScore)
      ? a.metrics.mutationScore
      : -1;
    const scoreB = Number.isFinite(b.metrics.mutationScore)
      ? b.metrics.mutationScore
      : -1;
    return scoreA - scoreB;
  });

  const lines = [
    `## \u{1f9ec} Mutation testing — ${formatScore(root.metrics.mutationScore)} (break threshold: ${BREAK_THRESHOLD}%)`,
    '',
    '| | File | Score | Killed | Survived | Timeout | No coverage | Ignored |',
    '|---|---|---|---|---|---|---|---|',
    toRow('**All files**', root.metrics),
    ...fileRows.map(({ path, metrics }) => toRow(`\`${path}\``, metrics)),
    '',
    'Full interactive report: download the `mutation-report` workflow artifact.',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  let summary;
  try {
    summary = await buildSummary();
  } catch (error) {
    console.error(`Could not read ${REPORT_PATH}:`, error);
    summary = [
      '## \u{1f9ec} Mutation testing',
      '',
      `No mutation report found at \`web/${REPORT_PATH}\` -- Stryker likely failed before writing it. Check the "Run mutation testing" step above.`,
      '',
    ].join('\n');
  }

  if (summaryPath) {
    await appendFile(summaryPath, summary);
  } else {
    console.log(summary);
  }
}

await main();
