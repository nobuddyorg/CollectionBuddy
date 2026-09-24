import { appendFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Result } from 'axe-core';

/** WCAG 2.2 AA. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];

/** Excludes the rules eslint-plugin-jsx-a11y already catches statically; axe is for the rendered DOM. */
function axeOn(page: Page) {
  return new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(['image-alt', 'aria-valid-attr-value', 'aria-allowed-attr']);
}

function describeViolation(violation: Result) {
  return `${violation.id} (${violation.impact}): ${violation.help} -- ${violation.nodes.length} node(s)`;
}

// Each call appends its own heading: parallel workers cannot cheaply coordinate a shared one.
async function reportNonBlockingFindings(
  testInfo: TestInfo,
  violations: Result[],
) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath || violations.length === 0) return;

  const title = testInfo.titlePath.slice(1).join(' › ');
  const body = violations
    .map((violation) => `- ${describeViolation(violation)}`)
    .join('\n');
  await appendFile(
    summaryPath,
    `### ♿️ Accessibility -- ${title}\n\nNot blocking; needs human triage (see \`axe-violations.json\` on the test for full detail).\n\n${body}\n\n`,
  );
}

/** Serious/critical findings fail the test; moderate/minor ones are attached and summarised for triage. */
export async function expectNoSeriousA11yViolations(
  page: Page,
  testInfo: TestInfo,
) {
  const results = await axeOn(page).analyze();

  if (results.violations.length > 0) {
    await testInfo.attach('axe-violations.json', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
  }

  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  );
  const nonBlocking = results.violations.filter(
    (violation) => !blocking.includes(violation),
  );
  await reportNonBlockingFindings(testInfo, nonBlocking);

  expect(blocking, blocking.map(describeViolation).join('\n')).toEqual([]);
}
