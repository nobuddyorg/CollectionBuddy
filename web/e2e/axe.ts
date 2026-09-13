import { appendFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Result } from 'axe-core';

/** Target level per #650: WCAG 2.2 AA. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];

/**
 * Runs axe-core against the page's current state.
 *
 * Excludes rules `eslint-plugin-jsx-a11y` already catches statically (missing
 * `alt` text, invalid ARIA attributes/roles) -- axe's value here is what only
 * the rendered DOM reveals: computed contrast, focus order, the real
 * accessible-name computation, dynamic ARIA state.
 */
function axeOn(page: Page) {
  return new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(['image-alt', 'aria-valid-attr-value', 'aria-allowed-attr']);
}

function describeViolation(violation: Result) {
  return `${violation.id} (${violation.impact}): ${violation.help} -- ${violation.nodes.length} node(s)`;
}

// In CI only -- a local run has no $GITHUB_STEP_SUMMARY to write to, and
// nobody's triaging a summary file on their own machine. Each call appends
// its own heading rather than sharing one across tests, since parallel
// Playwright workers can call this concurrently and there's no cheap way to
// coordinate who writes a shared header first.
async function reportNonBlockingFindings(
  testInfo: TestInfo,
  violations: Result[],
) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath || violations.length === 0) return;

  const title = testInfo.titlePath.slice(1).join(' › ');
  const body = violations.map((v) => `- ${describeViolation(v)}`).join('\n');
  await appendFile(
    summaryPath,
    `### ♿️ Accessibility -- ${title}\n\nNot blocking; needs human triage (see \`axe-violations.json\` on the test for full detail).\n\n${body}\n\n`,
  );
}

/**
 * Fails the test on any serious/critical finding.
 *
 * Moderate/minor findings are surfaced (attached to the test, and to the
 * job summary) but not blocking -- per #650, every automated finding needs
 * human triage before it gates CI, and moderate/minor axe findings are
 * frequently ambiguous (contrast on a decorative element, a landmark
 * preference) in a way serious/critical ones are not.
 */
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
