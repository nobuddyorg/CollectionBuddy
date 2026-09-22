// Turns zap-baseline's report_json.json into a markdown table for the
// zap_baseline job's Actions summary, applying .zap/rules.tsv so an alert
// the rules file ignores reads as ignored, with its reason, not as an open
// warning. Informational alerts are listed but never counted.
//
// Usage: node scripts/zap-summary.mjs --title '<heading>' <report_json.json>
import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const RULES_PATH = resolve(import.meta.dirname, '../../.zap/rules.tsv');

/** `{ [pluginId]: { threshold, reason } }` from the tsv's non-comment lines. */
function parseRules(tsv) {
  const rules = {};
  for (const line of tsv.split('\n')) {
    const match = line.match(/^(\d+)\t(FAIL|WARN|INFO|IGNORE)\t#\s*(.*)$/);
    if (match) rules[match[1]] = { threshold: match[2], reason: match[3] };
  }
  return rules;
}

function verdictFor(alert, rules) {
  if (alert.riskcode === '0') return { label: 'info', counted: false };
  const rule = rules[alert.pluginid];
  if (rule?.threshold === 'IGNORE')
    return { label: `ignored: ${rule.reason}`, counted: false };
  if (rule?.threshold === 'FAIL') return { label: '❌ FAIL', counted: true };
  return { label: '⚠️ WARN', counted: true };
}

function renderSummary(title, report, rules) {
  const alerts = report.site.flatMap((site) => site.alerts);
  const rows = alerts.map((alert) => {
    const verdict = verdictFor(alert, rules);
    return {
      line: `| ${alert.name} | ${alert.riskdesc} | ${alert.count} | ${verdict.label} |`,
      counted: verdict.counted,
    };
  });
  const open = rows.filter((row) => row.counted).length;
  const headline =
    open === 0
      ? '✅ No warning or failing alerts outside the documented ignores.'
      : `⚠️ ${open} alert(s) at WARN or FAIL.`;
  return [
    `## ${title}`,
    '',
    headline,
    '',
    '| Alert | Risk (confidence) | Instances | Verdict |',
    '|---|---|---|---|',
    ...rows.map((row) => row.line),
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const titleIndex = args.indexOf('--title');
  const title =
    titleIndex === -1 ? 'OWASP ZAP baseline scan' : args[titleIndex + 1];
  const reportPath = args.filter(
    (arg, i) => arg !== '--title' && i !== titleIndex + 1,
  )[0];
  if (!reportPath) throw new Error('report_json.json path is required');

  const [report, tsv] = await Promise.all([
    readFile(reportPath, 'utf8').then(JSON.parse),
    readFile(RULES_PATH, 'utf8'),
  ]);
  const markdown = renderSummary(title, report, parseRules(tsv));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  } else {
    process.stdout.write(markdown);
  }
}

await main();
