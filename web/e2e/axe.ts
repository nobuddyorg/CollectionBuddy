import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

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
export function axeOn(page: Page) {
  return new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(['image-alt', 'aria-valid-attr-value', 'aria-allowed-attr']);
}

/**
 * Fails the test on any serious/critical finding.
 *
 * Moderate/minor findings are surfaced (attached to the test) but not
 * blocking -- per #650, every automated finding needs human triage before it
 * gates CI, and moderate/minor axe findings are frequently ambiguous
 * (contrast on a decorative element, a landmark preference) in a way
 * serious/critical ones are not.
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
  expect(
    blocking,
    blocking
      .map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help} -- ${violation.nodes.length} node(s)`,
      )
      .join('\n'),
  ).toEqual([]);
}
