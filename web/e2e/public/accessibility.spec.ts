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

  // The not-found page is deliberately not scanned here: this suite's local
  // web server (`serve`, via scripts/serve-export.mjs) doesn't reproduce
  // GitHub Pages' behaviour of serving the export's own `out/404.html` for
  // an unmatched path -- it falls back to `serve`'s own generic error
  // template, which genuinely lacks a <title> and <html lang>. Scanning it
  // here would fail against the local harness and pass against the real
  // deployed site, for a reason that has nothing to do with the app.
});
