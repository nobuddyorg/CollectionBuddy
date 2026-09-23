import { test } from '../fixture';

import { expectNoSeriousA11yViolations } from '../axe';

// Pinned, so a locale switch is not scanned as a second accessibility state.
test.use({ locale: 'en-GB' });

test.describe('accessibility -- signed out', () => {
  test('the sign-in screen has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  // Opened directly: the local harness answers an unmatched path with an error template of its own.
  test('the not-found page has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await page.goto('404.html', { waitUntil: 'networkidle' });
    await expectNoSeriousA11yViolations(page, testInfo);
  });
});
