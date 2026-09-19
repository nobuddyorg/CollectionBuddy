import { test } from '../coverage';

import { expectNoSeriousA11yViolations } from '../axe';

// Pinned so this doesn't accidentally double-count a locale switch as a
// second, unrelated accessibility state.
test.use({ locale: 'en-GB' });

test.describe('accessibility -- signed out', () => {
  test('the sign-in screen has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  // Opened directly: the local harness answers an unmatched path with a
  // generic error template of its own, which no deployed visitor ever sees.
  test('the not-found page has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await page.goto('404.html', { waitUntil: 'networkidle' });
    await expectNoSeriousA11yViolations(page, testInfo);
  });
});
