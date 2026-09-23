// Stryker's JSON report as a markdown table, scored by mutation-testing-metrics as Stryker's own reporters are.
import { readFile, appendFile } from 'node:fs/promises';

import { calculateMutationTestMetrics } from 'mutation-testing-metrics';

const REPORT_PATH = 'reports/mutation/mutation.json';
// Must match stryker.config.mjs's thresholds.break.
const BREAK_THRESHOLD = 99;

function formatScore(score) {
  return Number.isFinite(score) ? `${score.toFixed(2)}%` : 'n/a';
}

function statusIcon(score) {
  if (!Number.isFinite(score)) return '➖'; // no mutants to score
  return score >= BREAK_THRESHOLD ? '✅' : '❌';
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
  // Worst score first.
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
    console.error('Could not read %s:', REPORT_PATH, error);
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
